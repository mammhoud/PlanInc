import json

from robyn import TestClient as RobynTestClient

from app.auth.jwt import issue_api_token
from app.config import Settings
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "planning-secret-that-is-long-enough!"
SETTINGS = Settings(
    db_file="/tmp/planning.db",
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


def _code(response) -> str:
    return json.loads(response.text)["error"]["json"]["data"]["code"]


def test_ticket_crud_round_trip():
    client, _, _ = _setup()
    token = _token(1)

    created = _data(
        _post(
            client,
            "tickets.create",
            {"json": {"title": "T", "priority": "high"}},
            token,
        )
    )
    assert created["tags"] == []

    updated = _data(
        _post(
            client,
            "tickets.update",
            {"json": {"id": created["id"], "status": "done"}},
            token,
        )
    )
    assert updated["status"] == "done"
    assert updated["title"] == "T"

    listed = _data(_post(client, "tickets.list", {"json": {}}, token))
    assert [t["id"] for t in listed] == [created["id"]]

    _data(_post(client, "tickets.delete", {"json": {"id": created["id"]}}, token))
    assert _data(_post(client, "tickets.list", {"json": {}}, token)) == []


def test_planning_entities_are_isolated_between_accounts():
    client, _, _ = _setup()
    ticket = _data(
        _post(client, "tickets.create", {"json": {"title": "mine"}}, _token(1))
    )
    assert _data(_post(client, "tickets.list", {"json": {}}, _token(2))) == []
    assert (
        _code(_post(client, "tickets.get", {"json": {"id": ticket["id"]}}, _token(2)))
        == "NOT_FOUND"
    )


def test_study_review_and_due_list():
    client, _, _ = _setup()
    token = _token(1)
    card = _data(
        _post(
            client,
            "study.create",
            {"json": {"title": "Q", "question": "q", "answer": "a"}},
            token,
        )
    )
    due = _data(_post(client, "study.dueList", {"json": {}}, token))
    assert [row["id"] for row in due] == [card["id"]]

    reviewed = _data(
        _post(
            client,
            "study.review",
            {"json": {"id": card["id"], "rating": "good"}},
            token,
        )
    )
    assert reviewed["srsReps"] == 1


def test_categories_seed_and_list():
    client, _, _ = _setup()
    token = _token(1)
    seeded = _data(
        _post(client, "planningCategories.seedDefaults", {"json": {}}, token)
    )
    assert [row["name"] for row in seeded] == ["Now", "Next", "Later"]
    listed = _data(_post(client, "planningCategories.list", {"json": {}}, token))
    assert len(listed) == 3
    assert listed[0]["isDefault"] is True


def test_planning_link_requires_owned_entities():
    client, _, db = _setup()
    token = _token(1)
    db.seed("notes", 1, {"accountId": 1, "content": "n"})
    db.seed("tickets", 2, {"accountId": 1, "title": "t"})

    link = _data(
        _post(
            client,
            "planningLinks.create",
            {
                "json": {
                    "sourceType": "note",
                    "sourceId": 1,
                    "targetType": "ticket",
                    "targetId": 2,
                }
            },
            token,
        )
    )
    assert link["sourceType"] == "note"
    assert len(_data(_post(client, "planningLinks.list", {"json": {}}, token))) == 1

    missing = _post(
        client,
        "planningLinks.create",
        {
            "json": {
                "sourceType": "note",
                "sourceId": 1,
                "targetType": "ticket",
                "targetId": 999,
            }
        },
        token,
    )
    assert _code(missing) == "NOT_FOUND"


def test_task_procedures_require_superadmin():
    client, _, _ = _setup()
    forbidden = _post(client, "task.list", {"json": {}}, _token(1, "user"))
    assert _code(forbidden) == "FORBIDDEN"
    allowed = _data(_post(client, "task.list", {"json": {}}, _token(1, "superadmin")))
    assert allowed == []
