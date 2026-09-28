"""Analytics read models: daily counters and tenant summary projections."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.operations.services import enqueue_event
from domain.errors import ValidationError
from domain.events.types import ANALYTICS_METRIC_RECORDED
from domain.policies.tenant import require_tenant_scope

from .models import MetricSnapshot


@transaction.atomic
def increment_metric(
    *, tenant, metric: str, amount: int = 1, day=None
) -> MetricSnapshot:
    require_tenant_scope(tenant)
    metric = (metric or "").strip()
    if not metric:
        raise ValidationError("A metric name is required.")
    day = day or timezone.now().date()
    snapshot, _ = MetricSnapshot.objects.select_for_update().get_or_create(
        tenant=tenant,
        metric=metric,
        period_start=day,
        defaults={"value": 0},
    )
    snapshot.value = (snapshot.value or 0) + amount
    snapshot.save(update_fields=["value", "updated_at"])
    enqueue_event(
        tenant=tenant,
        event_type=ANALYTICS_METRIC_RECORDED,
        aggregate_type="metric_snapshot",
        aggregate_id=snapshot.pk,
        payload={"metric": metric, "value": snapshot.value},
        idempotency_key=f"analytics.metric:{metric}:{day}:{snapshot.value}",
    )
    return snapshot


def metrics_for(*, tenant, metric: str = "", since=None):
    require_tenant_scope(tenant)
    queryset = MetricSnapshot.objects.filter(tenant=tenant)
    if metric:
        queryset = queryset.filter(metric=metric)
    if since is not None:
        queryset = queryset.filter(period_start__gte=since)
    return queryset


def tenant_summary(*, tenant) -> dict:
    """Live counts across slices, used by dashboards before rollups exist."""
    require_tenant_scope(tenant)
    from apps.ai.models import AIConversation, AIRun
    from apps.integrations.models import ShareLink, WebhookEndpoint
    from apps.knowledge.models import Attachment, Resource
    from apps.notes.models import Note, NoteComment
    from apps.planning.models import StudyItem, Task, Ticket

    counters = {
        "notes": Note.objects.filter(tenant=tenant).count(),
        "note_comments": NoteComment.objects.filter(note__tenant=tenant).count(),
        "tasks": Task.objects.filter(tenant=tenant).count(),
        "tickets": Ticket.objects.filter(tenant=tenant).count(),
        "study_items": StudyItem.objects.filter(tenant=tenant).count(),
        "resources": Resource.objects.filter(tenant=tenant).count(),
        "attachments": Attachment.objects.filter(tenant=tenant).count(),
        "conversations": AIConversation.objects.filter(tenant=tenant).count(),
        "ai_runs": AIRun.objects.filter(conversation__tenant=tenant).count(),
        "webhooks": WebhookEndpoint.objects.filter(tenant=tenant).count(),
        "share_links": ShareLink.objects.filter(tenant=tenant).count(),
    }
    metrics = MetricSnapshot.objects.filter(tenant=tenant).aggregate(
        total=Sum("value")
    )
    counters["recorded_metrics_total"] = metrics["total"] or 0
    return counters
