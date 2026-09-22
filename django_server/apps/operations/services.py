from django.utils import timezone

from .models import OutboxEvent


def enqueue_event(
    *,
    tenant,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str | int,
    payload: dict,
    idempotency_key: str,
) -> OutboxEvent:
    event, _ = OutboxEvent.objects.get_or_create(
        idempotency_key=idempotency_key,
        defaults={
            "tenant": tenant,
            "event_type": event_type,
            "aggregate_type": aggregate_type,
            "aggregate_id": str(aggregate_id),
            "payload": payload,
            "available_at": timezone.now(),
        },
    )
    return event

