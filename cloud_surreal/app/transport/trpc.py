"""tRPC-compatible transport.

Preserves the frontend contract: `/api/trpc/<router>.<proc>[,<proc>]`,
`?batch=1`, superjson `{json, meta}` envelopes, and `Authorization: Bearer`.
This keeps `frontend/src/lib/trpc.ts` working with no client rewrite.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import parse_qs

from robyn import jsonify

from ..auth.jwt import AuthError, TokenClaims, verify_token
from ..config import Settings
from ..domain.errors import DomainError
from .superjson import SuperJson

Procedure = Callable[[dict, TokenClaims | None], Awaitable[Any]]

_PREFIX = "/api/trpc/"


class Router:
    """Maps dot-separated procedure names to async handlers."""

    def __init__(self) -> None:
        self._procedures: dict[str, Procedure] = {}

    def procedure(self, name: str) -> Callable[[Procedure], Procedure]:
        def register(fn: Procedure) -> Procedure:
            self._procedures[name] = fn
            return fn

        return register

    def get(self, name: str) -> Procedure | None:
        return self._procedures.get(name)

    @property
    def names(self) -> list[str]:
        return sorted(self._procedures)


def _header(request: Any, name: str) -> str:
    headers = getattr(request, "headers", None) or {}
    try:
        if hasattr(headers, "get"):
            for candidate in (name, name.lower(), name.title()):
                value = headers.get(candidate)
                if value:
                    return str(value)
        for key, value in headers.items():
            if str(key).lower() == name.lower():
                return str(value)
    except Exception:  # noqa: BLE001 - defensive against header impls
        return ""
    return ""


def _resolve_token(request: Any, secret: str) -> TokenClaims | None:
    raw = _header(request, "authorization")
    if not raw:
        return None
    token = raw.split(" ", 1)[1] if raw.lower().startswith("bearer ") else raw
    return verify_token(token, secret)


def _request_parts(request: Any) -> tuple[str, dict[str, str]]:
    raw_path = (getattr(request, "path_params", None) or {}).get("path") or ""
    if not raw_path:
        url_path = getattr(getattr(request, "url", None), "path", "") or ""
        if url_path.startswith(_PREFIX):
            raw_path = url_path[len(_PREFIX) :]
    proc_part, _, query_string = raw_path.partition("?")
    params = getattr(request, "query_params", None) or {}
    query = {str(k): str(v) for k, v in params.items()}
    for key, values in parse_qs(query_string).items():
        query.setdefault(key, values[-1])
    return proc_part.strip("/"), query


def _parse_inputs(payload: Any, batch: bool) -> dict[str, Any]:
    if payload in (None, "", b""):
        return {}
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")
    try:
        parsed = json.loads(payload)
    except (TypeError, ValueError):
        return {}
    # Batched requests carry an index -> input map; a single call carries the
    # wrapped input itself, which belongs at index 0.
    if batch and isinstance(parsed, dict):
        return parsed
    return {"0": parsed}


def _error(name: str, code: str, message: str, status: int) -> dict:
    return {
        "error": {
            "json": {
                "message": message,
                "code": -32000,
                "data": {"code": code, "httpStatus": status, "path": name},
            }
        }
    }


async def _call(
    router: Router, name: str, wrapped_input: Any, claims: TokenClaims | None
) -> dict:
    procedure = router.get(name)
    if procedure is None:
        return _error(name, "NOT_FOUND", f"Unknown procedure: {name}", 404)
    try:
        result = await procedure(SuperJson.decode(wrapped_input), claims)
        return {"result": {"data": SuperJson.encode(result)}}
    except AuthError as err:
        return _error(name, "UNAUTHORIZED", str(err), 401)
    except DomainError as err:
        return _error(name, err.code, err.message, err.status)
    except Exception as err:  # noqa: BLE001 - transport boundary
        return _error(name, "INTERNAL_SERVER_ERROR", str(err), 500)


async def handle_trpc(request: Any, router: Router, settings: Settings) -> Any:
    path, query = _request_parts(request)
    batch = query.get("batch") == "1"
    try:
        claims = _resolve_token(request, settings.jwt_secret)
    except AuthError as err:
        failure = _error(path, "UNAUTHORIZED", str(err), 401)
        return jsonify([failure] if batch else failure)

    inputs = (
        _parse_inputs(getattr(request, "body", None), batch)
        if getattr(request, "method", "POST") != "GET"
        else _parse_inputs(query.get("input"), batch)
    )
    names = [name for name in path.split(",") if name]
    results = [
        await _call(router, name, inputs.get(str(index)) or {}, claims)
        for index, name in enumerate(names)
    ]
    return jsonify(results if batch else results[0])
