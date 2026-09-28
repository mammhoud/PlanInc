"""Shared helpers for the Express-compatible HTTP routes.

``routes/auth.py`` and ``routes/file.py`` need the same request parsing (JSON
body, query string, bearer token, path tail) and the same response
constructors. Keeping them here means a fix lands in one place — the
query-string fallback in particular is needed because Robyn leaves
``query_params`` empty on some transport paths and keeps the query on the URL
instead.

The multipart parser is deliberate: Robyn's ``request.files`` is typed
``dict[str, bytes]`` keyed by *field* name, which loses the original filename and
content type that the Express upload route relies on. When the raw body is still
available we parse it ourselves for full fidelity, and fall back to Robyn's view
otherwise (a test-client request, or any path where the body was consumed).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, quote

from robyn import Response

from ..auth.jwt import AuthError, TokenClaims, verify_token
from ..config import Settings
from ..domain.files import mime_for

_DISPOSITION_PARAM = r'{key}\s*=\s*"([^"]*)"'


def json_response(
    status: int, payload: Any, headers: dict[str, str] | None = None
) -> Response:
    merged = {"Content-Type": "application/json", **(headers or {})}
    return Response(
        status_code=status,
        headers=merged,
        description=json.dumps(payload),
    )


def error_response(status: int, message: str) -> Response:
    return json_response(status, {"error": message})


def bytes_response(
    status: int,
    data: bytes,
    content_type: str,
    headers: dict[str, str] | None = None,
    disposition: str | None = None,
) -> Response:
    merged = {"Content-Type": content_type}
    if disposition:
        merged["Content-Disposition"] = disposition
    merged.update(headers or {})
    return Response(status_code=status, headers=merged, description=data)


def redirect_response(url: str) -> Response:
    return Response(status_code=302, headers={"Location": url}, description="")


def content_disposition(filename: str, inline: bool = True) -> str:
    """RFC 5987 disposition that survives non-ASCII filenames."""
    kind = "inline" if inline else "attachment"
    encoded = quote(filename, safe="")
    return f"{kind}; filename*=UTF-8''{encoded}"


def body(request: Any) -> dict:
    raw = getattr(request, "body", None)
    if not raw:
        return {}
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def header(request: Any, name: str) -> str:
    headers = getattr(request, "headers", None) or {}
    try:
        for key, value in headers.items():
            if str(key).lower() == name.lower():
                return str(value)
    except (AttributeError, TypeError, ValueError):
        return ""
    return ""


def query(request: Any) -> dict[str, str]:
    raw = getattr(request, "query_params", None)
    params: dict = {}
    if raw is not None:
        try:
            params = dict(raw.items())
        except (AttributeError, TypeError, ValueError):
            params = {}
    # Some transport paths leave ``query_params`` empty and keep the query string
    # on the URL path instead; fall back so routes behave identically.
    if not params:
        path = getattr(getattr(request, "url", None), "path", "") or ""
        if "?" in path:
            params = parse_qs(path.partition("?")[2])
    return {
        str(key): str(value[-1] if isinstance(value, list) else value)
        for key, value in params.items()
    }


def path_param(request: Any, name: str) -> str:
    params = getattr(request, "path_params", None) or {}
    return str(params.get(name, ""))


def tail(request: Any) -> str:
    """The catch-all path segment, with any query string stripped.

    Robyn hands the whole remainder (``a/b/c.png?thumbnail=true``) to a ``*``
    route, so the query has to be removed before it is treated as a path.
    """
    raw = path_param(request, "tail") or path_param(request, "path")
    return raw.partition("?")[0]


def bearer(request: Any) -> str:
    text = header(request, "authorization")
    if text.lower().startswith("bearer "):
        return text[7:]
    return text


def claims(request: Any, settings: Settings) -> TokenClaims | None:
    token = bearer(request)
    if not token:
        return None
    try:
        return verify_token(token, settings.jwt_secret)
    except AuthError:
        return None


def account_id(request: Any, settings: Settings) -> int | None:
    resolved = claims(request, settings)
    if resolved is None:
        return None
    try:
        return int(resolved.sub)
    except (TypeError, ValueError):
        return None


def is_superadmin(request: Any, settings: Settings) -> bool:
    resolved = claims(request, settings)
    return resolved is not None and resolved.role == "superadmin"


@dataclass
class UploadPart:
    """One file part of a multipart body."""

    field: str
    filename: str
    content_type: str
    data: bytes
    extra: dict[str, str] = field(default_factory=dict)


def _disposition_value(disposition: str, key: str) -> str:
    match = re.search(_DISPOSITION_PARAM.format(key=key), disposition, re.IGNORECASE)
    return match.group(1) if match else ""


def _decode_filename(name: str) -> str:
    """Undo the latin-1 encoding browsers use for non-ASCII filenames."""
    try:
        return name.encode("latin-1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return name


def parse_multipart(
    raw: bytes, content_type: str
) -> tuple[dict[str, str], list[UploadPart]]:
    """Split a multipart body into form fields and file parts."""
    marker = "boundary="
    index = content_type.lower().find(marker)
    if index == -1:
        return {}, []
    boundary = content_type[index + len(marker) :].split(";")[0].strip().strip('"')
    if not boundary:
        return {}, []

    delimiter = b"--" + boundary.encode("latin-1")
    fields: dict[str, str] = {}
    parts: list[UploadPart] = []
    for chunk in raw.split(delimiter):
        if not chunk or chunk.lstrip(b"\r\n").startswith(b"--"):
            continue
        chunk = chunk.lstrip(b"\r\n")
        head, separator, payload = chunk.partition(b"\r\n\r\n")
        if not separator:
            continue
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        disposition = ""
        part_type = ""
        for line in head.split(b"\r\n"):
            text = line.decode("latin-1").strip()
            lowered = text.lower()
            if lowered.startswith("content-disposition:"):
                disposition = text
            elif lowered.startswith("content-type:"):
                part_type = text.split(":", 1)[1].strip()
        name = _disposition_value(disposition, "name")
        filename = _disposition_value(disposition, "filename")
        if filename:
            decoded = _decode_filename(filename)
            parts.append(
                UploadPart(
                    field=name or "file",
                    filename=decoded,
                    content_type=part_type or mime_for(decoded),
                    data=payload,
                )
            )
        elif name:
            fields[name] = payload.decode("utf-8", "replace")
    return fields, parts


def multipart(request: Any) -> tuple[dict[str, str], list[UploadPart]]:
    """Form fields plus file parts, preferring the raw body when present."""
    content_type = header(request, "content-type")
    raw = getattr(request, "body", None) or b""
    if isinstance(raw, str):
        raw = raw.encode("utf-8", "replace")
    if raw and "multipart/form-data" in content_type.lower():
        fields, parts = parse_multipart(raw, content_type)
        if parts:
            return fields, parts

    fields = {
        str(key): str(value)
        for key, value in dict(getattr(request, "form_data", None) or {}).items()
    }
    parts = []
    for key, value in dict(getattr(request, "files", None) or {}).items():
        if not isinstance(value, (bytes, bytearray)):
            continue
        filename = fields.pop("filename", "") or fields.pop("fileName", "") or str(key)
        parts.append(
            UploadPart(
                field=str(key),
                filename=filename,
                content_type=mime_for(filename),
                data=bytes(value),
            )
        )
    return fields, parts


__all__ = [
    "UploadPart",
    "account_id",
    "bearer",
    "body",
    "bytes_response",
    "claims",
    "content_disposition",
    "error_response",
    "header",
    "is_superadmin",
    "json_response",
    "multipart",
    "parse_multipart",
    "path_param",
    "query",
    "redirect_response",
    "tail",
]
