"""Knowledge use cases: resources, relations, attachments, previews, extraction."""

from __future__ import annotations

import re

from django.db import transaction

from apps.operations.services import enqueue_event
from domain.errors import ConflictError, NotFoundError, ValidationError
from domain.events.types import (
    ATTACHMENT_CREATED,
    ATTACHMENT_DELETED,
    EXTRACTION_COMPLETED,
    RESOURCE_CREATED,
    RESOURCE_DELETED,
    RESOURCE_RELATED,
    RESOURCE_UNRELATED,
    RESOURCE_UPDATED,
)
from domain.policies.tenant import require_same_tenant, require_tenant_scope

from .models import Attachment, Extraction, FilePreview, Resource, ResourceRelation

RESOURCE_KINDS = {choice for choice, _ in Resource.KIND_CHOICES}
RELATION_KINDS = {choice for choice, _ in ResourceRelation.KIND_CHOICES}
PREVIEW_KINDS = {choice for choice, _ in FilePreview.KIND_CHOICES}
EXTRACTION_STATUSES = {choice for choice, _ in Extraction.STATUS_CHOICES}
_UNSAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


def _actor_pk(actor):
    return actor.pk if getattr(actor, "pk", None) else None


def safe_filename(filename: str) -> str:
    """Reduce an uploaded name to a safe leaf: no separators or traversal."""
    name = (filename or "").strip().replace("\\", "/").split("/")[-1]
    name = name.replace("..", "_")
    name = _UNSAFE_FILENAME.sub("_", name).strip("._")
    if not name:
        raise ValidationError("The filename is invalid.")
    return name[:200]


def build_object_key(*, tenant, filename: str) -> str:
    """Tenant-prefixed object key: ``tenants/<schema>/uploads/<name>``."""
    require_tenant_scope(tenant)
    schema = (tenant.schema_name or "").strip()
    if not schema:
        raise ValidationError("The tenant has no schema name.")
    return f"tenants/{schema}/uploads/{safe_filename(filename)}"


# --------------------------------------------------------------------------- #
# Resources
# --------------------------------------------------------------------------- #
def list_resources(*, tenant, kind: str | None = None):
    require_tenant_scope(tenant)
    queryset = Resource.objects.filter(tenant=tenant)
    if kind:
        if kind not in RESOURCE_KINDS:
            raise ValidationError("Unknown resource kind.")
        queryset = queryset.filter(kind=kind)
    return queryset


@transaction.atomic
def create_resource(
    *,
    tenant,
    title: str,
    kind: str = "link",
    workspace=None,
    url: str = "",
    description: str = "",
    created_by=None,
) -> Resource:
    require_tenant_scope(tenant)
    title = (title or "").strip()
    if not title:
        raise ValidationError("A resource title is required.")
    if kind not in RESOURCE_KINDS:
        raise ValidationError("Unknown resource kind.")
    resource = Resource.objects.create(
        tenant=tenant,
        workspace=workspace,
        title=title,
        kind=kind,
        url=url,
        description=description,
        created_by=_actor_pk(created_by),
    )
    enqueue_event(
        tenant=tenant,
        event_type=RESOURCE_CREATED,
        aggregate_type="resource",
        aggregate_id=resource.pk,
        payload={"title": resource.title, "kind": resource.kind},
        idempotency_key=f"resource.created:{resource.pk}",
    )
    return resource


@transaction.atomic
def update_resource(*, resource: Resource, **fields) -> Resource:
    require_tenant_scope(resource.tenant)
    if fields.get("kind") is not None:
        if fields["kind"] not in RESOURCE_KINDS:
            raise ValidationError("Unknown resource kind.")
        resource.kind = fields["kind"]
    for field in ("title", "url", "description"):
        if fields.get(field) is not None:
            value = str(fields[field]).strip()
            if field == "title" and not value:
                raise ValidationError("A resource title is required.")
            setattr(resource, field, value)
    resource.save()
    enqueue_event(
        tenant=resource.tenant,
        event_type=RESOURCE_UPDATED,
        aggregate_type="resource",
        aggregate_id=resource.pk,
        payload={"title": resource.title},
        idempotency_key=(
            f"resource.updated:{resource.pk}:{resource.updated_at.isoformat()}"
        ),
    )
    return resource


@transaction.atomic
def delete_resource(*, resource: Resource) -> None:
    require_tenant_scope(resource.tenant)
    tenant = resource.tenant
    resource_id = resource.pk
    resource.delete()
    enqueue_event(
        tenant=tenant,
        event_type=RESOURCE_DELETED,
        aggregate_type="resource",
        aggregate_id=resource_id,
        payload={},
        idempotency_key=f"resource.deleted:{resource_id}",
    )


# --------------------------------------------------------------------------- #
# Relations
# --------------------------------------------------------------------------- #
def list_relations(*, resource: Resource):
    require_tenant_scope(resource.tenant)
    return resource.outgoing_relations.select_related("target")


@transaction.atomic
def create_relation(
    *, source: Resource, target: Resource, kind: str = "relates"
) -> ResourceRelation:
    require_tenant_scope(source.tenant)
    require_same_tenant(tenant=source.tenant, resource=target)
    if kind not in RELATION_KINDS:
        raise ValidationError("Unknown relation kind.")
    if source.pk == target.pk:
        raise ValidationError("A resource cannot relate to itself.")
    relation, created = ResourceRelation.objects.get_or_create(
        source=source,
        target=target,
        kind=kind,
        defaults={"tenant": source.tenant},
    )
    if created:
        enqueue_event(
            tenant=source.tenant,
            event_type=RESOURCE_RELATED,
            aggregate_type="resource",
            aggregate_id=source.pk,
            payload={"target_id": target.pk, "kind": kind},
            idempotency_key=f"resource.related:{source.pk}:{target.pk}:{kind}",
        )
    return relation


