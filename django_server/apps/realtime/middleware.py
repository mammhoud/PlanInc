from urllib.parse import parse_qs

import jwt

from middleware.tenant import TENANT_SLUG_PATTERN


def _query(scope):
    return parse_qs(scope.get("query_string", b"").decode())


class TenantWebSocketMiddleware:
    """Attach tenant/workspace/resume context to a WebSocket scope.

    A missing or malformed tenant is rejected here. Authentication is decoded
    (not verified against the DB); the consumer enforces tenant and workspace
    membership against the database before accepting.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        query = _query(scope)
        raw = headers.get(b"x-planinc-tenant", b"").decode() or (
            query.get("tenant", [""])[0]
        )
        if not TENANT_SLUG_PATTERN.fullmatch(raw):
            await send({"type": "websocket.close", "code": 4400})
            return

        token = query.get("token", [""])[0]
        if not token:
            auth_header = headers.get(b"authorization", b"").decode()
            if auth_header.startswith("Bearer "):
                token = auth_header[len("Bearer ") :].strip()
        user_id = self._user_id(token)

        workspace_id = None
        raw_workspace = query.get("workspace", [""])[0]
        if raw_workspace:
            try:
                workspace_id = int(raw_workspace)
            except ValueError:
                workspace_id = None

        resume_from = query.get("resume_from", [""])[0] or None

        scope = dict(scope)
        scope["tenant_slug"] = raw
        scope["user_id"] = user_id
        scope["workspace_id"] = workspace_id
        scope["resume_from"] = resume_from
        await self.app(scope, receive, send)

    @staticmethod
    def _user_id(token: str):
        if not token:
            return None
        try:
            from apps.tenancy.jwt import verify_session_token

            claims = verify_session_token(token)
            return claims.get("sub")
        except (jwt.InvalidTokenError, ValueError, KeyError):
            return None
