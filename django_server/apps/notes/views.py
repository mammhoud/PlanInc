import json

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from middleware.tenant import require_tenant

from apps.tenancy.models import Tenant

from .models import Note
from .services import create_note, delete_note, update_note


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
        return JsonResponse(
            {"error": "tenant_not_found", "message": "Tenant is unknown or inactive."},
            status=404,
        ), None


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _serialize(note):
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
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
                "data": [_serialize(note) for note in Note.objects.filter(tenant=tenant)],
            }
        )

    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return JsonResponse(
            {"error": "invalid_payload", "message": "title must be a string."},
            status=400,
        )
    note = create_note(
        tenant=tenant,
        title=payload["title"].strip(),
        body=str(payload.get("body", "")),
    )
    return JsonResponse({"status": "success", "data": _serialize(note)}, status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
def detail(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    try:
        note = Note.objects.get(id=note_id, tenant=tenant)
    except Note.DoesNotExist:
        return JsonResponse({"error": "not_found"}, status=404)

    if request.method == "GET":
        return JsonResponse({"status": "success", "data": _serialize(note)})
    if request.method == "DELETE":
        delete_note(note=note)
        return JsonResponse({"status": "success", "data": None})

    payload = _payload(request)
    if not payload or not any(key in payload for key in ("title", "body")):
        return JsonResponse({"error": "invalid_payload"}, status=400)
    if "title" in payload:
        if not isinstance(payload["title"], str) or not payload["title"].strip():
            return JsonResponse({"error": "invalid_payload"}, status=400)
    update_note(
        note=note,
        title=payload["title"].strip() if "title" in payload else None,
        body=str(payload["body"]) if "body" in payload else None,
    )
    return JsonResponse({"status": "success", "data": _serialize(note)})
