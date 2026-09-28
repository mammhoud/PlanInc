from django.db import models

from apps.tenancy.models import Tenant


class MetricSnapshot(models.Model):
    """Daily counter read model: one row per tenant/metric/day."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="metric_snapshots"
    )
    metric = models.CharField(max_length=120)
    period_start = models.DateField()
    value = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-period_start", "metric"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "metric", "period_start"],
                name="unique_metric_snapshot",
            )
        ]
        indexes = [models.Index(fields=["tenant", "period_start"])]
