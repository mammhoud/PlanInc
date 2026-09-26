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
    raw = request.META.get(settings.PLANINC_TENANT_HEADER, "").strip()
    if not raw:
        return None
    if not settings.PLANINC_TENANT_HEADER_ALLOWED:
        return None
    # Slugs are lowercase-only: reject uppercase/mixed input instead of
    # lowercasing it into a valid slug (keeps invalid headers rejected).
    if raw != raw.lower():
        return None
    if not TENANT_SLUG_PATTERN.fullmatch(raw):
        return None
    return TenantContext(slug=raw, source="header")


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


def resolve_workspace(request, workspace_id):
    """Resolve one space inside the request tenant scope.

    Returns ``(error_response, workspace)`` mirroring the ``_tenant_for_request``
    view helper shape: 400 when no tenant, 404 when the space is unknown,
    inactive, or belongs to another tenant's database scope.
    """
    from apps.workspaces.models import Workspace

    if getattr(request, "tenant_context", None) is None:
        return (
            JsonResponse(
                {
                    "error": "tenant_required",
                    "message": "Resolve a tenant by hostname or approved header.",
                },
                status=400,
            ),
            None,
        )
    try:
        workspace = Workspace.objects.get(
            id=workspace_id,
            tenant__slug=request.tenant_context.slug,
            tenant__is_active=True,
            is_active=True,
        )
    except (Workspace.DoesNotExist, ValueError, TypeError):
        return JsonResponse({"error": "not_found"}, status=404), None
    return None, workspace
