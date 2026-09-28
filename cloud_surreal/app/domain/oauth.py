"""OAuth2 provider flow.

Ports the non-passport parts of ``server/routerExpress/auth`` to a dependency-
free OAuth2 implementation: the configured providers come from the global
``oauth2Providers`` config (same shape the TS server reads), and built-in
providers (github/google/facebook/discord) supply their own endpoints, exactly
as the passport strategies did.

Known gap: Twitter/X (OAuth 1.0a in the TS server) is not implemented as a
built-in; it works only if configured as a generic OAuth2 provider with
explicit ``authorizationUrl``/``tokenUrl``.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .errors import DomainError

STATE_TTL = 600


@dataclass(frozen=True)
class BuiltinProvider:
    authorize_url: str
    token_url: str
    userinfo_url: str
    scope: str


BUILTINS: dict[str, BuiltinProvider] = {
    "github": BuiltinProvider(
        "https://github.com/login/oauth/authorize",
        "https://github.com/login/oauth/access_token",
        "https://api.github.com/user",
        "user:email",
    ),
    "google": BuiltinProvider(
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://oauth2.googleapis.com/token",
        "https://openidconnect.googleapis.com/v1/userinfo",
        "openid profile email",
    ),
    "facebook": BuiltinProvider(
        "https://www.facebook.com/v18.0/dialog/oauth",
        "https://graph.facebook.com/v18.0/oauth/access_token",
        "https://graph.facebook.com/me?fields=id,name,picture,email",
        "email",
    ),
    "discord": BuiltinProvider(
        "https://discord.com/oauth2/authorize",
        "https://discord.com/api/oauth2/token",
        "https://discord.com/api/users/@me",
        "identify email",
    ),
}


@dataclass(frozen=True)
class ResolvedProvider:
    id: str
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    userinfo_url: str
    scope: str


def coerce_providers(value: Any) -> list[dict]:
    """Normalize the ``oauth2Providers`` config value into a list of dicts."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, dict)]


async def resolve_provider(
    provider_id: str, providers_config: Any
) -> ResolvedProvider:
    entry = next(
        (
            item
            for item in coerce_providers(providers_config)
            if str(item.get("id", "")).lower() == provider_id.lower()
        ),
        None,
    )
    if entry is None:
        raise DomainError(
            "NOT_FOUND", f"OAuth provider '{provider_id}' is not configured"
        )

    client_id = str(entry.get("clientId", ""))
    client_secret = str(entry.get("clientSecret", ""))
    if not client_id or not client_secret:
        raise DomainError(
            "BAD_REQUEST",
            f"OAuth provider '{provider_id}' is missing client credentials",
        )

    builtin = BUILTINS.get(provider_id.lower())
    # Custom (non-built-in) providers may declare endpoints directly or via an
    # OpenID Connect discovery document.
    if builtin is None:
        endpoints = await _discover_endpoints(entry)
        authorize_url = str(
            entry.get("authorizationUrl")
            or endpoints.get("authorization_endpoint", "")
        )
        token_url = str(entry.get("tokenUrl") or endpoints.get("token_endpoint", ""))
        userinfo_url = str(
            entry.get("userinfoUrl") or endpoints.get("userinfo_endpoint", "")
        )
    else:
        authorize_url, token_url, userinfo_url = (
            builtin.authorize_url,
            builtin.token_url,
            builtin.userinfo_url,
        )

    if not authorize_url or not token_url:
        raise DomainError(
            "NOT_FOUND", f"OAuth provider '{provider_id}' has no usable endpoints"
        )
    return ResolvedProvider(
        id=provider_id,
        client_id=client_id,
        client_secret=client_secret,
        authorize_url=authorize_url,
        token_url=token_url,
        userinfo_url=userinfo_url,
        scope=str(
            entry.get("scope") or (builtin.scope if builtin else "profile email")
        ),
    )


async def _discover_endpoints(entry: dict) -> dict:
    well_known = entry.get("wellKnown")
    if not well_known:
        return {}
    return await _get_json(str(well_known))


# -- state ----------------------------------------------------------------


