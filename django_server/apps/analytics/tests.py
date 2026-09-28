from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note
from apps.tenancy.models import Tenant
from domain.errors import AuthorizationError

from .models import MetricSnapshot
from .services import increment_metric, tenant_summary


class AnalyticsTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.tenant = Tenant.objects.get(slug="demo")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def test_increment_metric_accumulates(self):
        increment_metric(tenant=self.tenant, metric="note.created", amount=2)
        increment_metric(tenant=self.tenant, metric="note.created", amount=3)
        snapshot = MetricSnapshot.objects.get(tenant=self.tenant)
        self.assertEqual(snapshot.value, 5)
        self.assertEqual(MetricSnapshot.objects.count(), 1)

    def test_metrics_endpoint(self):
        response = self.client.post(
            "/api/analytics/metrics",
            data='{"metric":"page.viewed","amount":4}',
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        response = self.client.get("/api/analytics/metrics", **self.headers)
        self.assertEqual(response.json()["data"][0]["value"], 4)

    def test_summary_counts_and_isolation(self):
        Note.objects.create(tenant=self.tenant, title="One")
        Note.objects.create(tenant=self.tenant, title="Two")
        Note.objects.create(tenant=Tenant.objects.get(slug="other"), title="Other")
        summary = tenant_summary(tenant=self.tenant)
        self.assertEqual(summary["notes"], 2)

        response = self.client.get("/api/analytics/summary", **self.headers)
        self.assertEqual(response.json()["data"]["notes"], 2)

    def test_metric_requires_tenant(self):
        with self.assertRaises(AuthorizationError):
            increment_metric(tenant=None, metric="x")
