import json

from django.http import JsonResponse
from django.db import IntegrityError
from django.views.decorators.http import require_http_methods

from apps.tenancy.models import Tenant
from middleware.tenant import require_tenant

from .models import Workspace
from .services import create_workspace


def _tenant_for_request(request):
    missing = require_tenant(request)
    if missing:
        return missing, None
    try:
        return None, Tenant.objects.get(
            slug=request.tenant_context.slug,
            is_active=True,
        )
    except Tenant.DoesNotExist:
        return JsonResponse({"error": "tenant_not_found"}, status=404), None


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _serialize(workspace):
    return {
        "id": workspace.id,
        "name": workspace.name,
        "slug": workspace.slug,
        "root_path": workspace.root_path,
        "is_active": workspace.is_active,
    }


@require_http_methods(["GET", "POST"])
def collection(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return JsonResponse(
            {
                "status": "success",
                "data": [
                    _serialize(workspace)
                    for workspace in Workspace.objects.filter(tenant=tenant)
                ],
            }
        )

    payload = _payload(request)
    if not payload or not all(
        isinstance(payload.get(field), str) and payload[field].strip()
        for field in ("name", "slug")
    ):
        return JsonResponse({"error": "invalid_payload"}, status=400)
    try:
        workspace = create_workspace(
            tenant=tenant,
            name=payload["name"].strip(),
            slug=payload["slug"].strip(),
        )
    except IntegrityError:
        return JsonResponse({"error": "already_exists"}, status=409)
    return JsonResponse({"status": "success", "data": _serialize(workspace)}, status=201)


@require_http_methods(["GET"])
def detail(request, workspace_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    try:
        workspace = Workspace.objects.get(id=workspace_id, tenant=tenant)
    except Workspace.DoesNotExist:
        return JsonResponse({"error": "not_found"}, status=404)
    return JsonResponse({"status": "success", "data": _serialize(workspace)})
