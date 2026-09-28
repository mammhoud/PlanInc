import json

from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note
from apps.tenancy.models import Tenant

from .models import ShareLink, WebhookDelivery, WebhookEndpoint
from .services import create_webhook


class IntegrationTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.tenant = Tenant.objects.get(slug="demo")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def _post(self, url, payload, tenant="demo"):
        return self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT=tenant,
        )

    def test_rss_feed_lifecycle(self):
        response = self._post(
            "/api/integrations/rss", {"url": "https://example.com/feed"}
        )
        self.assertEqual(response.status_code, 201)
        feed_id = response.json()["data"]["id"]
        response = self._post(
            "/api/integrations/rss", {"url": "https://example.com/feed"}
        )
        self.assertEqual(response.status_code, 409)
        response = self.client.delete(
            f"/api/integrations/rss/{feed_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)

    def test_webhook_secret_never_serialized(self):
        response = self._post(
            "/api/integrations/webhooks",
            {"url": "https://hooks.example.com/x", "secret": "whsec_topsecret"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("whsec_topsecret", response.content.decode())
        self.assertNotIn("encrypted_secret", response.content.decode())
        self.assertTrue(response.json()["data"]["has_secret"])

    def test_webhook_delivery_queue(self):
        response = self._post(
            "/api/integrations/webhooks", {"url": "https://hooks.example.com/y"}
        )
        endpoint_id = response.json()["data"]["id"]
        response = self._post(
            f"/api/integrations/webhooks/{endpoint_id}/deliveries",
            {"event_type": "note.created", "payload": {"id": 1}},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["status"], "queued")
        self.assertEqual(WebhookDelivery.objects.count(), 1)

        delivery = WebhookDelivery.objects.get()
        from .services import record_delivery

        record_delivery(delivery=delivery, status="delivered", response_code=200)
        self.assertEqual(delivery.attempts, 1)

    def test_plugin_install_and_uninstall(self):
        response = self._post(
            "/api/integrations/plugins", {"name": "calendar", "version": "1.2.0"}
        )
        self.assertEqual(response.status_code, 201)
        plugin_id = response.json()["data"]["id"]
        response = self.client.delete(
            f"/api/integrations/plugins/{plugin_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)

    def test_mcp_credentials_not_exposed(self):
        response = self._post(
            "/api/integrations/mcp",
            {"name": "files", "transport": "sse", "api_key": "mcp-key"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("mcp-key", response.content.decode())
        self.assertTrue(response.json()["data"]["has_credentials"])

    def test_sso_configure(self):
        response = self._post(
            "/api/integrations/sso",
            {"provider": "oidc", "client_id": "abc", "client_secret": "s3cr3t"},
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("s3cr3t", response.content.decode())
        self.assertTrue(response.json()["data"]["has_secret"])

    def test_share_link_resolution_and_isolation(self):
        note = Note.objects.create(tenant=self.tenant, title="Shared")
        response = self._post(
            "/api/integrations/shares", {"note_id": note.id}
        )
        self.assertEqual(response.status_code, 201)
        token = response.json()["data"]["token"]

        response = self.client.get(
            f"/api/integrations/shares/{token}/resolve", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["note"]["title"], "Shared")

        # Another tenant cannot resolve the token.
        response = self.client.get(
            f"/api/integrations/shares/{token}/resolve",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

    def test_share_link_revoke(self):
        response = self._post("/api/integrations/shares", {})
        link_id = response.json()["data"]["id"]
        token = response.json()["data"]["token"]
        self.client.delete(
            f"/api/integrations/shares/{link_id}", **self.headers
        )
        response = self.client.get(
            f"/api/integrations/shares/{token}/resolve", **self.headers
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(ShareLink.objects.count(), 1)

    def test_webhook_service_requires_tenant(self):
        from domain.errors import AuthorizationError

        with self.assertRaises(AuthorizationError):
            create_webhook(tenant=None, url="https://x")

    def test_webhook_tenant_isolation(self):
        self._post("/api/integrations/webhooks", {"url": "https://a.example"})
        response = self.client.get(
            "/api/integrations/webhooks", **self.headers
        )
        self.assertEqual(len(response.json()["data"]), 1)
        response = self.client.get(
            "/api/integrations/webhooks", HTTP_X_PLANINC_TENANT="other"
        )
        self.assertEqual(response.json()["data"], [])
        self.assertEqual(WebhookEndpoint.objects.count(), 1)
