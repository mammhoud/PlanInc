"""Real embedded-SurrealKV integration for the identity flows.

Drives the actual ``/api/auth/verify-2fa`` and OAuth authorize/callback routes
through Robyn's ``TestClient`` against the real datastore, then reopens the file
in a second process to prove the writes persisted.

Isolated in a subprocess for the same reason as ``test_surreal_integration.py``:
the SDK's embedded connection can abort during interpreter shutdown (a Rust
panic after the data is committed), so pytest's exit stays clean while the test
still asserts on the subprocess stdout.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_SCRIPT = textwrap.dedent(
    '''
    import json, sys
    from robyn import TestClient
    from app.config import Settings
    from app.db.surreal import SurrealClient
    from app.domain import oauth, totp
    from app.main import build_trpc_router, create_app
    from app.services import AppServices

    SECRET = "integration-secret-that-is-long-enough"

    def build(db_file):
        settings = Settings(
            db_file=db_file, db_ns="planinc", db_name="planinc",
            jwt_secret=SECRET, port=1111,
        )
        client = SurrealClient(settings)
        services = AppServices.from_client(client, SECRET)
        app = create_app(
            settings, router=build_trpc_router(services), services=services
        )
        return client, services.users, TestClient(app)

    async def seed(service, client):
        user = await service.create(name="root", password="pw", role="superadmin")
        secret = totp.generate_secret()
        providers = [
            {"id": "github", "clientId": "cid", "clientSecret": "sec"}
        ]
        await client.create(
            "config:1", {"key": "oauth2Providers", "config": {"value": providers}}
        )
        return user["id"], secret

    async def enable_2fa(client, secret, record_id):
        await client.create(
            "config:%d" % record_id,
            {"key": "twoFactorEnabled", "config": {"value": True}},
        )
        await client.create(
            "config:%d" % (record_id + 1),
            {"key": "twoFactorSecret", "config": {"value": secret}},
        )

    async def fake_exchange(provider, code, redirect_uri):
        return "access-token"

    async def fake_profile(provider, token):
        return {
            "providerId": "github", "externalId": "9", "username": "octo",
            "name": "Octo", "image": "x.png", "email": None,
        }

    def main():
        mode, db_file = sys.argv[1], sys.argv[2]
        client, service, tclient = build(db_file)
        loop = tclient._loop
        out = {"mode": mode}

        if mode == "write":
            user_id, secret = loop.run_until_complete(seed(service, client))

            # OAuth runs first, while 2FA is disabled, to prove the success path.
            start = tclient.get("/api/auth/github", headers={"host": "app.test"})
            out["oauth_start"] = start.status_code
            start_location = start.headers.get("location") or ""
            out["oauth_start_location"] = start_location[:60]

            oauth.exchange_code = fake_exchange
            oauth.fetch_profile = fake_profile
            state = oauth.sign_state(SECRET, "github")
            callback = tclient.get(
                "/api/auth/callback/github",
                query_params={"code": "abc", "state": state},
                headers={"host": "app.test"},
            )
            location = callback.headers.get("location") or ""
            out["oauth_callback"] = callback.status_code
            out["oauth_success"] = "success=true" in location

            created = loop.run_until_complete(service.by_name("octo"))
            out["oauth_account"] = bool(created and created.get("loginType") == "oauth")

            # Enabling 2FA must divert a subsequent OAuth sign-in to the handoff.
            loop.run_until_complete(enable_2fa(client, secret, 2))
            state2 = oauth.sign_state(SECRET, "github")
            callback2 = tclient.get(
                "/api/auth/callback/github",
                query_params={"code": "abc", "state": state2},
                headers={"host": "app.test"},
            )
            location2 = callback2.headers.get("location") or ""
            out["oauth_requires_two_factor"] = "requiresTwoFactor=true" in location2

            twofa = tclient.post(
                "/api/auth/verify-2fa",
                json_data={"userId": user_id, "code": totp.generate(secret)},
            )
            out["twofa_status"] = twofa.status_code
            out["twofa_token"] = "token" in twofa.text

            stored = loop.run_until_complete(service.by_id(user_id))
            out["twofa_api_token_stored"] = bool(stored.get("apiToken"))
        else:
            stored = loop.run_until_complete(service.by_id(1))
            out["persisted_api_token"] = bool(stored and stored.get("apiToken"))
            created = loop.run_until_complete(service.by_name("octo"))
            out["persisted_oauth_account"] = bool(created)

        print(json.dumps(out), flush=True)

    main()
    '''
)


def _run(db_file: Path, mode: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", _SCRIPT, mode, str(db_file)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )


def _last_json(stdout: str) -> dict:
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    raise AssertionError(f"no JSON payload in subprocess stdout:\n{stdout}")


def test_2fa_and_oauth_flows_against_embedded_surrealkv(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTHONPATH", str(PROJECT_ROOT))
    db_file = tmp_path / "identity.db"

    write = _run(db_file, "write")
    assert write.stdout or write.stderr, write.stderr
    payload = _last_json(write.stdout)

    assert payload["twofa_status"] == 200
    assert payload["twofa_token"] is True
    assert payload["twofa_api_token_stored"] is True

    assert payload["oauth_start"] == 302
    assert payload["oauth_start_location"].startswith(
        "https://github.com/login/oauth/authorize"
    )
    assert payload["oauth_callback"] == 302
    assert payload["oauth_success"] is True
    assert payload["oauth_account"] is True
    # Once 2FA is enabled, the next OAuth sign-in must divert to the handoff.
    assert payload["oauth_requires_two_factor"] is True

    assert db_file.exists()

    read = _run(db_file, "read")
    persisted = _last_json(read.stdout)
    assert persisted["persisted_api_token"] is True
    assert persisted["persisted_oauth_account"] is True
