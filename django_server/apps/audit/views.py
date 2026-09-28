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


def _serialize(event):
    return {
        "id": event.id,
        "action": event.action,
        "object_type": event.object_type,
        "object_id": event.object_id,
        "actor_id": event.actor_id,
        "details": event.details,
        "created_at": event.created_at.isoformat(),
    }


@require_http_methods(["GET"])
@service_view
def audit_events(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    try:
        limit = int(request.GET.get("limit", "100"))
    except (TypeError, ValueError):
        return failure(ErrorCode.INVALID_PAYLOAD, "limit must be an integer.")
    events = services.events_for(
        tenant=tenant,
        action=request.GET.get("action", ""),
        object_type=request.GET.get("object_type", ""),
        limit=limit,
    )
    return success([_serialize(event) for event in events])
