from django.db import transaction

from apps.operations.services import enqueue_event
from domain.events.types import NOTE_CREATED, NOTE_DELETED, NOTE_UPDATED
from domain.policies.tenant import require_tenant_scope

from .models import Note


@transaction.atomic
def create_note(*, tenant, title: str, body: str = "") -> Note:
    require_tenant_scope(tenant)
    note = Note.objects.create(tenant=tenant, title=title, body=body)
    enqueue_event(
        tenant=tenant,
        event_type=NOTE_CREATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"title": note.title},
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
    enqueue_event(
        tenant=note.tenant,
        event_type=NOTE_UPDATED,
        aggregate_type="note",
        aggregate_id=note.pk,
        payload={"title": note.title},
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
