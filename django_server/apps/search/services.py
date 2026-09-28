"""Search projections and permission-aware queries.

Writes happen through ``index_*`` helpers called by the owning slice (or a
reindex sweep). Reads always filter by tenant first, then drop documents whose
workspace the requesting user cannot reach, so a projection can never widen
access.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models import Q

from apps.operations.services import enqueue_event
from apps.workspaces.models import WorkspaceMember
from domain.errors import ValidationError
from domain.events.types import (
    SEARCH_DOCUMENT_INDEXED,
    SEARCH_DOCUMENT_REMOVED,
)
from domain.policies.tenant import require_tenant_scope

from .models import SearchDocument


def _tag_slugs(tags) -> str:
    values = [str(tag).strip() for tag in (tags or []) if str(tag).strip()]
    return "|" + "|".join(values) + "|" if values else ""


def _index(
    *,
    tenant,
    object_type: str,
    object_id,
    title: str,
    text: str,
    tags=None,
    workspace=None,
) -> SearchDocument:
    document, _ = SearchDocument.objects.update_or_create(
        tenant=tenant,
        object_type=object_type,
        object_id=object_id,
        defaults={
            "title": title[:500],
            "search_text": text or "",
            "tag_slugs": _tag_slugs(tags),
            "workspace": workspace,
        },
    )
    return document


@transaction.atomic
def index_note(*, note) -> SearchDocument:
    require_tenant_scope(note.tenant)
    document = _index(
        tenant=note.tenant,
        object_type="note",
        object_id=note.pk,
        title=note.title,
        text=note.body,
        tags=[tag.slug for tag in note.tags.all()],
        workspace=note.workspace,
    )
    enqueue_event(
        tenant=note.tenant,
        event_type=SEARCH_DOCUMENT_INDEXED,
        aggregate_type="search_document",
        aggregate_id=document.pk,
        payload={"object_type": "note", "object_id": note.pk},
        idempotency_key=f"search.indexed:note:{note.pk}:{document.updated_at.isoformat()}",
    )
    return document


@transaction.atomic
def index_resource(*, resource) -> SearchDocument:
    require_tenant_scope(resource.tenant)
    text = " ".join(filter(None, [resource.description, resource.url]))
    document = _index(
        tenant=resource.tenant,
        object_type="resource",
        object_id=resource.pk,
        title=resource.title,
        text=text,
        workspace=resource.workspace,
    )
    enqueue_event(
        tenant=resource.tenant,
        event_type=SEARCH_DOCUMENT_INDEXED,
        aggregate_type="search_document",
        aggregate_id=document.pk,
        payload={"object_type": "resource", "object_id": resource.pk},
        idempotency_key=(
            f"search.indexed:resource:{resource.pk}:{document.updated_at.isoformat()}"
        ),
    )
    return document


@transaction.atomic
def remove_document(*, tenant, object_type: str, object_id) -> int:
    require_tenant_scope(tenant)
    deleted, _ = SearchDocument.objects.filter(
        tenant=tenant, object_type=object_type, object_id=object_id
    ).delete()
    if deleted:
        enqueue_event(
            tenant=tenant,
            event_type=SEARCH_DOCUMENT_REMOVED,
            aggregate_type="search_document",
            aggregate_id=object_id,
            payload={"object_type": object_type, "object_id": str(object_id)},
            idempotency_key=f"search.removed:{object_type}:{object_id}",
        )
    return deleted


@transaction.atomic
def reindex_tenant(*, tenant) -> dict:
    """Full rebuild of tenant projections from source-of-truth tables."""
    require_tenant_scope(tenant)
    from apps.knowledge.models import Resource
    from apps.notes.models import Note

    counts = {"note": 0, "resource": 0}
    for note in Note.objects.filter(tenant=tenant).prefetch_related("tags"):
        _index(
            tenant=tenant,
            object_type="note",
            object_id=note.pk,
            title=note.title,
            text=note.body,
            tags=[tag.slug for tag in note.tags.all()],
            workspace=note.workspace,
        )
        counts["note"] += 1
    for resource in Resource.objects.filter(tenant=tenant):
        _index(
            tenant=tenant,
            object_type="resource",
            object_id=resource.pk,
            title=resource.title,
            text=" ".join(filter(None, [resource.description, resource.url])),
            workspace=resource.workspace,
        )
        counts["resource"] += 1
    return counts


def _accessible_workspace_ids(*, tenant, user) -> list[int] | None:
    """Workspace ids visible to ``user``; ``None`` means no restriction."""
    if user is None or not getattr(user, "is_authenticated", False):
        return []
    return list(
        WorkspaceMember.objects.filter(
            user=user, workspace__tenant=tenant
        ).values_list("workspace_id", flat=True)
    )


def search(
    *,
    tenant,
    query: str = "",
    user=None,
    object_types=None,
    tag: str = "",
    limit: int = 30,
    offset: int = 0,
):
    require_tenant_scope(tenant)
    if limit < 1 or limit > 100:
        raise ValidationError("limit must be between 1 and 100.")
    if offset < 0:
        raise ValidationError("offset cannot be negative.")
    queryset = SearchDocument.objects.filter(tenant=tenant)
    if object_types:
        allowed = {choice for choice, _ in SearchDocument.OBJECT_TYPES}
        object_types = list(object_types)
        if not set(object_types) <= allowed:
            raise ValidationError("Unknown object type.")
        queryset = queryset.filter(object_type__in=object_types)
    query = (query or "").strip()
    if query:
        queryset = queryset.filter(
            Q(title__icontains=query) | Q(search_text__icontains=query)
        )
    tag = (tag or "").strip()
    if tag:
        queryset = queryset.filter(tag_slugs__icontains=f"|{tag}|")

    accessible = _accessible_workspace_ids(tenant=tenant, user=user)
    if accessible is not None:
        queryset = queryset.filter(
            Q(workspace__isnull=True) | Q(workspace_id__in=accessible)
        )
    total = queryset.count()
    rows = list(queryset[offset : offset + limit])
    return rows, total
