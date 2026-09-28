"""Numeric record-id allocation.

The TS server stores numeric ids and allocates them from a per-table counter
record (``server/db.ts`` ``nextId``): ``seq:<table>`` holding ``n``. Records are
then created as ``<table>:<n>``. Reproducing this is a correctness requirement,
not a convenience: the frontend and the JWT ``sub`` claim both assume numeric
account ids.
"""

from __future__ import annotations

from typing import Any

_TEMPLATE = (
    "UPSERT seq:{table} SET n = (IF n IS NONE {{ 1 }} ELSE {{ n + 1 }});"
    " SELECT VALUE n FROM seq:{table};"
)


def _statements(rows: Any) -> list[Any]:
    """Normalize a query response into a list of per-statement result lists."""
    if rows is None:
        return []
    if isinstance(rows, list):
        if rows and all(isinstance(item, list) for item in rows):
            return rows
        return [rows]
    if isinstance(rows, dict) and "result" in rows:
        return _statements(rows["result"])
    return [rows]


def _first_value(result: Any) -> Any:
    if isinstance(result, list):
        return result[0] if result else None
    return result


def _counter_value(value: Any) -> int | None:
    if isinstance(value, dict):
        value = value.get("n")
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


async def next_id(client: Any, table: str) -> int:
    """Allocate the next numeric id for ``table``."""
    rows = await client.query(_TEMPLATE.format(table=table))
    statements = _statements(rows)
    if statements:
        candidate = _counter_value(_first_value(statements[-1]))
        if candidate is not None:
            return candidate
    raise RuntimeError(f"failed to allocate id for {table}")
