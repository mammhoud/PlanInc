import json

from django.db import models
from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.notes.models import Note
from apps.tenancy.models import Tenant
from apps.workspaces.models import Workspace
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from . import services
from .models import Attachment, Resource, ResourceRelation


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


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _actor(request):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size invalid.")
    if page < 1 or page_size < 1 or page_size > 100:
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size out of range.")
    return (page, page_size), None


def _paginate(queryset, request):
    paging, error = _pagination(request)
    if error:
        return None, error
    page, page_size = paging
    total = queryset.count()
    rows = queryset[(page - 1) * page_size : page * page_size]
    return ((rows, {"page": page, "page_size": page_size, "total": total}), None)


def _optional_workspace(tenant, workspace_id):
    if workspace_id in (None, ""):
        return None, None
    if not str(workspace_id).isdigit():
        return failure(ErrorCode.INVALID_PAYLOAD, "workspace invalid."), None
    return None, Workspace.objects.filter(
        id=workspace_id, tenant=tenant, is_active=True
    ).first()


def _resource_error(tenant, resource_id):
    resource = Resource.objects.filter(id=resource_id, tenant=tenant).first()
    if resource is None:
        return failure(ErrorCode.NOT_FOUND, status=404), None
    return None, resource


def _serialize_resource(resource):
    return {
        "id": resource.id,
        "title": resource.title,
        "kind": resource.kind,
        "url": resource.url,
        "description": resource.description,
        "workspace_id": resource.workspace_id,
        "created_at": resource.created_at.isoformat(),
        "updated_at": resource.updated_at.isoformat(),
    }


def _serialize_relation(relation):
    return {
        "id": relation.id,
        "source_id": relation.source_id,
        "target_id": relation.target_id,
        "kind": relation.kind,
        "created_at": relation.created_at.isoformat(),
    }


def _serialize_attachment(attachment):
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "size_bytes": attachment.size_bytes,
        "sha256": attachment.sha256,
        "object_key": attachment.object_key,
        "note_id": attachment.note_id,
        "resource_id": attachment.resource_id,
        "created_at": attachment.created_at.isoformat(),
    }


def _serialize_preview(preview):
    return {
        "id": preview.id,
        "kind": preview.kind,
        "object_key": preview.object_key,
        "content": preview.content,
        "created_at": preview.created_at.isoformat(),
    }


def _serialize_extraction(extraction):
    return {
        "id": extraction.id,
        "status": extraction.status,
        "text": extraction.text,
        "error": extraction.error,
        "updated_at": extraction.updated_at.isoformat(),
    }


