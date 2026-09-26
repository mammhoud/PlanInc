import json

from django.db import IntegrityError, models
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from apps.tenancy.models import Tenant
from middleware.tenant import require_tenant

from .models import Workspace
from .services import accept_invite, can_access_workspace, create_invite, create_workspace


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


WORKSPACE_ORDERING = {
    "name": ("name", "id"),
    "-name": ("-name", "-id"),
    "-updated_at": ("-updated_at", "-id"),
    "updated_at": ("updated_at", "id"),
}


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, JsonResponse(
            {"error": "invalid_payload", "message": "page/page_size must be integers."},
            status=400,
        )
    if page < 1 or page_size < 1 or page_size > 100:
        return None, JsonResponse(
            {
                "error": "invalid_payload",
                "message": "page >= 1, 1 <= page_size <= 100.",
            },
            status=400,
        )
    return (page, page_size), None


@require_http_methods(["GET", "POST"])
def collection(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        paging, paging_error = _pagination(request)
        if paging_error:
            return paging_error
        page, page_size = paging
        ordering_key = request.GET.get("ordering", "name")
        if ordering_key not in WORKSPACE_ORDERING:
            return JsonResponse(
                {"error": "invalid_payload", "message": "Unknown ordering."},
                status=400,
            )
        queryset = Workspace.objects.filter(tenant=tenant).order_by(
            *WORKSPACE_ORDERING[ordering_key]
        )
        search = (request.GET.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(name__icontains=search) | models.Q(slug__icontains=search)
            )
        total = queryset.count()
        workspaces = queryset[(page - 1) * page_size : page * page_size]
        return JsonResponse(
            {
                "status": "success",
                "data": [_serialize(workspace) for workspace in workspaces],
                "meta": {"page": page, "page_size": page_size, "total": total},
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


def _actor(request):
    user = getattr(request, "user", None)
    if user is None or not user.is_authenticated:
        return None
    return user


@require_http_methods(["POST"])
def invites(request, workspace_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    actor = _actor(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)
    try:
        workspace = Workspace.objects.get(id=workspace_id, tenant=tenant)
    except Workspace.DoesNotExist:
        return JsonResponse({"error": "not_found"}, status=404)
    payload = _payload(request) or {}
    role = str(payload.get("role", "editor"))
    try:
        invite = create_invite(workspace=workspace, created_by=actor, role=role)
    except ValueError:
        return JsonResponse({"error": "invalid_payload"}, status=400)
    except PermissionError:
        return JsonResponse({"error": "forbidden"}, status=403)
    return JsonResponse(
        {
            "status": "success",
            "data": {
                "token": invite.token,
                "role": invite.role,
                "expires_at": invite.expires_at.isoformat(),
            },
        },
        status=201,
    )


@require_http_methods(["POST"])
def accept_invite_view(request):
    payload = _payload(request)
    token = str((payload or {}).get("token", ""))
    actor = _actor(request)
    if actor is None:
        return JsonResponse({"error": "unauthorized"}, status=401)
    if not token:
        return JsonResponse({"error": "invalid_payload"}, status=400)
    try:
        member = accept_invite(token=token, user=actor)
    except ValueError:
        return JsonResponse({"error": "invalid_token"}, status=404)
    except PermissionError:
        return JsonResponse({"error": "unauthorized"}, status=401)
    return JsonResponse(
        {
            "status": "success",
            "data": {
                "workspace_id": member.workspace_id,
                "role": member.role,
            },
        }
    )
