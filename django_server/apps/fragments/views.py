"""Render-first django-fusion fragments.

Each fragment resolves the same tenant scope and calls the same services as the
JSON API, then renders server-side HTML. A ``?format=json`` fallback returns the
standard envelope so a client can choose either road without a second contract.
"""

from __future__ import annotations

from django.db import models
from django.http import HttpResponse
from django.template.loader import render_to_string
from django.views.decorators.http import require_http_methods

from api.envelopes import failure, success
from apps.notes.models import Note
from apps.notes.services import list_comments
from apps.tenancy.models import Tenant
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

ORDERING = {
    "-updated_at": ("-updated_at", "-id"),
    "updated_at": ("updated_at", "id"),
    "title": ("title", "id"),
    "-title": ("-title", "-id"),
}


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


def _wants_json(request) -> bool:
    if request.GET.get("format") == "json":
        return True
    return request.headers.get("Accept", "").startswith("application/json")


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size invalid.")
    if page < 1 or page_size < 1 or page_size > 100:
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size out of range.")
    return (page, page_size), None


def _serialize_note(note):
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "tags": [tag.slug for tag in note.tags.all()],
        "updated_at": note.updated_at.isoformat(),
    }


@require_http_methods(["GET"])
def notes_table(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    paging, paging_error = _pagination(request)
    if paging_error:
        return paging_error
    page, page_size = paging
    ordering_key = request.GET.get("ordering", "-updated_at")
    queryset = Note.objects.filter(tenant=tenant).prefetch_related("tags")
    queryset = queryset.order_by(*ORDERING.get(ordering_key, ORDERING["-updated_at"]))
    search = (request.GET.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            models.Q(title__icontains=search) | models.Q(body__icontains=search)
        )
    tag_slug = (request.GET.get("tag") or "").strip()
    if tag_slug:
        queryset = queryset.filter(tags__slug=tag_slug)
    total = queryset.count()
    notes = list(queryset[(page - 1) * page_size : page * page_size])
    meta = {"page": page, "page_size": page_size, "total": total}
    if _wants_json(request):
        return success([_serialize_note(note) for note in notes], meta=meta)
    html = render_to_string(
        "fragments/notes_table.html",
        {"notes": notes, "total": total},
        request=request,
    )
    return HttpResponse(html)


@require_http_methods(["GET"])
def note_comments(request, note_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    note = Note.objects.filter(id=note_id, tenant=tenant).first()
    if note is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    comments = list(list_comments(note=note))
    if _wants_json(request):
        return success(
            [
                {
                    "id": comment.id,
                    "body": comment.body,
                    "is_resolved": comment.is_resolved,
                }
                for comment in comments
            ]
        )
    html = render_to_string(
        "fragments/comments.html",
        {"note": note, "comments": comments},
        request=request,
    )
    return HttpResponse(html)
