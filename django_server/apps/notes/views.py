import json

from django.db import models
from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.tenancy.models import Tenant
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from .models import Note, NoteLink, Tag
from .services import (
    add_comment,
    create_link,
    create_note,
    create_tag,
    create_version,
    delete_comment,
    delete_link,
    delete_note,
    list_backlinks,
    list_comments,
    list_outgoing_links,
    list_tags,
    list_versions,
    resolve_comment,
    restore_version,
    set_note_tags,
    update_comment,
    update_note,
)


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
        return (
            failure(
                ErrorCode.TENANT_NOT_FOUND,
                "Tenant is unknown or inactive.",
                status=404,
            ),
            None,
        )


def _note_for_request(request, tenant, note_id):
    try:
        return None, Note.objects.get(id=note_id, tenant=tenant)
    except Note.DoesNotExist:
        return failure(ErrorCode.NOT_FOUND, status=404), None


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


def _author_name(user) -> str | None:
    if user is None:
        return None
    return (getattr(user, "username", "") or "").strip() or None


def _serialize(note):
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "workspace_id": note.workspace_id,
        "author": _author_name(note.author),
        "tags": [_serialize_tag(tag) for tag in note.tags.all()],
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
    }


def _serialize_tag(tag):
    return {
        "id": tag.id,
        "name": tag.name,
        "slug": tag.slug,
        "color": tag.color,
    }


def _serialize_version(version):
    return {
        "id": version.id,
        "version": version.version,
        "title": version.title,
        "body": version.body,
        "author": _author_name(version.author),
        "created_at": version.created_at.isoformat(),
    }


def _serialize_comment(comment):
    return {
        "id": comment.id,
        "body": comment.body,
        "author": _author_name(comment.author),
        "parent_id": comment.parent_id,
        "is_resolved": comment.is_resolved,
        "resolved_at": (
            comment.resolved_at.isoformat() if comment.resolved_at else None
        ),
        "created_at": comment.created_at.isoformat(),
        "updated_at": comment.updated_at.isoformat(),
    }


def _serialize_link(link, *, direction):
    other = link.target if direction == "outgoing" else link.source
    return {
        "id": link.id,
        "direction": direction,
        "note_id": other.id,
        "title": other.title,
        "created_at": link.created_at.isoformat(),
    }


NOTE_ORDERING = {
    "-updated_at": ("-updated_at", "-id"),
    "updated_at": ("updated_at", "id"),
    "-created_at": ("-created_at", "-id"),
    "created_at": ("created_at", "id"),
    "title": ("title", "id"),
    "-title": ("-title", "-id"),
}


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, failure(
            ErrorCode.INVALID_PAYLOAD,
            "page/page_size must be integers.",
            status=400,
        )
    if page < 1 or page_size < 1 or page_size > 100:
        return None, failure(
            ErrorCode.INVALID_PAYLOAD,
            "page >= 1, 1 <= page_size <= 100.",
            status=400,
        )
    return (page, page_size), None


