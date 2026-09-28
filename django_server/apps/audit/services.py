"""Audit service: append security/change evidence and query it back."""

from __future__ import annotations

from django.db import transaction

from apps.operations.services import enqueue_event
from domain.events.types import AUDIT_EVENT_RECORDED
from domain.policies.tenant import require_tenant_scope

from .models import AuditEvent


def _actor_pk(actor):
    return actor.pk if getattr(actor, "pk", None) else None


@transaction.atomic
def record_audit(
    *,
    tenant,
    action: str,
    actor=None,
    object_type: str = "",
    object_id: str | int = "",
    details: dict | None = None,
    request_id: str = "",
    ip_address: str | None = None,
) -> AuditEvent:
    require_tenant_scope(tenant)
    action = (action or "").strip()
    if not action:
        from domain.errors import ValidationError

        raise ValidationError("An audit action is required.")
    event = AuditEvent.objects.create(
        tenant=tenant,
        actor=_actor_pk(actor),
        action=action,
        object_type=object_type,
        object_id=str(object_id) if object_id != "" else "",
        details=details or {},
        request_id=request_id,
        ip_address=ip_address or None,
    )
    enqueue_event(
        tenant=tenant,
        event_type=AUDIT_EVENT_RECORDED,
        aggregate_type="audit_event",
        aggregate_id=event.pk,
        payload={"action": action, "object_type": object_type},
        idempotency_key=f"audit.event.recorded:{event.pk}",
    )
    return event


def events_for(*, tenant, action: str = "", object_type: str = "", limit: int = 100):
    require_tenant_scope(tenant)
    if limit < 1 or limit > 500:
        from domain.errors import ValidationError

        raise ValidationError("limit must be between 1 and 500.")
    queryset = AuditEvent.objects.filter(tenant=tenant)
    if action:
        queryset = queryset.filter(action=action)
    if object_type:
        queryset = queryset.filter(object_type=object_type)
    return queryset[:limit]


def record_change(*, tenant, action: str, instance, actor=None, details=None):
    """Convenience wrapper that derives object identity from an instance."""
    if instance is None:
        return None
    return record_audit(
        tenant=tenant,
        action=action,
        actor=actor,
        object_type=instance.__class__.__name__.lower(),
        object_id=instance.pk or "",
        details=details,
    )
