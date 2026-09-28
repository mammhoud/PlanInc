import json

from django.utils.dateparse import parse_date
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


def _serialize(snapshot):
    return {
        "id": snapshot.id,
        "metric": snapshot.metric,
        "period_start": snapshot.period_start.isoformat(),
        "value": snapshot.value,
    }


@require_http_methods(["GET"])
@service_view
def summary(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    return success(services.tenant_summary(tenant=tenant))


@require_http_methods(["GET", "POST"])
@service_view
def metrics(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        since = parse_date(request.GET.get("since", "") or "")
        rows = services.metrics_for(
            tenant=tenant,
            metric=request.GET.get("metric", ""),
            since=since,
        )
        return success([_serialize(row) for row in rows[:500]])

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        payload = None
    if not isinstance(payload, dict) or not isinstance(payload.get("metric"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "metric must be a string.")
    snapshot = services.increment_metric(
        tenant=tenant,
        metric=payload["metric"],
        amount=int(payload.get("amount", 1) or 1),
    )
    return success(_serialize(snapshot), status=201)
