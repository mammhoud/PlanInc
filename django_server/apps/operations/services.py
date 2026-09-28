from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from domain.errors import ValidationError
from domain.policies.tenant import require_tenant_scope

from .models import (
    JobCheckpoint,
    OutboxEvent,
    RetentionPolicy,
    RetentionRecord,
)


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


@transaction.atomic
def save_checkpoint(
    *,
    tenant,
    job_type: str,
    scope: str = "",
    cursor: dict | None = None,
    processed: int | None = None,
    complete: bool = False,
) -> JobCheckpoint:
    """Upsert one job checkpoint.

    ``processed`` is monotonic: a later call with a lower value never moves it
    backwards, so replaying an older batch stays safe. ``cursor`` is overwritten
    only when supplied.
    """
    require_tenant_scope(tenant)
    job_type = (job_type or "").strip()
    if not job_type:
        raise ValidationError("A job type is required.")
    checkpoint, _ = JobCheckpoint.objects.select_for_update().get_or_create(
        tenant=tenant,
        job_type=job_type,
        scope=scope or "",
        defaults={
            "cursor": cursor or {},
            "processed": processed or 0,
        },
    )
    if cursor is not None:
        checkpoint.cursor = cursor
    if processed is not None and processed > checkpoint.processed:
        checkpoint.processed = processed
    if complete:
        checkpoint.is_complete = True
    checkpoint.save()
    return checkpoint


def get_checkpoint(*, tenant, job_type: str, scope: str = ""):
    require_tenant_scope(tenant)
    return JobCheckpoint.objects.filter(
        tenant=tenant,
        job_type=job_type,
        scope=scope or "",
    ).first()


@transaction.atomic
def set_retention_policy(
    *,
    tenant,
    aggregate_type: str,
    ttl_days: int,
    is_active: bool = True,
) -> RetentionPolicy:
    require_tenant_scope(tenant)
    if ttl_days < 1:
        raise ValidationError("ttl_days must be at least 1.")
    policy, _ = RetentionPolicy.objects.update_or_create(
        tenant=tenant,
        aggregate_type=aggregate_type,
        defaults={"ttl_days": ttl_days, "is_active": is_active},
    )
    return policy


def retention_cutoff(*, tenant, aggregate_type: str):
    """Return the oldest kept timestamp, or ``None`` when no active policy."""
    require_tenant_scope(tenant)
    policy = RetentionPolicy.objects.filter(
        tenant=tenant,
        aggregate_type=aggregate_type,
        is_active=True,
    ).first()
    if policy is None:
        return None
    return timezone.now() - timedelta(days=policy.ttl_days)


@transaction.atomic
def record_retention(
    *,
    tenant,
    aggregate_type: str,
    aggregate_id: str | int,
    action: str,
    reason: str = "",
) -> RetentionRecord:
    require_tenant_scope(tenant)
    if action not in dict(RetentionRecord.ACTIONS):
        raise ValidationError("Unknown retention action.")
    return RetentionRecord.objects.create(
        tenant=tenant,
        aggregate_type=aggregate_type,
        aggregate_id=str(aggregate_id),
        action=action,
        reason=reason,
    )
