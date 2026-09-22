from django.core.management import call_command
from django.test import TestCase

from .models import Tenant


class TenancyTests(TestCase):
    def test_provision_command_is_idempotent(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "demo", name="Demo")

        self.assertEqual(Tenant.objects.filter(slug="demo").count(), 1)
        self.assertEqual(Tenant.objects.get(slug="demo").schema_name, "tenant_demo")

    def test_context_requires_a_tenant(self):
        response = self.client.get("/api/tenancy/context")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "tenant_required")

    def test_context_rejects_unknown_tenant(self):
        response = self.client.get(
            "/api/tenancy/context",
            HTTP_X_PLANINC_TENANT="demo",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "tenant_not_found")

    def test_context_returns_active_tenant(self):
        call_command("provision_tenant", "demo", name="Demo")

        response = self.client.get(
            "/api/tenancy/context",
            HTTP_X_PLANINC_TENANT="demo",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["schema_name"], "tenant_demo")
