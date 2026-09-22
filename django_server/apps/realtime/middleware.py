from urllib.parse import parse_qs

from middleware.tenant import TENANT_SLUG_PATTERN


class TenantWebSocketMiddleware:
    """Attach an explicit tenant slug to a WebSocket scope.

    Authentication and membership checks remain a required follow-up before
    production cutover; a missing or malformed tenant is always rejected.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        headers = dict(scope.get("headers", []))
        query = parse_qs(scope.get("query_string", b"").decode())
        raw = headers.get(b"x-planinc-tenant", b"").decode() or (
            query.get("tenant", [""])[0]
        )
        if not TENANT_SLUG_PATTERN.fullmatch(raw):
            await send({"type": "websocket.close", "code": 4400})
            return
        scope = dict(scope)
        scope["tenant_slug"] = raw
        await self.app(scope, receive, send)
