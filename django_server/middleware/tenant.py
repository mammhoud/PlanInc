from __future__ import annotations

from dataclasses import dataclass
import re

from django.conf import settings
from django.http import JsonResponse

TENANT_SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,62}$")


@dataclass(frozen=True)
class TenantContext:
    slug: str
    source: str


def _tenant_from_header(request):
    """Approved tenant header, if the header is allowed."""
    header = request.META.get(settings.PLANINC_TENANT_HEADER, "").strip().lower()
    if not header:
        return None
    if not settings.PLANINC_TENANT_HEADER_ALLOWED:
        return None
    if not TENANT_SLUG_PATTERN.fullmatch(header):
        return None
    return TenantContext(slug=header, source="header")


def resolve_tenant(request) -> TenantContext | None:
    # Header wins first (it is explicit and can never be forged by hostname
    # traversal). A malformed header is rejected outright, so the run below
    # only sees a hostname.
    header_context = _tenant_from_header(request)
    if header_context is not None:
        return header_context

    # Non-local hosts: only bare tenant sub-domains of the base host are
    # accepted (demo.notes.structa.cloud -> "demo"). The canonical root host is
    # never a tenant, and no other hostname is accepted at all.
    host = request.get_host().split(":", 1)[0].lower()
    if host in {"localhost", "127.0.0.1"}:
        return None
    base_host = settings.PLANINC_DJANGO_BASE_HOST
    if host == base_host:
        return None
    if not host.endswith(f".{base_host}"):
        return None
    slug = host[: -len(f".{base_host}")]
    if not TENANT_SLUG_PATTERN.fullmatch(slug):
        return None
    return TenantContext(slug=slug, source="hostname")


class TenantResolutionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant_context = resolve_tenant(request)
        return self.get_response(request)


def require_tenant(request):
    if request.tenant_context is None:
        return JsonResponse(
            {
                "error": "tenant_required",
                "message": "Resolve a tenant by hostname or approved header.",
            },
            status=400,
        )
    return None