@transaction.atomic
def delete_relation(*, relation: ResourceRelation) -> None:
    require_tenant_scope(relation.tenant)
    tenant = relation.tenant
    relation_id = relation.pk
    source_id = relation.source_id
    target_id = relation.target_id
    relation.delete()
    enqueue_event(
        tenant=tenant,
        event_type=RESOURCE_UNRELATED,
        aggregate_type="resource",
        aggregate_id=source_id,
        payload={"target_id": target_id},
        idempotency_key=f"resource.unrelated:{relation_id}",
    )


# --------------------------------------------------------------------------- #
# Attachments
# --------------------------------------------------------------------------- #
def list_attachments(*, tenant, note=None, resource=None):
    require_tenant_scope(tenant)
    queryset = Attachment.objects.filter(tenant=tenant).select_related(
        "note", "resource"
    )
    if note is not None:
        queryset = queryset.filter(note=note)
    if resource is not None:
        queryset = queryset.filter(resource=resource)
    return queryset


@transaction.atomic
def create_attachment(
    *,
    tenant,
    filename: str,
    note=None,
    resource=None,
    content_type: str = "",
    size_bytes: int = 0,
    sha256: str = "",
    created_by=None,
) -> Attachment:
    require_tenant_scope(tenant)
    if note is not None:
        require_same_tenant(tenant=tenant, resource=note)
    if resource is not None:
        require_same_tenant(tenant=tenant, resource=resource)
    if size_bytes < 0:
        raise ValidationError("size_bytes cannot be negative.")
    object_key = build_object_key(tenant=tenant, filename=filename)
    if Attachment.objects.filter(tenant=tenant, object_key=object_key).exists():
        raise ConflictError("An attachment with that object key already exists.")
    attachment = Attachment.objects.create(
        tenant=tenant,
        note=note,
        resource=resource,
        filename=safe_filename(filename),
        content_type=content_type,
        size_bytes=size_bytes,
        sha256=sha256,
        object_key=object_key,
        created_by=_actor_pk(created_by),
    )
    enqueue_event(
        tenant=tenant,
        event_type=ATTACHMENT_CREATED,
        aggregate_type="attachment",
        aggregate_id=attachment.pk,
        payload={"object_key": attachment.object_key},
        idempotency_key=f"attachment.created:{attachment.pk}",
    )
    return attachment


@transaction.atomic
def delete_attachment(*, attachment: Attachment) -> None:
    require_tenant_scope(attachment.tenant)
    tenant = attachment.tenant
    attachment_id = attachment.pk
    object_key = attachment.object_key
    attachment.delete()
    enqueue_event(
        tenant=tenant,
        event_type=ATTACHMENT_DELETED,
        aggregate_type="attachment",
        aggregate_id=attachment_id,
        payload={"object_key": object_key},
        idempotency_key=f"attachment.deleted:{attachment_id}",
    )


# --------------------------------------------------------------------------- #
# Previews
# --------------------------------------------------------------------------- #
def list_previews(*, attachment: Attachment):
    require_tenant_scope(attachment.tenant)
    return attachment.previews.all()


@transaction.atomic
def create_preview(
    *,
    attachment: Attachment,
    kind: str = "text",
    content: str = "",
    object_key: str = "",
) -> FilePreview:
    require_tenant_scope(attachment.tenant)
    if kind not in PREVIEW_KINDS:
        raise ValidationError("Unknown preview kind.")
    preview, _ = FilePreview.objects.update_or_create(
        attachment=attachment,
        kind=kind,
        defaults={"content": content, "object_key": object_key},
    )
    return preview


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #
@transaction.atomic
def request_extraction(*, attachment: Attachment) -> Extraction:
    require_tenant_scope(attachment.tenant)
    extraction, _ = Extraction.objects.get_or_create(
        attachment=attachment,
        defaults={"status": "pending"},
    )
    if extraction.status in ("done", "failed"):
        extraction.status = "pending"
        extraction.error = ""
        extraction.save(update_fields=["status", "error", "updated_at"])
    return extraction


@transaction.atomic
def complete_extraction(
    *, attachment: Attachment, text: str, status: str = "done", error: str = ""
) -> Extraction:
    require_tenant_scope(attachment.tenant)
    if status not in EXTRACTION_STATUSES:
        raise ValidationError("Unknown extraction status.")
    if status == "done" and not (text or "").strip():
        raise ValidationError("A done extraction requires text.")
    extraction = Extraction.objects.filter(attachment=attachment).first()
    if extraction is None:
        raise NotFoundError("No extraction is pending for this attachment.")
    extraction.status = status
    extraction.text = text
    extraction.error = error
    extraction.save()
    enqueue_event(
        tenant=attachment.tenant,
        event_type=EXTRACTION_COMPLETED,
        aggregate_type="attachment",
        aggregate_id=attachment.pk,
        payload={"status": status, "chars": len(text or "")},
        idempotency_key=(
            f"extraction.completed:{attachment.pk}:{extraction.updated_at.isoformat()}"
        ),
    )
    return extraction
