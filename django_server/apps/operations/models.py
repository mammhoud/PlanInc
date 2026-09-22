from django.db import models

from apps.tenancy.models import Tenant


class OutboxEvent(models.Model):
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="outbox_events",
    )
    event_type = models.CharField(max_length=120)
    aggregate_type = models.CharField(max_length=80)
    aggregate_id = models.CharField(max_length=120)
    payload = models.JSONField(default=dict)
    idempotency_key = models.CharField(max_length=180, unique=True)
    available_at = models.DateTimeField()
    published_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["available_at", "id"]
        indexes = [
            models.Index(fields=["published_at", "available_at"]),
            models.Index(fields=["tenant", "event_type"]),
        ]


class JobAttempt(models.Model):
    event = models.ForeignKey(
        OutboxEvent,
        on_delete=models.CASCADE,
        related_name="job_attempts",
    )
    status = models.CharField(max_length=20)
    error = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

