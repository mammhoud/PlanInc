"""Notes use cases: capture, edit, history, tags, comments, and links.

All of these are transport-agnostic. ``api.adapters`` renders their
``ServiceError`` failures for the HTTP surfaces, and every write emits a durable
outbox event so search, AI, and WebSocket subscribers can react without the
route handler knowing about them.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.audit.services import record_audit
from apps.operations.services import enqueue_event
from domain.errors import ConflictError, NotFoundError, ValidationError
from domain.events.types import (
    NOTE_COMMENT_DELETED,
    NOTE_COMMENT_UPDATED,
    NOTE_COMMENTED,
    NOTE_CREATED,
    NOTE_DELETED,
    NOTE_LINKED,
    NOTE_TAGGED,
    NOTE_UNLINKED,
    NOTE_UNTAGGED,
    NOTE_UPDATED,
    NOTE_VERSIONED,
)
from domain.policies.tenant import require_same_tenant, require_tenant_scope

from .models import Note, NoteComment, NoteLink, NoteVersion, Tag


def _account_name(user) -> str | None:
    username = (getattr(user, "username", "") or "").strip()
    return username or None


def _actor_pk(actor):
    return actor.pk if getattr(actor, "pk", None) else None


def _note_payload(note: Note, *, author=None) -> dict:
    payload = {"title": note.title}
    account_name = _account_name(author)
    if account_name:
        payload["accountName"] = account_name
    return payload


def _next_version_number(note: Note) -> int:
    last = note.versions.order_by("-version").first()
    return (last.version if last is not None else 0) + 1


def _snapshot(*, note: Note, author=None, version: int | None = None) -> NoteVersion:
    """Persist an immutable snapshot of the note's current title/body."""
    return NoteVersion.objects.create(
        note=note,
        version=version or _next_version_number(note),
        title=note.title,
        body=note.body,
        author=_actor_pk(author),
    )


# --------------------------------------------------------------------------- #
# Notes
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_note(
    *,
    tenant,
    title: str,
    body: str = "",
    workspace=None,
    actor=None,
    author=None,
) -> Note:
    require_tenant_scope(tenant)
    title = (title or "").strip()
    if not title:
        raise ValidationError("A note title is required.")
    if workspace is not None:
        from apps.workspaces.services import can_access_workspace
        from domain.policies.tenant import require_workspace_scope

        require_workspace_scope(tenant=tenant, workspace=workspace)
        if actor is not None and not can_access_workspace(
            workspace=workspace, user=actor, minimum_role="editor"
        ):
            from domain.policies.tenant import TenantAccessError

            raise TenantAccessError("The actor cannot write in this workspace.")
    note = Note.objects.create(
        tenant=tenant,
        workspace=workspace,
        title=title,
        body=body,
        author=_actor_pk(author),
    )
    # Every note has a version 1 so history is never empty.
    _snapshot(note=note, author=author, version=1)
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_CREATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload=_note_payload(note, author=author),
        idempotency_key=f"note.created:{note.pk}",
    )
    record_audit(
        tenant=tenant,
        action="note.created",
        actor=actor,
        object_type="note",
        object_id=note.pk,
    )
    return note


@transaction.atomic
def update_note(
    *,
    note: Note,
    title: str | None = None,
    body: str | None = None,
    actor=None,
) -> Note:
    require_tenant_scope(note.tenant)
    changed = False
    if title is not None:
        title = title.strip()
        if not title:
            raise ValidationError("A note title is required.")
        if title != note.title:
            note.title = title
            changed = True
    if body is not None and body != note.body:
        note.body = body
        changed = True
    if not changed:
        return note
    note.save()
    version = _snapshot(note=note, author=actor)
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_VERSIONED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"version": version.version, "title": note.title},
        idempotency_key=f"note.versioned:{note.pk}:{version.version}",
    )
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_UPDATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload=_note_payload(note, author=actor or note.author),
        idempotency_key=f"note.updated:{note.pk}:{note.updated_at.isoformat()}",
    )
    record_audit(
        tenant=note.tenant,
        action="note.updated",
        actor=actor,
        object_type="note",
        object_id=note.pk,
    )
    return note


