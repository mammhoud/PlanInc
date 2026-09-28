"""Standard JSON envelope for PlanInc API surfaces.

Success::

    {"status": "success", "message": "", "data": ..., "meta": ...}

Error::

    {"status": "error", "error": "<code>", "message": ..., "details": ...}

The ``error`` key mirrors the legacy TypeScript server envelope so existing
clients keep working while Django takes over.
"""

from __future__ import annotations

from django.http import JsonResponse

from domain.errors import ServiceError


def success(
    data=None,
    *,
    message: str = "",
    meta: dict | None = None,
    status: int = 200,
) -> JsonResponse:
    """Render a success envelope."""
    payload: dict = {"status": "success", "message": message, "data": data}
    if meta is not None:
        payload["meta"] = meta
    return JsonResponse(payload, status=status)


def failure(
    code: str,
    message: str = "",
    *,
    details: dict | None = None,
    status: int = 400,
) -> JsonResponse:
    """Render an error envelope with a stable ``code``."""
    payload: dict = {"status": "error", "error": code, "message": message}
    if details is not None:
        payload["details"] = details
    return JsonResponse(payload, status=status)


def from_service_error(exc: ServiceError) -> JsonResponse:
    """Render a :class:`~domain.errors.ServiceError` as an error envelope."""
    return failure(exc.code, exc.message, details=exc.details, status=exc.status)
