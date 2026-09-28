import json
from datetime import UTC, datetime

from robyn import TestClient as RobynTestClient

from app.auth.jwt import AuthError
from app.config import Settings
from app.main import create_app
from app.transport.superjson import SuperJson
from app.transport.trpc import Router

SETTINGS = Settings(
    db_file="/tmp/trpc.db",
    db_ns="planinc",
    db_name="planinc",
    jwt_secret="secret",
    port=1111,
)


def _router() -> Router:
    router = Router()

    @router.procedure("ping")
    async def ping(input_: dict, _claims) -> dict:
        return {"echo": input_}

    @router.procedure("note.when")
    async def when(_input: dict, _claims) -> dict:
        return {"createdAt": datetime(2024, 1, 1, tzinfo=UTC)}

    @router.procedure("note.protected")
    async def protected(_input: dict, claims) -> dict:
        if claims is None:
            raise AuthError("sign in required")
        return {"ok": True}

    return router


def _client() -> RobynTestClient:
    return RobynTestClient(create_app(SETTINGS, _router()))


def _post(client: RobynTestClient, path: str, body: dict, headers: dict | None = None):
    return client.post(
        f"/api/trpc/{path}",
        body=json.dumps(body),
        headers={"content-type": "application/json", **(headers or {})},
    )


def test_batched_call_roundtrips_superjson_envelope():
    response = _post(_client(), "ping?batch=1", {"0": {"json": {"a": 1}}})
    payload = json.loads(response.text)
    assert payload == [{"result": {"data": {"json": {"echo": {"a": 1}}}}}]


def test_non_batched_call_returns_single_object():
    response = _post(_client(), "ping", {"json": {"a": 2}})
    payload = json.loads(response.text)
    assert payload == {"result": {"data": {"json": {"echo": {"a": 2}}}}}


def test_batch_mixes_success_and_error():
    response = _post(
        _client(),
        "ping,missing?batch=1",
        {"0": {"json": {"a": 1}}, "1": {"json": {}}},
    )
    payload = json.loads(response.text)
    assert payload[0]["result"]["data"]["json"] == {"echo": {"a": 1}}
    assert payload[1]["error"]["json"]["data"]["code"] == "NOT_FOUND"
    assert payload[1]["error"]["json"]["data"]["path"] == "missing"


def test_empty_batch_returns_empty_array():
    response = _post(_client(), "?batch=1", {})
    assert json.loads(response.text) == []


def test_invalid_token_fails_closed():
    response = _post(
        _client(),
        "ping?batch=1",
        {"0": {"json": {}}},
        headers={"authorization": "Bearer not-a-jwt"},
    )
    payload = json.loads(response.text)
    assert payload[0]["error"]["json"]["data"]["code"] == "UNAUTHORIZED"


def test_procedure_can_require_auth():
    response = _post(_client(), "note.protected", {"json": {}})
    payload = json.loads(response.text)
    assert payload["error"]["json"]["data"]["code"] == "UNAUTHORIZED"


def test_dates_are_encoded_with_superjson_meta():
    response = _post(_client(), "note.when", {"json": {}})
    payload = json.loads(response.text)
    data = payload["result"]["data"]
    assert data["meta"]["values"] == {"createdAt": ["Date"]}
    assert data["json"]["createdAt"].startswith("2024-01-01T00:00:00.000")


def test_get_uses_input_query_param():
    client = _client()
    response = client.get(
        "/api/trpc/ping",
        query_params={"input": json.dumps({"json": {"a": 3}})},
    )
    payload = json.loads(response.text)
    assert payload == {"result": {"data": {"json": {"echo": {"a": 3}}}}}


def test_superjson_roundtrip_plain_and_dates():
    original = {"a": 1, "when": datetime(2023, 5, 6, 7, 8, tzinfo=UTC)}
    encoded = SuperJson.encode(original)
    assert SuperJson.decode(encoded) == original
    assert SuperJson.decode({"json": {"b": 2}}) == {"b": 2}