@transaction.atomic
def delete_note(*, note: Note) -> None:
    require_tenant_scope(note.tenant)
    tenant = note.tenant
    note_id = note.pk
    note.delete()
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_DELETED,
        aggregate_type="note",
        aggregate_id=note_id,
        payload={},
        idempotency_key=f"note.deleted:{note_id}",
    )
    record_audit(
        tenant=tenant,
        action="note.deleted",
        object_type="note",
        object_id=note_id,
    )


# --------------------------------------------------------------------------- #
# History / versions
# --------------------------------------------------------------------------- #
def list_versions(*, note: Note):
    require_tenant_scope(note.tenant)
    return note.versions.all()


@transaction.atomic
def create_version(*, note: Note, actor=None) -> NoteVersion:
    """Force a manual snapshot of the current note (e.g. a named checkpoint)."""
    require_tenant_scope(note.tenant)
    version = _snapshot(note=note, author=actor)
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_VERSIONED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"version": version.version, "title": note.title},
        idempotency_key=f"note.versioned:{note.pk}:{version.version}",
    )
    return version


@transaction.atomic
def restore_version(*, note: Note, version: NoteVersion, actor=None) -> Note:
    """Restore a historical snapshot into the note as a new version."""
    require_tenant_scope(note.tenant)
    require_same_tenant(tenant=note.tenant, resource=version.note)
    if version.note_id != note.pk:
        raise NotFoundError("The version does not belong to this note.")
    note.title = version.title
    note.body = version.body
    note.save()
    new_version = _snapshot(note=note, author=actor)
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_UPDATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={**_note_payload(note, author=actor), "restoredFrom": version.version},
        idempotency_key=f"note.updated:{note.pk}:{note.updated_at.isoformat()}",
    )
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_VERSIONED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"version": new_version.version, "restoredFrom": version.version},
        idempotency_key=f"note.versioned:{note.pk}:{new_version.version}",
    )
    return note


# --------------------------------------------------------------------------- #
# Tags
# --------------------------------------------------------------------------- #
def list_tags(*, tenant):
    require_tenant_scope(tenant)
    return Tag.objects.filter(tenant=tenant)


@transaction.atomic
def create_tag(*, tenant, name: str, color: str = "") -> Tag:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A tag name is required.")
    slug = slugify(name)[:80]
    if not slug:
        raise ValidationError("The tag name does not produce a usable slug.")
    if Tag.objects.filter(tenant=tenant, slug=slug).exists():
        raise ConflictError("A tag with that name already exists.")
    return Tag.objects.create(tenant=tenant, name=name, slug=slug, color=color)


@transaction.atomic
def attach_tag(*, note: Note, tag: Tag) -> None:
    require_tenant_scope(note.tenant)
    require_same_tenant(tenant=note.tenant, resource=tag)
    if not note.tags.filter(pk=tag.pk).exists():
        note.tags.add(tag)
        enqueue_event(
            tenant=note.tenant,
            event_type=NOTE_TAGGED,
            aggregate_type="note",
            aggregate_id=note.pk,
            payload={"tag": tag.slug},
            idempotency_key=f"note.tagged:{note.pk}:{tag.pk}",
        )


@transaction.atomic
def detach_tag(*, note: Note, tag: Tag) -> None:
    require_tenant_scope(note.tenant)
    if note.tags.filter(pk=tag.pk).exists():
        note.tags.remove(tag)
        enqueue_event(
            tenant=note.tenant,
            event_type=NOTE_UNTAGGED,
            aggregate_type="note",
            aggregate_id=note.pk,
            payload={"tag": tag.slug},
            idempotency_key=f"note.untagged:{note.pk}:{tag.pk}:{timezone.now().isoformat()}",
        )


@transaction.atomic
def set_note_tags(*, note: Note, tag_ids) -> list[Tag]:
    """Replace the note's tags with ``tag_ids`` (all must belong to the tenant)."""
    require_tenant_scope(note.tenant)
    tag_ids = list(dict.fromkeys(int(tag_id) for tag_id in tag_ids))
    tags = list(Tag.objects.filter(tenant=note.tenant, id__in=tag_ids))
    if len(tags) != len(tag_ids):
        raise ValidationError("One or more tags are unknown for this tenant.")
    current = {tag.pk for tag in note.tags.all()}
    desired = {tag.pk for tag in tags}
    for tag in tags:
        if tag.pk not in current:
            attach_tag(note=note, tag=tag)
    for tag in note.tags.all():
        if tag.pk not in desired:
            detach_tag(note=note, tag=tag)
    return tags


