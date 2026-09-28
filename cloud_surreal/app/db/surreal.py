"""The only module that talks to SurrealDB.

Uses the Python SDK's embedded connection against the existing SurrealKV file,
so no separate database container or child process is required.

Verified SDK semantics (see ``tests/test_surreal_client.py`` and
``tests/test_surreal_integration.py``):

  - ``create(record, data)`` accepts an explicit ``table:id`` (what the numeric
    id allocator produces) and returns a ``dict``; without an id the SDK mints a
    random ``RecordID``, so callers that need numeric ids must pass one.
  - ``merge`` is the Prisma-style patch; ``update`` would *replace* the record
    and drop absent fields, so this wrapper never calls it.
  - ``select(table)`` returns a flat ``list[dict]`` whose ``id`` is a
    ``RecordID`` (stringify to ``table:id``); ``select(table, where)`` goes
    through ``query`` and is also flattened by the SDK for a single statement.
  - a multi-statement ``query`` returns a list of per-statement result lists,
    which ``db/ids.py`` unwraps.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from surrealdb import AsyncEmbeddedSurrealConnection

from ..config import Settings

ConnectionFactory = Callable[[str], Any]


class SurrealClient:
    """Thin wrapper: connect lazily, namespace/database per Settings."""

    def __init__(
        self,
        settings: Settings,
        connection_factory: ConnectionFactory | None = None,
        connection: Any | None = None,
    ) -> None:
        self._settings = settings
        self._factory: ConnectionFactory = (
            connection_factory or AsyncEmbeddedSurrealConnection
        )
        self._db = connection
        self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def connect(self) -> None:
        if self._connected:
            return
        if self._db is None:
            self._db = self._factory(self._settings.db_url)
        await self._db.connect()
        await self._db.use(self._settings.db_ns, self._settings.db_name)
        self._connected = True

    async def close(self) -> None:
        if self._db is not None and self._connected:
            await self._db.close()
        self._connected = False

    async def query(self, sql: str, params: dict | None = None) -> Any:
        await self.connect()
        if params is None:
            return await self._db.query(sql)
        return await self._db.query(sql, params)

    async def create(self, table: str, data: dict) -> Any:
        await self.connect()
        return await self._db.create(table, data)

    async def select(self, table: str, where: str | None = None) -> Any:
        """Return rows for ``table``, optionally filtered by a raw SQL ``where``.

        ``where`` is interpolated verbatim: pass only trusted, server-built
        fragments, never request-supplied text.
        """
        await self.connect()
        if where:
            return await self._db.query(f"SELECT * FROM {table} WHERE {where};")
        return await self._db.select(table)

    async def update(self, record: str, data: dict) -> Any:
        """Patch ``record`` with ``data``, preserving fields not present.

        The SDK's ``update`` treats ``data`` as full content and replaces the
        record (it silently dropped fields such as ``name``/``role``), while the
        TS server's ``db.x.update`` is a Prisma-style merge. ``merge`` matches
        that contract.
        """
        await self.connect()
        return await self._db.merge(record, data)

    async def delete(self, record: str) -> Any:
        await self.connect()
        return await self._db.delete(record)
