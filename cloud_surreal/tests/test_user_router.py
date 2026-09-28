import asyncio
import json

from robyn import TestClient as RobynTestClient

from app.auth.jwt import issue_api_token
from app.config import Settings
from app.domain.users import UserService
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "router-secret-that-is-long-enough!"
SETTINGS = Settings(
    db_file="/tmp/user.db",
    db_ns="planinc",
    db_name="planinc",
    jwt_secret=SECRET,
    port=1111,
)


def _setup() -> tuple[RobynTestClient, UserService, FakeDb]:
    db = FakeDb()
    services = AppServices.from_client(db, SECRET)
    app = create_app(
        SETTINGS, router=build_trpc_router(services), services=services
    )
    return RobynTestClient(app), services.users, db


def _post(client, path: str, payload: dict, token: str | None = None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return client.post(
        f"/api/trpc/{path}", body=json.dumps(payload), headers=headers
    )


def _data(response) -> dict:
    return json.loads(response.text)["result"]["data"]["json"]


def test_login_returns_a_token_and_public_profile():
    client, service, _ = _setup()
    asyncio.run(service.create(name="alice", password="pw", role="superadmin"))

    response = _post(
        client, "users.login", {"json": {"name": "alice", "password": "pw"}}
    )
    data = _data(response)
    assert data["name"] == "alice"
    assert data["role"] == "superadmin"
    assert data["token"]


def test_login_with_wrong_password_is_unauthorized():
    client, service, _ = _setup()
    asyncio.run(service.create(name="bob", password="pw"))

    response = _post(
        client, "users.login", {"json": {"name": "bob", "password": "bad"}}
    )
    error = json.loads(response.text)["error"]["json"]
    assert error["data"]["code"] == "UNAUTHORIZED"


def test_list_requires_superadmin():
    client, service, _ = _setup()
    asyncio.run(service.create(name="root", password="pw", role="superadmin"))
    asyncio.run(service.create(name="user", password="pw", role="user"))

    user_token = issue_api_token(SECRET, 2, "user", "user")
    forbidden = _post(client, "users.list", {"json": {}}, token=user_token)
    assert json.loads(forbidden.text)["error"]["json"]["data"]["code"] == "FORBIDDEN"

    root_token = issue_api_token(SECRET, 1, "root", "superadmin")
    allowed = _post(client, "users.list", {"json": {}}, token=root_token)
    users = _data(allowed)
    assert {u["name"] for u in users} == {"root", "user"}


def test_register_makes_the_first_account_a_superadmin():
    client, service, _ = _setup()
    response = _post(
        client, "users.register", {"json": {"name": "first", "password": "pw"}}
    )
    assert _data(response) is True
    assert asyncio.run(service.count()) == 1
    assert asyncio.run(service.by_name("first"))["role"] == "superadmin"


def test_detail_defaults_to_the_caller_and_hides_foreign_tokens():
    client, service, _ = _setup()

    async def seed():
        me = await service.create(name="me", password="pw", role="superadmin")
        await service.issue_and_store_api_token(me)
        await service.create(name="other", password="pw", role="user")

    asyncio.run(seed())

    token = issue_api_token(SECRET, 1, "me", "superadmin")
    mine = _data(_post(client, "users.detail", {"json": {}}, token=token))
    assert mine["id"] == 1
    assert mine["token"]

    others = _data(_post(client, "users.detail", {"json": {"id": 2}}, token=token))
    assert others["id"] == 2
    assert others["token"] == ""


def test_public_user_list_omits_sensitive_fields():
    client, service, _ = _setup()
    asyncio.run(service.create(name="p", password="pw"))
    users = _data(_post(client, "users.publicUserList", {"json": {}}))
    assert set(users[0]) == {"id", "nickname", "image", "description"}


def test_generate_and_verify_2fa_procedures():
    from app.domain import totp

    client, service, _ = _setup()
    asyncio.run(service.create(name="h", password="pw"))
    token = issue_api_token(SECRET, 1, "h", "user")

    generated = _data(
        _post(client, "users.generate2FASecret", {"json": {"name": "h"}}, token=token)
    )
    assert generated["secret"]
    assert generated["qrCode"].startswith("otpauth://totp/")

    inputs = {
        "json": {
            "token": totp.generate(generated["secret"]),
            "secret": generated["secret"],
        }
    }
    verified = _data(_post(client, "users.verify2FAToken", inputs, token=token))
    assert verified is True

    rejected = _post(
        client,
        "users.verify2FAToken",
        {"json": {"token": "000000", "secret": generated["secret"]}},
        token=token,
    )
    code = json.loads(rejected.text)["error"]["json"]["data"]["code"]
    assert code == "INTERNAL_SERVER_ERROR"
