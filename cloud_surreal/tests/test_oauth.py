import asyncio

import pytest

from app.domain import oauth
from app.domain.errors import DomainError

SECRET = "state-secret-that-is-long-enough!"


def test_coerce_providers_accepts_list_and_json_string():
    assert oauth.coerce_providers([{"id": "github"}]) == [{"id": "github"}]
    assert oauth.coerce_providers('[{"id": "github"}]') == [{"id": "github"}]
    assert oauth.coerce_providers("not json") == []
    assert oauth.coerce_providers({"id": "github"}) == []


def test_resolve_builtin_uses_known_endpoints_and_config_credentials():
    config = [{"id": "github", "clientId": "cid", "clientSecret": "s"}]
    provider = asyncio.run(oauth.resolve_provider("github", config))
    assert provider.client_id == "cid"
    assert provider.authorize_url == "https://github.com/login/oauth/authorize"
    assert provider.scope == "user:email"


def test_resolve_rejects_unknown_and_missing_credentials():
    with pytest.raises(DomainError) as unknown:
        asyncio.run(oauth.resolve_provider("github", []))
    assert unknown.value.code == "NOT_FOUND"

    with pytest.raises(DomainError) as no_creds:
        asyncio.run(oauth.resolve_provider("github", [{"id": "github"}]))
    assert no_creds.value.code == "BAD_REQUEST"


def test_resolve_custom_provider_uses_explicit_endpoints():
    config = [
        {
            "id": "acme",
            "clientId": "cid",
            "clientSecret": "s",
            "authorizationUrl": "https://acme.test/auth",
            "tokenUrl": "https://acme.test/token",
            "userinfoUrl": "https://acme.test/me",
            "scope": "openid",
        }
    ]
    provider = asyncio.run(oauth.resolve_provider("acme", config))
    assert provider.authorize_url == "https://acme.test/auth"
    assert provider.scope == "openid"


def test_authorize_url_includes_required_params():
    provider = oauth.ResolvedProvider(
        id="github",
        client_id="cid",
        client_secret="s",
        authorize_url="https://github.com/login/oauth/authorize",
        token_url="https://github.com/login/oauth/access_token",
        userinfo_url="https://api.github.com/user",
        scope="user:email",
    )
    redirect_uri = "https://app.test/api/auth/callback/github"
    url = oauth.authorize_url(provider, redirect_uri, "st4te")
    assert url.startswith("https://github.com/login/oauth/authorize?")
    assert "client_id=cid" in url
    assert "state=st4te" in url
    assert urllib_quote(redirect_uri) in url


def urllib_quote(value: str) -> str:
    import urllib.parse

    return urllib.parse.quote(value, safe="")


def test_state_roundtrip_and_rejection():
    state = oauth.sign_state(SECRET, "github")
    assert oauth.verify_state(SECRET, state, "github") is True
    assert oauth.verify_state(SECRET, state, "google") is False
    assert oauth.verify_state(SECRET, state + "x", "github") is False
    assert oauth.verify_state(SECRET, "garbage", "github") is False


def test_normalize_profile_per_provider():
    github = oauth.normalize_profile(
        "github", {"id": 7, "login": "octo", "name": "Octo", "avatar_url": "a.png"}
    )
    assert github["username"] == "octo"
    assert github["image"] == "a.png"

    discord = oauth.normalize_profile(
        "discord", {"id": "42", "username": "d", "global_name": "D", "avatar": "abc"}
    )
    assert discord["name"] == "D"
    assert discord["image"] == "https://cdn.discordapp.com/avatars/42/abc.png"

    google = oauth.normalize_profile(
        "google", {"sub": "1", "email": "a@b.c", "name": "A", "picture": "p.png"}
    )
    assert google["username"] == "a@b.c"
    assert google["externalId"] == "1"
