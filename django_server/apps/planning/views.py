import json

from django.db import models
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.notes.models import Note
from apps.tenancy.models import Tenant
from apps.workspaces.models import Workspace
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from . import services
from .models import StudyItem, Task, TaskLink, Ticket

PAGE_SIZE_MAX = 100


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


def _parse_dt(value):
    if value in (None, ""):
        return None
    parsed = parse_datetime(str(value))
    return parsed


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size invalid.")
    if page < 1 or page_size < 1 or page_size > PAGE_SIZE_MAX:
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size out of range.")
    return (page, page_size), None


def _paginate(queryset, request):
    paging, error = _pagination(request)
    if error:
        return None, error
    page, page_size = paging
    total = queryset.count()
    rows = queryset[(page - 1) * page_size : page * page_size]
    return (
        (rows, {"page": page, "page_size": page_size, "total": total}),
        None,
    )


def _workspace(tenant, workspace_id):
    """Resolve an optional workspace, returning ``(error, workspace)``."""
    if workspace_id in (None, ""):
        return None, None
    try:
        return (
            None,
            Workspace.objects.filter(
                id=workspace_id, tenant=tenant, is_active=True
            ).first(),
        )
    except (ValueError, TypeError):
        return failure(ErrorCode.INVALID_PAYLOAD, "workspace invalid."), None


def _serialize_category(category):
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "color": category.color,
        "position": category.position,
        "workspace_id": category.workspace_id,
    }


def _serialize_task(task):
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "assignee_id": task.assignee_id,
        "note_id": task.note_id,
        "workspace_id": task.workspace_id,
        "categories": [_serialize_category(c) for c in task.categories.all()],
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


def _serialize_task_link(link):
    return {
        "id": link.id,
        "source_id": link.source_id,
        "target_id": link.target_id,
        "kind": link.kind,
        "created_at": link.created_at.isoformat(),
    }


def _serialize_ticket(ticket):
    return {
        "id": ticket.id,
        "title": ticket.title,
        "body": ticket.body,
        "status": ticket.status,
        "priority": ticket.priority,
        "task_id": ticket.task_id,
        "external_ref": ticket.external_ref,
        "workspace_id": ticket.workspace_id,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }


def _serialize_study(item):
    return {
        "id": item.id,
        "title": item.title,
        "status": item.status,
        "due_at": item.due_at.isoformat() if item.due_at else None,
        "interval_days": item.interval_days,
        "review_count": item.review_count,
        "last_reviewed_at": (
            item.last_reviewed_at.isoformat() if item.last_reviewed_at else None
        ),
        "note_id": item.note_id,
        "workspace_id": item.workspace_id,
    }


def _resolve_note(tenant, note_id):
    if note_id in (None, ""):
        return None
    return Note.objects.filter(id=note_id, tenant=tenant).first()


