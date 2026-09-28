import asyncio

from app.config import Settings
from app.db.surreal import SurrealClient


class FakeConnection:
    def __init__(self, url: str) -> None:
        self.url = url
        self.calls: list[tuple] = []

    async def connect(self) -> None:
        self.calls.append(("connect",))

    async def use(self, namespace: str, database: str) -> None:
        self.calls.append(("use", namespace, database))

    async def create(self, table: str, data: dict) -> dict:
        self.calls.append(("create", table, data))
        return {"id": "notes:1", **data}

    async def select(self, table: str) -> list:
        self.calls.append(("select", table))
        return []

    async def query(self, sql: str, params: dict | None = None) -> list:
        self.calls.append(("query", sql, params))
        return []

    async def merge(self, record: str, data: dict) -> dict:
        self.calls.append(("merge", record, data))
        return {**data, "id": record}

    async def delete(self, record: str) -> None:
        self.calls.append(("delete", record))

    async def close(self) -> None:
        self.calls.append(("close",))


def _client() -> tuple[SurrealClient, FakeConnection]:
    settings = Settings(
        db_file="/tmp/c.db",
        db_ns="planinc",
        db_name="planinc",
        jwt_secret="s",
        port=1,
    )
    fake = FakeConnection(settings.db_url)
    return SurrealClient(settings, connection=fake), fake


def test_connect_selects_namespace_and_database_once():
    client, fake = _client()
    asyncio.run(client.connect())
    asyncio.run(client.connect())
    assert fake.calls.count(("connect",)) == 1
    assert ("use", "planinc", "planinc") in fake.calls
    assert client.is_connected is True


def test_create_delegates_to_connection():
    client, fake = _client()
    result = asyncio.run(client.create("notes", {"content": "x"}))
    assert result == {"id": "notes:1", "content": "x"}
    assert ("create", "notes", {"content": "x"}) in fake.calls


def test_select_with_where_uses_query():
    client, fake = _client()
    asyncio.run(client.select("notes", "accountId = 1"))
    assert ("query", "SELECT * FROM notes WHERE accountId = 1;", None) in fake.calls


def test_select_without_where_uses_table_select():
    client, fake = _client()
    asyncio.run(client.select("notes"))
    assert ("select", "notes") in fake.calls


def test_update_merges_rather_than_replaces():
    client, fake = _client()
    asyncio.run(client.update("accounts:1", {"apiToken": "t"}))
    assert ("merge", "accounts:1", {"apiToken": "t"}) in fake.calls
