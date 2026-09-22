from django.core.validators import RegexValidator
from django.db import models

slug_validator = RegexValidator(
    regex=r"^[a-z][a-z0-9-]{1,62}$",
    message="Use 2-63 lowercase letters, numbers, or hyphens.",
)


class Tenant(models.Model):
    slug = models.CharField(max_length=63, unique=True, validators=[slug_validator])
    name = models.CharField(max_length=160)
    schema_name = models.CharField(max_length=63, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["slug"]


class Domain(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="domains")
    hostname = models.CharField(max_length=255, unique=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ["hostname"]


class Membership(models.Model):
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.CASCADE,
        related_name="planinc_memberships",
    )
    role = models.CharField(max_length=32, default="member")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "user"],
                name="unique_tenant_membership",
            )
        ]


class TenantProvisioningEvent(models.Model):
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="provisioning_events",
    )
    event_type = models.CharField(max_length=64)
    details = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
