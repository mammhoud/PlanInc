import asyncio
import json

from robyn import TestClient as RobynTestClient

from app.auth.jwt import issue_api_token
from app.config import Settings
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "notes-secret-that-is-long-enough!!"
SETTINGS = Settings(
    db_file="/tmp/notes.db",
    db_ns="planinc",
    db_name="planinc",
    jwt_secret=SECRET,
    port=1111,
)


def _setup() -> tuple[RobynTestClient, AppServices, FakeDb]:
    db = FakeDb()
    services = AppServices.from_client(db, SECRET)
    app = create_app(SETTINGS, router=build_trpc_router(services), services=services)
    return RobynTestClient(app), services, db


def _token(account_id: int, role: str = "user") -> str:
    return issue_api_token(SECRET, account_id, f"user{account_id}", role)


def _post(client, path: str, payload: dict, token: str | None = None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return client.post(f"/api/trpc/{path}", body=json.dumps(payload), headers=headers)


def _data(response):
    return json.loads(response.text)["result"]["data"]["json"]


def _error_code(response) -> str:
    return json.loads(response.text)["error"]["json"]["data"]["code"]


def test_upsert_and_list_round_trip():
    client, _, _ = _setup()
    token = _token(1)

    created = _data(
        _post(
            client,
            "notes.upsert",
            {"json": {"content": "hello", "type": "note"}},
            token,
        )
    )
    assert created["content"] == "hello"
    assert created["accountId"] == 1

    listed = _data(_post(client, "notes.list", {"json": {}}, token))
    assert [row["id"] for row in listed] == [created["id"]]


def test_notes_are_isolated_between_accounts():
    client, services, _ = _setup()
    asyncio.run(services.users.create(name="one", password="pw"))
    asyncio.run(services.users.create(name="two", password="pw"))

    mine = _data(_post(client, "notes.upsert", {"json": {"content": "one"}}, _token(1)))

    other_list = _data(_post(client, "notes.list", {"json": {}}, _token(2)))
    assert other_list == []

    response = _post(client, "notes.detail", {"json": {"id": mine["id"]}}, _token(2))
    assert _error_code(response) == "NOT_FOUND"

    same_name_other = _data(
        _post(client, "notes.upsert", {"json": {"content": "one"}}, _token(2))
    )
    assert same_name_other["id"] != mine["id"]
    mine_list = _data(_post(client, "notes.list", {"json": {}}, _token(1)))
    assert mine_list[0]["content"] == "one"


def test_notes_require_authentication():
    client, _, _ = _setup()
    response = _post(client, "notes.list", {"json": {}})
    assert json.loads(response.text)["error"]["json"]["data"]["code"] == "UNAUTHORIZED"


def test_public_detail_only_exposes_shared_notes():
    client, _, _ = _setup()
    token = _token(1)
    private = _data(_post(client, "notes.upsert", {"json": {"content": "p"}}, token))
    shared = _data(
        _post(
            client,
            "notes.upsert",
            {"json": {"content": "s", "isShare": True}},
            token,
        )
    )

    hidden = _post(client, "notes.publicDetail", {"json": {"id": private["id"]}})
    assert _data(hidden) is None
    public = _data(_post(client, "notes.publicDetail", {"json": {"id": shared["id"]}}))
    assert public["content"] == "s"


def test_review_procedures():
    client, _, _ = _setup()
    token = _token(1)
    note = _data(_post(client, "notes.upsert", {"json": {"content": "r"}}, token))

    reviewed = _data(
        _post(client, "notes.reviewNote", {"json": {"id": note["id"]}}, token)
    )
    assert reviewed["isReviewed"] is True
    stats = _data(_post(client, "notes.reviewStats", {"json": {}}, token))
    assert stats == {"total": 1, "reviewed": 1, "pending": 0}


def test_collection_lists_are_account_scoped():
    client, _, db = _setup()
    token = _token(1)
    db.seed("tag", 1, {"accountId": 1, "name": "mine"})
    db.seed("tag", 2, {"accountId": 2, "name": "theirs"})
    db.seed("comments", 1, {"accountId": 1, "noteId": 1, "content": "hi"})
    db.seed("comments", 2, {"accountId": 2, "noteId": 1, "content": "no"})
    db.seed("attachments", 1, {"accountId": 1, "noteId": 1, "name": "a.png"})
    db.seed("attachments", 2, {"accountId": 2, "noteId": 1, "name": "b.png"})

    tags = _data(_post(client, "tags.list", {"json": {}}, token))
    assert [row["name"] for row in tags] == ["mine"]

    comments = _data(_post(client, "comments.list", {"json": {"noteId": 1}}, token))
    assert [row["content"] for row in comments] == ["hi"]

    attachments = _data(
        _post(client, "attachments.list", {"json": {"noteId": 1}}, token)
    )
    assert [row["name"] for row in attachments] == ["a.png"]
