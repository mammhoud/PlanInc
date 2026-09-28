"""``/api/auth/*`` routes.

Compatible with ``server/routerExpress/auth/index.ts``: local ``login``,
``logout``, ``profile``, ``validate-token``, ``verify-2fa``, and the OAuth
authorize/callback redirects. OAuth uses the configured ``oauth2Providers``
global config and the same ``/oauth-callback`` redirect contract.

Request parsing and response construction live in ``routes/http.py``, shared with
``routes/file.py``.
"""

from __future__ import annotations

import urllib.parse
from typing import Any

from ..config import Settings
from ..domain import oauth, totp
from ..domain.errors import DomainError
from ..domain.users import UserService
from . import http


def _origin(request: Any) -> str:
    scheme = http.header(request, "x-forwarded-proto") or "http"
    host = http.header(request, "host")
    return f"{scheme}://{host}" if host else ""


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user.get("name"),
        "role": user.get("role"),
        "nickname": user.get("nickname"),
        "image": user.get("image"),
    }


def register_auth_routes(app: Any, service: UserService, settings: Settings) -> None:
    @app.post("/api/auth/login")
    async def login(request):
        payload = http.body(request)
        name = str(payload.get("username") or payload.get("name") or "")
        password = str(payload.get("password") or "")
        try:
            user = await service.login(name, password)
        except DomainError as err:
            if err.code == "PRECONDITION_FAILED":
                return http.json_response(
                    200,
                    {"requiresTwoFactor": True, "userId": err.user_id},
                )
            status = 404 if err.code == "NOT_FOUND" else 401
            return http.json_response(status, {"error": err.message})
        return http.json_response(
            200, {"user": _public_user(user), "token": user["token"]}
        )

    @app.post("/api/auth/logout")
    async def logout(request):
        return http.json_response(200, {"message": "Logout successful"})

    @app.get("/api/auth/profile")
    async def profile(request):
        claims = http.claims(request, settings)
        if claims is None:
            return http.error_response(401, "Not authenticated")
        user = await service.by_id(claims.sub)
        if user is None:
            return http.error_response(404, "User not found")
        return http.json_response(200, {"user": _public_user(user)})

    @app.get("/api/auth/validate-token")
    async def validate_token(request):
        claims = http.claims(request, settings)
        if claims is None:
            return http.json_response(
                401, {"valid": False, "error": "Invalid token"}
            )
        return http.json_response(
            200,
            {
                "valid": True,
                "user": {
                    "sub": claims.sub,
                    "name": claims.name,
                    "role": claims.role,
                    "exp": claims.exp,
                    "iat": claims.iat,
                },
            },
        )

    @app.post("/api/auth/verify-2fa")
    async def verify_2fa(request):
        payload = http.body(request)
        user_id = payload.get("userId")
        code = str(payload.get("code") or "")
        if not user_id or not code:
            return http.error_response(400, "Missing required parameters")
        user = await service.by_id(user_id)
        if user is None:
            return http.error_response(404, "User not found")
        secret = await service.two_factor_secret()
        if not totp.verify(code, secret, window=1):
            return http.error_response(401, "Invalid verification code")
        session = service.session_token(user, two_factor_verified=True)
        await service.issue_and_store_api_token(user)
        return http.json_response(
            200, {"user": _public_user(user), "token": session}
        )

    @app.get("/api/auth/callback/:providerId")
    async def oauth_callback(request):
        provider_id = http.path_param(request, "providerId")
        params = http.query(request)
        if params.get("error"):
            return http.redirect_response(
                "/oauth-callback?error=" + urllib.parse.quote(params["error"])
            )
        code = params.get("code") or ""
        if not code or not oauth.verify_state(
            settings.jwt_secret, params.get("state") or "", provider_id
        ):
            return http.redirect_response(
                "/oauth-callback?error=" + urllib.parse.quote("Invalid OAuth state")
            )
        redirect_uri = f"{_origin(request)}/api/auth/callback/{provider_id}"
        try:
            provider = await oauth.resolve_provider(
                provider_id, await service.config_value("oauth2Providers")
            )
            access_token = await oauth.exchange_code(provider, code, redirect_uri)
            profile = await oauth.fetch_profile(provider, access_token)
        except DomainError as err:
            return http.redirect_response(
                "/oauth-callback?error=" + urllib.parse.quote(err.message)
            )
        user = await service.find_or_create_oauth_user(profile)
        if await service.two_factor_enabled():
            return http.redirect_response(
                f"/oauth-callback?requiresTwoFactor=true&userId={user['id']}"
            )
        session = service.session_token(user)
        await service.issue_and_store_api_token(user)
        return http.redirect_response(
            "/oauth-callback?success=true&token=" + urllib.parse.quote(session)
        )

    @app.get("/api/auth/:providerId")
    async def oauth_start(request):
        provider_id = http.path_param(request, "providerId")
        try:
            provider = await oauth.resolve_provider(
                provider_id, await service.config_value("oauth2Providers")
            )
        except DomainError as err:
            return http.error_response(404, err.message)
        state = oauth.sign_state(settings.jwt_secret, provider_id)
        redirect_uri = f"{_origin(request)}/api/auth/callback/{provider_id}"
        return http.redirect_response(
            oauth.authorize_url(provider, redirect_uri, state)
        )
