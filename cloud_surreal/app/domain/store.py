"""Reusable account-scoped record store.

Every planning-family entity shares the same shape: numeric ids from a per-table
counter, an ``accountId`` owner, ``createdAt``/``updatedAt`` timestamps, and
reads that must never cross accounts. ``AccountStore`` centralises that so the
entity services hold only their own business rules.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ..db.ids import next_id
from .errors import DomainError
from .users import normalize_id


def now() -> datetime:
    return datetime.now(UTC)


def normalize_record(row: dict) -> dict:
    record = dict(row)
    record["id"] = normalize_id(record.get("id"))
    if "accountId" in record:
        record["accountId"] = normalize_id(record.get("accountId"))
    return record


class AccountStore:
    """CRUD scoped to one account, backed by a single SurrealDB table."""

    table: str = ""

    def __init__(self, client: Any, table: str | None = None) -> None:
        self._client = client
        if table is not None:
            self.table = table

    async def all(self) -> list[dict]:
        return [normalize_record(row) for row in await self._client.select(self.table)]

    async def scoped(self, account_id: int, **equals: Any) -> list[dict]:
        rows = [row for row in await self.all() if row.get("accountId") == account_id]
        if equals:
            rows = [
                row
                for row in rows
                if all(row.get(key) == value for key, value in equals.items())
            ]
        return rows

    async def by_id(self, record_id: Any) -> dict | None:
        target = normalize_id(record_id)
        if target is None:
            return None
        for row in await self.all():
            if row["id"] == target:
                return row
        return None

    async def get(self, record_id: Any, account_id: int) -> dict:
        row = await self.by_id(record_id)
        if row is None or row.get("accountId") != account_id:
            raise DomainError("NOT_FOUND", f"{self.table} record not found")
        return row

    async def create(self, account_id: int, fields: dict) -> dict:
        new_id = await next_id(self._client, self.table)
        stamp = now()
        record = {
            **fields,
            "accountId": account_id,
            "createdAt": stamp,
            "updatedAt": stamp,
        }
        created = await self._client.create(f"{self.table}:{new_id}", record)
        if isinstance(created, list):
            created = created[0] if created else record
        return normalize_record({**record, **(created or {})})

    async def update(self, record_id: Any, account_id: int, patch: dict) -> dict:
        current = await self.get(record_id, account_id)
        if not patch:
            return current
        payload = {**patch, "updatedAt": now()}
        await self._client.update(f"{self.table}:{current['id']}", payload)
        return normalize_record({**current, **payload})

    async def delete(self, record_id: Any, account_id: int) -> bool:
        current = await self.get(record_id, account_id)
        await self._client.delete(f"{self.table}:{current['id']}")
        return True