# --------------------------------------------------------------------------- #
# Comments
# --------------------------------------------------------------------------- #
def list_comments(*, note: Note):
    require_tenant_scope(note.tenant)
    return note.comments.all()


@transaction.atomic
def add_comment(
    *,
    note: Note,
    body: str,
    author=None,
    parent: NoteComment | None = None,
) -> NoteComment:
    require_tenant_scope(note.tenant)
    body = (body or "").strip()
    if not body:
        raise ValidationError("A comment body is required.")
    if parent is not None and parent.note_id != note.pk:
        raise ValidationError("The parent comment belongs to another note.")
    comment = NoteComment.objects.create(
        note=note,
        author=_actor_pk(author),
        parent=parent,
        body=body,
    )
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_COMMENTED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"comment_id": comment.pk},
        idempotency_key=f"note.commented:{comment.pk}",
    )
    return comment


@transaction.atomic
def update_comment(*, comment: NoteComment, body: str) -> NoteComment:
    require_tenant_scope(comment.note.tenant)
    body = (body or "").strip()
    if not body:
        raise ValidationError("A comment body is required.")
    comment.body = body
    comment.save(update_fields=["body", "updated_at"])
    enqueue_event(
        tenant=comment.note.tenant,
        event_type=NOTE_COMMENT_UPDATED,
        aggregate_type="note",
        aggregate_id=comment.note_id,
        payload={"comment_id": comment.pk},
        idempotency_key=f"note.comment.updated:{comment.pk}:{comment.updated_at.isoformat()}",
    )
    return comment


@transaction.atomic
def resolve_comment(*, comment: NoteComment, resolved: bool = True) -> NoteComment:
    require_tenant_scope(comment.note.tenant)
    comment.resolved_at = timezone.now() if resolved else None
    comment.save(update_fields=["resolved_at", "updated_at"])
    return comment


@transaction.atomic
def delete_comment(*, comment: NoteComment) -> None:
    require_tenant_scope(comment.note.tenant)
    tenant = comment.note.tenant
    note_id = comment.note_id
    comment_id = comment.pk
    comment.delete()
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_COMMENT_DELETED,
        aggregate_type="note",
        aggregate_id=note_id,
        payload={"comment_id": comment_id},
        idempotency_key=f"note.comment.deleted:{comment_id}",
    )


# --------------------------------------------------------------------------- #
# Links / backlinks
# --------------------------------------------------------------------------- #
def list_outgoing_links(*, note: Note):
    require_tenant_scope(note.tenant)
    return note.outgoing_links.select_related("target")


def list_backlinks(*, note: Note):
    require_tenant_scope(note.tenant)
    return note.incoming_links.select_related("source")


@transaction.atomic
def create_link(*, source: Note, target: Note) -> NoteLink:
    require_tenant_scope(source.tenant)
    require_same_tenant(tenant=source.tenant, resource=target)
    if source.pk == target.pk:
        raise ValidationError("A note cannot link to itself.")
    link, created = NoteLink.objects.get_or_create(
        source=source,
        target=target,
        defaults={"tenant": source.tenant},
    )
    if created:
        enqueue_event(
            tenant=source.tenant,
            event_type=NOTE_LINKED,
            aggregate_type="note",
            aggregate_id=source.pk,
            payload={"target_id": target.pk},
            idempotency_key=f"note.linked:{source.pk}:{target.pk}",
        )
    return link


@transaction.atomic
def delete_link(*, link: NoteLink) -> None:
    require_tenant_scope(link.tenant)
    tenant = link.tenant
    source_id = link.source_id
    target_id = link.target_id
    link_id = link.pk
    link.delete()
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_UNLINKED,
        aggregate_type="note",
        aggregate_id=source_id,
        payload={"target_id": target_id},
        idempotency_key=f"note.unlinked:{link_id}",
    )
