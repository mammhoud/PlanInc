from django.db import models

from apps.tenancy.models import Tenant


class Note(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "title"],
                name="unique_note_title_per_tenant",
            )
        ]
