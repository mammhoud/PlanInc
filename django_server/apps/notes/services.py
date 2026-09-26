from django.db import transaction

from apps.operations.services import enqueue_event
from domain.events.types import NOTE_CREATED, NOTE_DELETED, NOTE_UPDATED
from domain.policies.tenant import require_tenant_scope

from .models import Note


def _account_name(user) -> str | None:
    username = (getattr(user, "username", "") or "").strip()
    return username or None


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
        title=title,
        body=body,
        author=author if getattr(author, "pk", None) else None,
    )
    payload = {"title": note.title}
    account_name = _account_name(author)
    if account_name:
        payload["accountName"] = account_name
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_CREATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload=payload,
        idempotency_key=f"note.created:{note.pk}",
    )
    return note


@transaction.atomic
def update_note(*, note: Note, title: str | None = None, body: str | None = None) -> Note:
    require_tenant_scope(note.tenant)
    if title is not None:
        note.title = title
    if body is not None:
        note.body = body
    note.save()
    payload = {"title": note.title}
    account_name = _account_name(note.author)
    if account_name:
        payload["accountName"] = account_name
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_UPDATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload=payload,
        idempotency_key=f"note.updated:{note.pk}:{note.updated_at.isoformat()}",
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
