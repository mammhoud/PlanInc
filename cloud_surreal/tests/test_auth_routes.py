import asyncio
import json

from robyn import TestClient as RobynTestClient

from app.config import Settings
from app.domain.users import UserService
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "auth-secret-that-is-long-enough!!"
SETTINGS = Settings(
    db_file="/tmp/auth.db",
    db_ns="planinc",
    db_name="planinc",
    jwt_secret=SECRET,
    port=1111,
)


def _setup() -> tuple[RobynTestClient, UserService, FakeDb]:
    db = FakeDb()
    services = AppServices.from_client(db, SECRET)
    app = create_app(SETTINGS, router=build_trpc_router(services), services=services)
    return RobynTestClient(app), services.users, db


def _login(client, name: str, password: str):
    return client.post(
        "/api/auth/login",
        body=json.dumps({"username": name, "password": password}),
        headers={"content-type": "application/json"},
    )


def test_login_success_returns_user_and_token():
    client, service, _ = _setup()
    asyncio.run(service.create(name="alice", password="pw", role="superadmin"))

    response = _login(client, "alice", "pw")
    payload = json.loads(response.text)
    assert response.status_code == 200
    assert payload["user"]["name"] == "alice"
    assert payload["token"]


def test_login_failure_returns_401():
    client, service, _ = _setup()
    asyncio.run(service.create(name="bob", password="pw"))
    response = _login(client, "bob", "nope")
    assert response.status_code == 401
    assert json.loads(response.text)["error"]


def test_login_reports_two_factor_handoff():
    client, service, db = _setup()
    db.seed("config", 1, {"key": "twoFactorEnabled", "config": {"value": True}})
    asyncio.run(service.create(name="carol", password="pw"))

    response = _login(client, "carol", "pw")
    payload = json.loads(response.text)
    assert response.status_code == 200
    assert payload == {"requiresTwoFactor": True, "userId": 1}


def test_profile_requires_and_accepts_a_bearer_token():
    client, service, _ = _setup()
    asyncio.run(service.create(name="dave", password="pw", role="user"))
    token = json.loads(_login(client, "dave", "pw").text)["token"]

    anonymous = client.get("/api/auth/profile")
    assert anonymous.status_code == 401

    authenticated = client.get(
        "/api/auth/profile", headers={"authorization": f"Bearer {token}"}
    )
    assert authenticated.status_code == 200
    assert json.loads(authenticated.text)["user"]["name"] == "dave"


def test_validate_token_and_logout():
    client, service, _ = _setup()
    asyncio.run(service.create(name="erin", password="pw"))
    token = json.loads(_login(client, "erin", "pw").text)["token"]

    valid = client.get(
        "/api/auth/validate-token", headers={"authorization": f"Bearer {token}"}
    )
    assert json.loads(valid.text)["valid"] is True

    invalid = client.get(
        "/api/auth/validate-token", headers={"authorization": "Bearer nope"}
    )
    assert invalid.status_code == 401

    logout = client.post("/api/auth/logout", json_data={})
    assert json.loads(logout.text) == {"message": "Logout successful"}


def test_verify_2fa_accepts_a_valid_code_and_marks_the_token():
    import jwt

    from app.domain import totp

    client, service, db = _setup()
    secret = totp.generate_secret()
    db.seed("config", 1, {"key": "twoFactorSecret", "config": {"value": secret}})
    asyncio.run(service.create(name="frank", password="pw"))

    response = client.post(
        "/api/auth/verify-2fa",
        json_data={"userId": 1, "code": totp.generate(secret)},
    )
    payload = json.loads(response.text)
    assert response.status_code == 200
    assert payload["user"]["name"] == "frank"
    claims = jwt.decode(payload["token"], SETTINGS.jwt_secret, algorithms=["HS256"])
    assert claims["twoFactorVerified"] is True


def test_verify_2fa_rejects_a_bad_code_and_missing_params():
    client, service, db = _setup()
    db.seed(
        "config",
        1,
        {"key": "twoFactorSecret", "config": {"value": "JBSWY3DPEHPK3PXP"}},
    )
    asyncio.run(service.create(name="gina", password="pw"))

    bad = client.post("/api/auth/verify-2fa", json_data={"userId": 1, "code": "000000"})
    assert bad.status_code == 401

    missing = client.post("/api/auth/verify-2fa", json_data={})
    assert missing.status_code == 400


def test_oauth_start_redirects_to_the_provider():
    client, service, db = _setup()
    db.seed(
        "config",
        1,
        {
            "key": "oauth2Providers",
            "config": {
                "value": [{"id": "github", "clientId": "cid", "clientSecret": "s"}]
            },
        },
    )
    response = client.get("/api/auth/github", headers={"host": "app.test"})
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://github.com/login/oauth/authorize?")
    assert "client_id=cid" in location
    assert "state=" in location


def test_oauth_start_unknown_provider_is_404():
    client, _, _ = _setup()
    response = client.get("/api/auth/nope", headers={"host": "app.test"})
    assert response.status_code == 404


def test_oauth_callback_rejects_a_forged_state():
    client, _, _ = _setup()
    response = client.get(
        "/api/auth/callback/github",
        query_params={"code": "abc", "state": "garbage"},
        headers={"host": "app.test"},
    )
    assert response.status_code == 302
    assert "error=" in response.headers["location"]


def test_oauth_callback_creates_an_account_and_returns_a_token(monkeypatch):
    from app.domain import oauth

    client, service, db = _setup()
    db.seed(
        "config",
        1,
        {
            "key": "oauth2Providers",
            "config": {
                "value": [{"id": "github", "clientId": "cid", "clientSecret": "s"}]
            },
        },
    )

    async def fake_exchange(_provider, _code, _redirect_uri):
        return "access-token"

    async def fake_profile(_provider, _token):
        return {
            "providerId": "github",
            "externalId": "7",
            "username": "octo",
            "name": "Octo",
            "image": "a.png",
            "email": None,
        }

    monkeypatch.setattr(oauth, "exchange_code", fake_exchange)
    monkeypatch.setattr(oauth, "fetch_profile", fake_profile)

    state = oauth.sign_state(SETTINGS.jwt_secret, "github")
    response = client.get(
        "/api/auth/callback/github",
        query_params={"code": "abc", "state": state},
        headers={"host": "app.test"},
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert "success=true" in location
    assert "token=" in location

    created = asyncio.run(service.by_name("octo"))
    assert created is not None
    assert created["loginType"] == "oauth"
