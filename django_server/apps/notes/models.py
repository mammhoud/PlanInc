from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class Note(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    # Author drives the Surreal account mapping on sync (username equality).
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_notes",
    )
    # Stable cross-store identity for Surreal↔Postgres sync
    # (e.g. "surreal:notes:42"). Null for natively-created rows.
    external_id = models.CharField(max_length=180, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "title"],
                name="unique_note_title_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["tenant", "external_id"],
                name="unique_note_external_id_per_tenant",
            ),
        ]
