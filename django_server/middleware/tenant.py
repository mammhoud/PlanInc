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


def resolve_tenant(request) -> TenantContext | None:
    host = request.get_host().split(":", 1)[0].lower()
    header = request.META.get(settings.PLANINC_TENANT_HEADER, "").strip().lower()

    if header:
        if not settings.PLANINC_TENANT_HEADER_ALLOWED:
            return None
        slug = header
        source = "header"
    elif host in {"localhost", "127.0.0.1", settings.PLANINC_DJANGO_BASE_HOST}:
        return None
    else:
        base_host = settings.PLANINC_DJANGO_BASE_HOST
        if not host.endswith(f".{base_host}"):
            return None
        prefix = host[: -len(f".{base_host}")]
        slug = prefix
        source = "hostname"

    if not TENANT_SLUG_PATTERN.fullmatch(slug):
        return None
    return TenantContext(slug=slug, source=source)


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
