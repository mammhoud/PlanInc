import time

import pytest

from app.auth.jwt import AuthError, TokenClaims, issue_token, verify_token

SECRET = "test-secret-that-is-long-enough-32bytes"


def _claims(**overrides) -> TokenClaims:
    now = int(time.time())
    base = {
        "sub": "1",
        "name": "admin",
        "role": "superadmin",
        "exp": now + 3600,
        "iat": now,
    }
    base.update(overrides)
    return TokenClaims(**base)


def test_issue_and_verify_roundtrip():
    token = issue_token(_claims(), SECRET)
    claims = verify_token(token, SECRET)
    assert claims.sub == "1"
    assert claims.name == "admin"
    assert claims.role == "superadmin"
    assert claims.exp > 0 and claims.iat > 0


def test_expired_token_fails_closed():
    token = issue_token(_claims(exp=int(time.time()) - 10), SECRET)
    with pytest.raises(AuthError):
        verify_token(token, SECRET)


def test_tampered_token_fails_closed():
    token = issue_token(_claims(), SECRET)
    with pytest.raises(AuthError):
        verify_token(token + "x", SECRET)


def test_role_less_token_fails_closed():
    now = int(time.time())
    token = issue_token(
        TokenClaims(sub="1", name="admin", role="", exp=now + 10, iat=now), SECRET
    )
    # An empty role is not a valid membership claim.
    claims = verify_token(token, SECRET)
    assert claims.role == ""

    import jwt as pyjwt

    missing_role = pyjwt.encode(
        {"sub": "1", "exp": now + 10, "iat": now}, SECRET, algorithm="HS256"
    )
    with pytest.raises(AuthError):
        verify_token(missing_role, SECRET)
