import json

from django.core.management import call_command
from django.test import TestCase

from apps.operations.models import OutboxEvent
from apps.tenancy.models import Tenant

from .models import AIProvider, AIRun, AIUsage, Embedding
from .services import create_provider, provider_secret


class AiTests(TestCase):
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

    def test_provider_credential_is_never_serialized(self):
        response = self._post(
            "/api/ai/providers",
            {"name": "Primary", "kind": "openai", "api_key": "sk-secret-value"},
        )
        self.assertEqual(response.status_code, 201)
        serialized = response.json()["data"]
        self.assertTrue(serialized["has_credentials"])
        self.assertNotIn("api_key", serialized)
        self.assertNotIn("encrypted_api_key", serialized)
        self.assertNotIn("sk-secret-value", response.content.decode())

        provider = AIProvider.objects.get(id=serialized["id"])
        self.assertNotEqual(provider.encrypted_api_key, "sk-secret-value")
        self.assertEqual(provider_secret(provider), "sk-secret-value")

    def test_provider_tenant_isolation(self):
        self._post("/api/ai/providers", {"name": "Mine", "kind": "local"})
        response = self.client.get("/api/ai/providers", **self.headers)
        self.assertEqual(len(response.json()["data"]), 1)
        response = self.client.get(
            "/api/ai/providers", HTTP_X_PLANINC_TENANT="other"
        )
        self.assertEqual(response.json()["data"], [])

    def test_agent_with_tool_and_conversation(self):
        agent = self._post(
            "/api/ai/agents", {"name": "Helper", "system_prompt": "be brief"}
        ).json()["data"]["id"]
        response = self._post(
            f"/api/ai/agents/{agent}/tools", {"name": "search_notes"}
        )
        self.assertEqual(response.status_code, 201)

        response = self._post(
            "/api/ai/conversations", {"title": "Chat", "agent_id": agent}
        )
        self.assertEqual(response.status_code, 201)
        conversation_id = response.json()["data"]["id"]

        response = self._post(
            f"/api/ai/conversations/{conversation_id}/messages",
            {"role": "user", "content": "hello"},
        )
        self.assertEqual(response.status_code, 201)

    def test_run_executes_local_provider_and_records_usage(self):
        self._post(
            "/api/ai/providers", {"name": "Local", "kind": "local"}
        )
        conversation_id = self._post(
            "/api/ai/conversations", {"title": "Chat"}
        ).json()["data"]["id"]
        self._post(
            f"/api/ai/conversations/{conversation_id}/messages",
            {"role": "user", "content": "ping"},
        )
        response = self._post(
            f"/api/ai/conversations/{conversation_id}/runs", {}
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()["data"]
        self.assertEqual(data["status"], "succeeded")
        self.assertIn("[local:", data["output"])
        self.assertEqual(len(data["usage"]), 1)
        self.assertEqual(AIUsage.objects.count(), 1)
        self.assertEqual(AIRun.objects.count(), 1)

    def test_run_without_provider_is_misconfigured(self):
        conversation_id = self._post(
            "/api/ai/conversations", {"title": "Chat"}
        ).json()["data"]["id"]
        response = self._post(
            f"/api/ai/conversations/{conversation_id}/runs", {}
        )
        self.assertEqual(response.status_code, 500)

    def test_embedding_upsert(self):
        response = self._post(
            "/api/ai/embeddings",
            {"object_type": "note", "object_id": 7, "vector": [0.1, 0.2, 0.3]},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["dimensions"], 3)
        self._post(
            "/api/ai/embeddings",
            {"object_type": "note", "object_id": 7, "vector": [0.4]},
        )
        self.assertEqual(Embedding.objects.count(), 1)
        self.assertEqual(Embedding.objects.get().dimensions, 1)

    def test_ai_emits_outbox(self):
        create_provider(tenant=self.tenant, name="Evented", kind="local")
        self._post(
            "/api/ai/providers", {"name": "Another", "kind": "local"}
        )
        event_types = set(OutboxEvent.objects.values_list("event_type", flat=True))
        self.assertIn("ai.provider.configured", event_types)
