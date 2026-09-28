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


class JobCheckpoint(models.Model):
    """Durable, resumable progress for one tenant-scoped job.

    Imports and long-running workers advance ``cursor``/``processed`` in bounded
    batches and only mark ``is_complete`` after the enclosing transaction
    commits, so a restart resumes from the last committed position.
    """

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="job_checkpoints",
    )
    job_type = models.CharField(max_length=120)
    scope = models.CharField(max_length=180, blank=True, default="")
    cursor = models.JSONField(default=dict, blank=True)
    processed = models.PositiveIntegerField(default=0)
    is_complete = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "job_type", "scope"],
                name="operations_jobcheckpoint_unique_scope",
            )
        ]
        indexes = [models.Index(fields=["tenant", "job_type"])]


class RetentionPolicy(models.Model):
    """Per-tenant retention window for one aggregate type."""

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="retention_policies",
    )
    aggregate_type = models.CharField(max_length=80)
    ttl_days = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "aggregate_type"],
                name="operations_retentionpolicy_unique_type",
            )
        ]


class RetentionRecord(models.Model):
    """Audit trail of retention decisions (purged or deliberately retained)."""

    PURGED = "purged"
    RETAINED = "retained"
    ACTIONS = [(PURGED, "purged"), (RETAINED, "retained")]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="retention_records",
    )
    aggregate_type = models.CharField(max_length=80)
    aggregate_id = models.CharField(max_length=120)
    action = models.CharField(max_length=20, choices=ACTIONS)
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "aggregate_type", "created_at"])
        ]
