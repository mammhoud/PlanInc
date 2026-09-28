"""In-memory double for ``SurrealClient``.

Implements only the surface the identity slice uses (``select``, ``create``,
``update``, ``delete``, and the counter ``query``) so service and router tests
run without a real embedded datastore. Real datastore persistence is covered by
``test_surreal_integration.py``.
"""

from __future__ import annotations

import re
from typing import Any

_SEQ = re.compile(r"seq:(\w+)")


def _split(record: str) -> tuple[str, int | None]:
    if ":" in record:
        table, _, raw = record.partition(":")
        try:
            return table, int(raw)
        except ValueError:
            return table, None
    return record, None


class FakeDb:
    def __init__(self) -> None:
        self.tables: dict[str, dict[int, dict]] = {}
        self.counters: dict[str, int] = {}
        self.calls: list[tuple] = []

    def _table(self, name: str) -> dict[int, dict]:
        return self.tables.setdefault(name, {})

    async def query(self, sql: str, params: dict | None = None) -> Any:
        self.calls.append(("query", sql, params))
        match = _SEQ.search(sql)
        if not match:
            return []
        table = match.group(1)
        self.counters[table] = self.counters.get(table, 0) + 1
        value = self.counters[table]
        return [[{"n": value}], [value]]

    async def select(self, table: str, where: str | None = None) -> list[dict]:
        self.calls.append(("select", table, where))
        return [
            {"id": f"{table}:{record_id}", **data}
            for record_id, data in self._table(table).items()
        ]

    async def create(self, record: str, data: dict) -> dict:
        self.calls.append(("create", record, data))
        table, record_id = _split(record)
        if record_id is None:
            self.counters[table] = self.counters.get(table, 0) + 1
            record_id = self.counters[table]
        self._table(table)[record_id] = dict(data)
        return {"id": f"{table}:{record_id}", **data}

    async def update(self, record: str, data: dict) -> dict:
        self.calls.append(("update", record, data))
        table, record_id = _split(record)
        assert record_id is not None
        current = self._table(table).setdefault(record_id, {})
        current.update(data)
        return {"id": f"{table}:{record_id}", **current}

    async def delete(self, record: str) -> None:
        self.calls.append(("delete", record))
        table, record_id = _split(record)
        if record_id is not None:
            self._table(table).pop(record_id, None)

    # Convenience for seeding a record without going through the service.
    def seed(self, table: str, record_id: int, data: dict) -> None:
        self._table(table)[record_id] = dict(data)
