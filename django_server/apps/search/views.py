from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.tenancy.models import Tenant
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from . import services


def _tenant_for_request(request):
    missing = require_tenant(request)
    if missing:
        return missing, None
    try:
        return None, Tenant.objects.get(
            slug=request.tenant_context.slug, is_active=True
        )
    except Tenant.DoesNotExist:
        return (
            failure(
                ErrorCode.TENANT_NOT_FOUND,
                "Tenant is unknown or inactive.",
                status=404,
            ),
            None,
        )


def _actor(request):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def _serialize(document):
    return {
        "id": document.id,
        "object_type": document.object_type,
        "object_id": document.object_id,
        "title": document.title,
        "workspace_id": document.workspace_id,
        "tag_slugs": [
            slug for slug in document.tag_slugs.split("|") if slug
        ],
        "updated_at": document.updated_at.isoformat(),
    }


@require_http_methods(["GET"])
@service_view
def search(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    try:
        limit = int(request.GET.get("limit", "30"))
        offset = int(request.GET.get("offset", "0"))
    except (TypeError, ValueError):
        return failure(
            ErrorCode.INVALID_PAYLOAD, "limit/offset must be integers."
        )
    object_types = [
        value
        for value in (request.GET.getlist("type") or [])
        if value
    ]
    documents, total = services.search(
        tenant=tenant,
        query=request.GET.get("q", ""),
        user=_actor(request),
        object_types=object_types or None,
        tag=request.GET.get("tag", ""),
        limit=limit,
        offset=offset,
    )
    return success(
        [_serialize(document) for document in documents],
        meta={"limit": limit, "offset": offset, "total": total},
    )


@require_http_methods(["POST"])
@service_view
def reindex(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    counts = services.reindex_tenant(tenant=tenant)
    return success(counts)