@require_http_methods(["GET", "POST"])
@service_view
def collection(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        paging, paging_error = _pagination(request)
        if paging_error:
            return paging_error
        page, page_size = paging
        ordering_key = request.GET.get("ordering", "-updated_at")
        if ordering_key not in NOTE_ORDERING:
            return failure(
                ErrorCode.INVALID_PAYLOAD, "Unknown ordering.", status=400
            )
        queryset = Note.objects.filter(tenant=tenant).order_by(
            *NOTE_ORDERING[ordering_key]
        )
        search = (request.GET.get("search") or "").strip()
        if search:
            queryset = queryset.filter(
                models.Q(title__icontains=search) | models.Q(body__icontains=search)
            )
        tag_slug = (request.GET.get("tag") or "").strip()
        if tag_slug:
            queryset = queryset.filter(tags__slug=tag_slug)
        workspace_id = (request.GET.get("workspace") or "").strip()
        if workspace_id:
            try:
                queryset = queryset.filter(workspace_id=int(workspace_id))
            except ValueError:
                return failure(
                    ErrorCode.INVALID_PAYLOAD,
                    "workspace must be an integer.",
                    status=400,
                )
        total = queryset.distinct().count()
        notes = queryset.distinct()[(page - 1) * page_size : page * page_size]
        return success(
            [_serialize(note) for note in notes],
            meta={"page": page, "page_size": page_size, "total": total},
        )

    payload = _payload(request)
    if not payload or not isinstance(payload.get("title"), str):
        return failure(
            ErrorCode.INVALID_PAYLOAD, "title must be a string.", status=400
        )
    note = create_note(
        tenant=tenant,
        title=payload["title"].strip(),
        body=str(payload.get("body", "")),
        author=_actor(request),
    )
    return success(_serialize(note), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def detail(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error

    if request.method == "GET":
        return success(_serialize(note))
    if request.method == "DELETE":
        delete_note(note=note)
        return success(None)

    payload = _payload(request)
    if not payload or not any(key in payload for key in ("title", "body")):
        return failure(ErrorCode.INVALID_PAYLOAD, status=400)
    if "title" in payload:
        if not isinstance(payload["title"], str) or not payload["title"].strip():
            return failure(ErrorCode.INVALID_PAYLOAD, status=400)
    update_note(
        note=note,
        title=payload["title"].strip() if "title" in payload else None,
        body=str(payload["body"]) if "body" in payload else None,
        actor=_actor(request),
    )
    return success(_serialize(note))


# --------------------------------------------------------------------------- #
# History / versions
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def versions(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    if request.method == "POST":
        version = create_version(note=note, actor=_actor(request))
        return success(_serialize_version(version), status=201)
    return success([_serialize_version(row) for row in list_versions(note=note)])


@require_http_methods(["POST"])
@service_view
def restore(request, note_id, version_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    version = note.versions.filter(id=version_id).first()
    if version is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    restore_version(note=note, version=version, actor=_actor(request))
    return success(_serialize(note))


@require_http_methods(["GET"])
@service_view
def history(request, note_id):
    """Chronological history: versions newest first with comment activity."""
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    return success(
        {
            "versions": [_serialize_version(row) for row in list_versions(note=note)],
            "comments": [_serialize_comment(row) for row in list_comments(note=note)],
            "backlinks": [
                _serialize_link(link, direction="incoming")
                for link in list_backlinks(note=note)
            ],
        }
    )


# --------------------------------------------------------------------------- #
# Comments
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def comments(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    if request.method == "GET":
        return success([_serialize_comment(row) for row in list_comments(note=note)])

    payload = _payload(request)
    if not payload or not isinstance(payload.get("body"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "body must be a string.", status=400)
    parent = None
    if payload.get("parent_id") is not None:
        parent = note.comments.filter(id=payload["parent_id"]).first()
        if parent is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown parent comment.", status=404)
    comment = add_comment(
        note=note,
        body=payload["body"],
        author=_actor(request),
        parent=parent,
    )
    return success(_serialize_comment(comment), status=201)


@require_http_methods(["PATCH", "DELETE"])
@service_view
def comment_detail(request, note_id, comment_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    comment = note.comments.filter(id=comment_id).first()
    if comment is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "DELETE":
        delete_comment(comment=comment)
        return success(None)

    payload = _payload(request)
    if not payload:
        return failure(ErrorCode.INVALID_PAYLOAD, status=400)
    if "resolved" in payload and not any(key in payload for key in ("body",)):
        resolve_comment(comment=comment, resolved=bool(payload["resolved"]))
        return success(_serialize_comment(comment))
    if not isinstance(payload.get("body"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "body must be a string.", status=400)
    update_comment(comment=comment, body=payload["body"])
    if "resolved" in payload:
        resolve_comment(comment=comment, resolved=bool(payload["resolved"]))
    return success(_serialize_comment(comment))


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def tags(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success([_serialize_tag(tag) for tag in list_tags(tenant=tenant)])
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.", status=400)
    tag = create_tag(
        tenant=tenant,
        name=payload["name"],
        color=str(payload.get("color", "")),
    )
    return success(_serialize_tag(tag), status=201)


@require_http_methods(["GET", "POST", "PUT"])
@service_view
def note_tags(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    if request.method == "GET":
        return success([_serialize_tag(tag) for tag in note.tags.all()])

    payload = _payload(request)
    if request.method == "PUT":
        if payload is None or not isinstance(payload.get("tag_ids"), list):
            return failure(
                ErrorCode.INVALID_PAYLOAD, "tag_ids must be a list.", status=400
            )
        tags_ = set_note_tags(note=note, tag_ids=payload["tag_ids"])
        return success([_serialize_tag(tag) for tag in tags_])

    tag_id = (payload or {}).get("tag_id")
    if tag_id is None:
        return failure(ErrorCode.INVALID_PAYLOAD, "tag_id is required.", status=400)
    tag = Tag.objects.filter(id=tag_id, tenant=tenant).first()
    if tag is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    from .services import attach_tag

    attach_tag(note=note, tag=tag)
    return success([_serialize_tag(row) for row in note.tags.all()])


@require_http_methods(["DELETE"])
@service_view
def note_tag_detail(request, note_id, tag_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    tag = note.tags.filter(id=tag_id).first()
    if tag is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    from .services import detach_tag

    detach_tag(note=note, tag=tag)
    return success(None)


# --------------------------------------------------------------------------- #
# Links / backlinks
# --------------------------------------------------------------------------- #
@require_http_methods(["GET", "POST"])
@service_view
def links(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_link(link, direction="outgoing")
                for link in list_outgoing_links(note=note)
            ]
        )
    payload = _payload(request)
    target_id = (payload or {}).get("target_id")
    if target_id is None:
        return failure(ErrorCode.INVALID_PAYLOAD, "target_id is required.", status=400)
    error, target = _note_for_request(request, tenant, target_id)
    if error:
        return error
    link = create_link(source=note, target=target)
    return success(_serialize_link(link, direction="outgoing"), status=201)


@require_http_methods(["GET"])
@service_view
def backlinks(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    return success(
        [
            _serialize_link(link, direction="incoming")
            for link in list_backlinks(note=note)
        ]
    )


@require_http_methods(["DELETE"])
@service_view
def link_detail(request, note_id, link_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    error, note = _note_for_request(request, tenant, note_id)
    if error:
        return error
    link = NoteLink.objects.filter(id=link_id, source=note).first()
    if link is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    delete_link(link=link)
    return success(None)
