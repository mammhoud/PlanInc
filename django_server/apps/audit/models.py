from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class AuditEvent(models.Model):
    """Append-only security/change evidence for tenant-scoped mutations."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="audit_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_audit_events",
    )
    action = models.CharField(max_length=120)
    object_type = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=120, blank=True)
    details = models.JSONField(default=dict, blank=True)
    request_id = models.CharField(max_length=120, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "action", "created_at"]),
            models.Index(fields=["tenant", "object_type", "object_id"]),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError("Audit events are append-only.")
        return super().save(*args, **kwargs)