# --------------------------------------------------------------------------- #
# Resources
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def resources(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = services.list_resources(
            tenant=tenant, kind=(request.GET.get("kind") or None)
        )
        search = (request.GET.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(title__icontains=search)
                | models.Q(description__icontains=search)
            )
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_resource(r) for r in rows], meta=meta)

    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "title must be a string.")
    ws_error, workspace = _optional_workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    resource = services.create_resource(
        tenant=tenant,
        title=payload["title"],
        kind=str(payload.get("kind", "link")),
        workspace=workspace,
        url=str(payload.get("url", "")),
        description=str(payload.get("description", "")),
        created_by=_actor(request),
    )
    return success(_serialize_resource(resource), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def resource_detail(request, resource_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, resource = _resource_error(tenant, resource_id)
    if error:
        return error
    if request.method == "GET":
        return success(_serialize_resource(resource))
    if request.method == "DELETE":
        services.delete_resource(resource=resource)
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    services.update_resource(
        resource=resource,
        title=payload.get("title"),
        kind=payload.get("kind"),
        url=payload.get("url"),
        description=payload.get("description"),
    )
    return success(_serialize_resource(resource))


@require_http_methods(["GET", "POST"])
@service_view
def relations(request, resource_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, resource = _resource_error(tenant, resource_id)
    if error:
        return error
    if request.method == "GET":
        return success(
            [_serialize_relation(r) for r in services.list_relations(resource=resource)]
        )
    payload = _payload(request)
    target_id = (payload or {}).get("target_id")
    if target_id is None:
        return failure(ErrorCode.INVALID_PAYLOAD, "target_id is required.")
    error, target = _resource_error(tenant, target_id)
    if error:
        return error
    relation = services.create_relation(
        source=resource, target=target, kind=str(payload.get("kind", "relates"))
    )
    return success(_serialize_relation(relation), status=201)


@require_http_methods(["DELETE"])
@service_view
def relation_detail(request, relation_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    relation = ResourceRelation.objects.filter(id=relation_id, tenant=tenant).first()
    if relation is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    services.delete_relation(relation=relation)
    return success(None)


# --------------------------------------------------------------------------- #
# Attachments
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def attachments(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        note = None
        if request.GET.get("note_id"):
            note = Note.objects.filter(
                id=request.GET["note_id"], tenant=tenant
            ).first()
            if note is None:
                return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
        queryset = services.list_attachments(tenant=tenant, note=note)
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_attachment(a) for a in rows], meta=meta)

    payload = _payload(request)
    if not payload or not isinstance(payload.get("filename"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "filename must be a string.")
    note = None
    if payload.get("note_id") is not None:
        note = Note.objects.filter(
            id=payload["note_id"], tenant=tenant
        ).first()
        if note is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
    resource = None
    if payload.get("resource_id") is not None:
        resource = Resource.objects.filter(
            id=payload["resource_id"], tenant=tenant
        ).first()
        if resource is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown resource.", status=404)
    attachment = services.create_attachment(
        tenant=tenant,
        filename=payload["filename"],
        note=note,
        resource=resource,
        content_type=str(payload.get("content_type", "")),
        size_bytes=int(payload.get("size_bytes", 0) or 0),
        sha256=str(payload.get("sha256", "")),
        created_by=_actor(request),
    )
    return success(_serialize_attachment(attachment), status=201)


def _attachment_error(request, tenant, attachment_id):
    attachment = Attachment.objects.filter(id=attachment_id, tenant=tenant).first()
    if attachment is None:
        return failure(ErrorCode.NOT_FOUND, status=404), None
    return None, attachment


@require_http_methods(["GET", "DELETE"])
@service_view
def attachment_detail(request, attachment_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, attachment = _attachment_error(request, tenant, attachment_id)
    if error:
        return error
    if request.method == "DELETE":
        services.delete_attachment(attachment=attachment)
        return success(None)
    return success(_serialize_attachment(attachment))


@require_http_methods(["GET", "POST"])
@service_view
def previews(request, attachment_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, attachment = _attachment_error(request, tenant, attachment_id)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_preview(p)
                for p in services.list_previews(attachment=attachment)
            ]
        )
    payload = _payload(request) or {}
    preview = services.create_preview(
        attachment=attachment,
        kind=str(payload.get("kind", "text")),
        content=str(payload.get("content", "")),
        object_key=str(payload.get("object_key", "")),
    )
    return success(_serialize_preview(preview), status=201)


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST", "PATCH"])
@service_view
def extraction(request, attachment_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, attachment = _attachment_error(request, tenant, attachment_id)
    if error:
        return error
    if request.method == "GET":
        result = getattr(attachment, "extraction", None)
        if result is None:
            return failure(ErrorCode.NOT_FOUND, status=404)
        return success(_serialize_extraction(result))
    if request.method == "POST":
        result = services.request_extraction(attachment=attachment)
        return success(_serialize_extraction(result), status=202)
    payload = _payload(request)
    if not payload or not isinstance(payload.get("text", ""), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "text must be a string.")
    result = services.complete_extraction(
        attachment=attachment,
        text=str(payload.get("text", "")),
        status=str(payload.get("status", "done")),
        error=str(payload.get("error", "")),
    )
    return success(_serialize_extraction(result))
