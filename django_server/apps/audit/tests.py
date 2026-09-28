from django.core.management import call_command
from django.test import TestCase

from apps.tenancy.models import Tenant
from domain.errors import AuthorizationError, ValidationError

from .models import AuditEvent
from .services import record_audit


class AuditTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.tenant = Tenant.objects.get(slug="demo")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def test_note_writes_are_audited_and_readable(self):
        response = self.client.post(
            "/api/notes",
            data='{"title":"Audited"}',
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            AuditEvent.objects.filter(
                tenant=self.tenant, action="note.created"
            ).exists()
        )

        response = self.client.get("/api/audit?action=note.created", **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["data"]), 1)
        self.assertEqual(response.json()["data"][0]["object_type"], "note")

    def test_audit_events_are_append_only(self):
        event = record_audit(tenant=self.tenant, action="test.action")
        event.action = "changed"
        with self.assertRaises(ValueError):
            event.save()

    def test_audit_is_tenant_scoped(self):
        record_audit(tenant=self.tenant, action="demo.action")
        record_audit(
            tenant=Tenant.objects.get(slug="other"), action="other.action"
        )
        response = self.client.get("/api/audit", **self.headers)
        actions = [row["action"] for row in response.json()["data"]]
        self.assertEqual(actions, ["demo.action"])

    def test_record_audit_requires_action_and_tenant(self):
        with self.assertRaises(ValidationError):
            record_audit(tenant=self.tenant, action="")
        with self.assertRaises(AuthorizationError):
            record_audit(tenant=None, action="x")