# --------------------------------------------------------------------------- #
# Categories
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def categories(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [_serialize_category(c) for c in services.list_categories(tenant=tenant)]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    ws_error, workspace = _workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    category = services.create_category(
        tenant=tenant,
        name=payload["name"],
        workspace=workspace,
        color=str(payload.get("color", "")),
        position=int(payload.get("position", 0) or 0),
    )
    return success(_serialize_category(category), status=201)


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def tasks(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = services.list_tasks(
            tenant=tenant, status=(request.GET.get("status") or None)
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
        return success([_serialize_task(task) for task in rows], meta=meta)

    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "title must be a string.")
    note = _resolve_note(tenant, payload.get("note_id"))
    if payload.get("note_id") is not None and note is None:
        return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
    ws_error, workspace = _workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    task = services.create_task(
        tenant=tenant,
        title=payload["title"],
        description=str(payload.get("description", "")),
        workspace=workspace,
        status=str(payload.get("status", "todo")),
        priority=str(payload.get("priority", "medium")),
        due_at=_parse_dt(payload.get("due_at")),
        assignee=_actor(request) if payload.get("assign_self") else None,
        note=note,
        category_ids=payload.get("category_ids"),
    )
    return success(_serialize_task(task), status=201)


def _get_task(request, tenant, task_id):
    task = Task.objects.filter(id=task_id, tenant=tenant).first()
    if task is None:
        return failure(ErrorCode.NOT_FOUND, status=404), None
    return None, task


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def task_detail(request, task_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, task = _get_task(request, tenant, task_id)
    if error:
        return error
    if request.method == "GET":
        return success(_serialize_task(task))
    if request.method == "DELETE":
        services.delete_task(task=task)
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    note = None
    if payload.get("note_id") is not None:
        note = _resolve_note(tenant, payload["note_id"])
        if note is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
    ws_error, workspace = _workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    services.update_task(
        task=task,
        title=payload.get("title"),
        description=payload.get("description"),
        status=payload.get("status"),
        priority=payload.get("priority"),
        due_at=_parse_dt(payload.get("due_at")) if "due_at" in payload else None,
        note=note,
        workspace=workspace,
        category_ids=payload.get("category_ids"),
    )
    return success(_serialize_task(task))


@require_http_methods(["GET", "POST"])
@service_view
def task_links(request, task_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, task = _get_task(request, tenant, task_id)
    if error:
        return error
    if request.method == "GET":
        return success(
            [_serialize_task_link(link) for link in services.list_task_links(task=task)]
        )
    payload = _payload(request)
    target_id = (payload or {}).get("target_id")
    if target_id is None:
        return failure(ErrorCode.INVALID_PAYLOAD, "target_id is required.")
    error, target = _get_task(request, tenant, target_id)
    if error:
        return error
    link = services.create_task_link(
        source=task, target=target, kind=str(payload.get("kind", "relates"))
    )
    return success(_serialize_task_link(link), status=201)


@require_http_methods(["DELETE"])
@service_view
def task_link_detail(request, link_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    link = TaskLink.objects.filter(id=link_id, tenant=tenant).first()
    if link is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    services.delete_task_link(link=link)
    return success(None)


# --------------------------------------------------------------------------- #
# Tickets
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def tickets(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = services.list_tickets(
            tenant=tenant, status=(request.GET.get("status") or None)
        )
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_ticket(t) for t in rows], meta=meta)
    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "title must be a string.")
    task = None
    if payload.get("task_id") is not None:
        task = Task.objects.filter(id=payload["task_id"], tenant=tenant).first()
        if task is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown task.", status=404)
    ws_error, workspace = _workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    ticket = services.create_ticket(
        tenant=tenant,
        title=payload["title"],
        body=str(payload.get("body", "")),
        workspace=workspace,
        status=str(payload.get("status", "open")),
        priority=str(payload.get("priority", "medium")),
        task=task,
        external_ref=str(payload.get("external_ref", "")),
    )
    return success(_serialize_ticket(ticket), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def ticket_detail(request, ticket_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    ticket = Ticket.objects.filter(id=ticket_id, tenant=tenant).first()
    if ticket is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(_serialize_ticket(ticket))
    if request.method == "DELETE":
        services.delete_ticket(ticket=ticket)
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    services.update_ticket(
        ticket=ticket,
        title=payload.get("title"),
        body=payload.get("body"),
        status=payload.get("status"),
        priority=payload.get("priority"),
    )
    return success(_serialize_ticket(ticket))


# --------------------------------------------------------------------------- #
# Study
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def study(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = services.list_study_items(
            tenant=tenant, status=(request.GET.get("status") or None)
        )
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_study(item) for item in rows], meta=meta)
    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "title must be a string.")
    note = _resolve_note(tenant, payload.get("note_id"))
    if payload.get("note_id") is not None and note is None:
        return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
    ws_error, workspace = _workspace(tenant, payload.get("workspace_id"))
    if ws_error:
        return ws_error
    item = services.create_study_item(
        tenant=tenant,
        title=payload["title"],
        workspace=workspace,
        note=note,
        due_at=_parse_dt(payload.get("due_at")),
        status=str(payload.get("status", "new")),
    )
    return success(_serialize_study(item), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def study_detail(request, item_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    item = StudyItem.objects.filter(id=item_id, tenant=tenant).first()
    if item is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(_serialize_study(item))
    if request.method == "DELETE":
        services.delete_study_item(item=item)
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    services.update_study_item(
        item=item,
        title=payload.get("title"),
        status=payload.get("status"),
        due_at=_parse_dt(payload.get("due_at")) if "due_at" in payload else None,
    )
    return success(_serialize_study(item))


@require_http_methods(["POST"])
@service_view
def study_review(request, item_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    item = StudyItem.objects.filter(id=item_id, tenant=tenant).first()
    if item is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    payload = _payload(request) or {}
    services.review_study_item(item=item, correct=bool(payload.get("correct", True)))
    return success(_serialize_study(item))