def sign_state(secret: str, provider_id: str) -> str:
    payload = {
        "p": provider_id,
        "n": secrets.token_urlsafe(8),
        "exp": int(time.time()) + STATE_TTL,
    }
    body = (
        base64.urlsafe_b64encode(json.dumps(payload).encode())
        .decode()
        .rstrip("=")
    )
    signature = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def verify_state(secret: str, state: str, provider_id: str) -> bool:
    body, _, signature = (state or "").partition(".")
    if not body or not signature:
        return False
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return False
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except (ValueError, UnicodeDecodeError):
        return False
    return payload.get("p") == provider_id and int(payload.get("exp", 0)) > time.time()


# -- flow -----------------------------------------------------------------


def authorize_url(provider: ResolvedProvider, redirect_uri: str, state: str) -> str:
    query = urllib.parse.urlencode(
        {
            "client_id": provider.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": provider.scope,
            "state": state,
        }
    )
    separator = "&" if "?" in provider.authorize_url else "?"
    return f"{provider.authorize_url}{separator}{query}"


async def exchange_code(
    provider: ResolvedProvider, code: str, redirect_uri: str
) -> str:
    form = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": provider.client_id,
        "client_secret": provider.client_secret,
        "redirect_uri": redirect_uri,
    }
    payload = await _post_form(provider.token_url, form)
    token = payload.get("access_token")
    if not token:
        raise DomainError("UNAUTHORIZED", "OAuth token exchange failed")
    return str(token)


async def fetch_profile(provider: ResolvedProvider, access_token: str) -> dict:
    data = await _get_json(
        provider.userinfo_url,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
    )
    return normalize_profile(provider.id, data)


def normalize_profile(provider_id: str, data: dict) -> dict:
    """Reduce a payload to the normalized profile fields.

    Returns ``{providerId, externalId, username, name, image, email}``.
    """
    pid = provider_id.lower()
    if pid == "github":
        username = data.get("login") or str(data.get("id", ""))
        return {
            "providerId": pid,
            "externalId": str(data.get("id", "")),
            "username": username,
            "name": data.get("name") or username,
            "image": data.get("avatar_url") or "",
            "email": data.get("email"),
        }
    if pid == "facebook":
        picture = data.get("picture")
        image = (
            picture.get("data", {}).get("url", "")
            if isinstance(picture, dict)
            else ""
        )
        username = data.get("name") or str(data.get("id", ""))
        return {
            "providerId": pid,
            "externalId": str(data.get("id", "")),
            "username": username,
            "name": username,
            "image": image,
            "email": data.get("email"),
        }
    if pid == "discord":
        avatar = data.get("avatar")
        user_id = str(data.get("id", ""))
        image = (
            f"https://cdn.discordapp.com/avatars/{user_id}/{avatar}.png"
            if avatar
            else ""
        )
        username = data.get("username") or user_id
        return {
            "providerId": pid,
            "externalId": user_id,
            "username": username,
            "name": data.get("global_name") or username,
            "image": image,
            "email": data.get("email"),
        }
    # google and generic OIDC
    username = (
        data.get("email")
        or data.get("preferred_username")
        or str(data.get("sub", ""))
    )
    return {
        "providerId": pid,
        "externalId": str(data.get("sub") or data.get("id", "")),
        "username": username,
        "name": data.get("name") or username,
        "image": data.get("picture") or "",
        "email": data.get("email"),
    }


# -- HTTP (stdlib, run off the event loop; monkeypatched in tests) ---------


async def _post_form(url: str, form: dict) -> dict:
    return await asyncio.to_thread(_post_form_sync, url, form)


def _post_form_sync(url: str, form: dict) -> dict:
    body = urllib.parse.urlencode(form).encode()
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    return _read_json(request)


async def _get_json(url: str, headers: dict | None = None) -> dict:
    return await asyncio.to_thread(_get_json_sync, url, headers)


def _get_json_sync(url: str, headers: dict | None = None) -> dict:
    request = urllib.request.Request(url, headers=headers or {}, method="GET")
    return _read_json(request)


def _read_json(request: urllib.request.Request) -> dict:
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise DomainError(
            "INTERNAL_SERVER_ERROR", f"OAuth request failed: {exc}"
        ) from exc
