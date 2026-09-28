import json

from django.core.management import call_command
from django.test import TestCase

from apps.operations.models import OutboxEvent

from .models import Attachment, Extraction, Resource
from .services import build_object_key, safe_filename


class KnowledgeTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def _post(self, url, payload, tenant="demo"):
        return self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_PLANINC_TENANT=tenant,
        )

    def test_resource_crud_and_isolation(self):
        response = self._post(
            "/api/knowledge/resources", {"title": "Paper", "kind": "link"}
        )
        self.assertEqual(response.status_code, 201)
        resource_id = response.json()["data"]["id"]

        self._post(
            "/api/knowledge/resources", {"title": "Other"}, tenant="other"
        )

        response = self.client.get(
            "/api/knowledge/resources", **self.headers
        )
        self.assertEqual(response.json()["meta"]["total"], 1)

        response = self.client.patch(
            f"/api/knowledge/resources/{resource_id}",
            data=json.dumps({"title": "Paper v2"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.json()["data"]["title"], "Paper v2")

        response = self.client.get(
            f"/api/knowledge/resources/{resource_id}",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.delete(
            f"/api/knowledge/resources/{resource_id}", **self.headers
        )
        self.assertEqual(response.status_code, 200)

    def test_resource_relation(self):
        first = self._post(
            "/api/knowledge/resources", {"title": "A"}
        ).json()["data"]["id"]
        second = self._post(
            "/api/knowledge/resources", {"title": "B"}
        ).json()["data"]["id"]
        response = self._post(
            f"/api/knowledge/resources/{first}/relations",
            {"target_id": second},
        )
        self.assertEqual(response.status_code, 201)

        response = self._post(
            f"/api/knowledge/resources/{first}/relations",
            {"target_id": first},
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.get(
            f"/api/knowledge/resources/{first}/relations", **self.headers
        )
        self.assertEqual(len(response.json()["data"]), 1)

    def test_attachment_object_key_is_tenant_prefixed(self):
        response = self._post(
            "/api/knowledge/attachments",
            {"filename": "../etc/passwd", "content_type": "text/plain"},
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()["data"]
        from apps.tenancy.models import Tenant

        schema = Tenant.objects.get(slug="demo").schema_name
        self.assertTrue(
            data["object_key"].startswith(f"tenants/{schema}/uploads/")
        )
        self.assertNotIn("..", data["object_key"])
        self.assertNotIn("/etc/", data["object_key"].replace("/uploads/", "/up/"))
        self.assertEqual(Attachment.objects.count(), 1)

    def test_safe_filename_rejects_paths(self):
        self.assertEqual(safe_filename("../../a b.txt"), "a_b.txt")
        self.assertEqual(safe_filename("/absolute/name.pdf"), "name.pdf")
        from domain.errors import ValidationError

        with self.assertRaises(ValidationError):
            safe_filename("../")

    def test_preview_and_extraction_lifecycle(self):
        attachment_id = self._post(
            "/api/knowledge/attachments", {"filename": "note.pdf"}
        ).json()["data"]["id"]

        response = self._post(
            f"/api/knowledge/attachments/{attachment_id}/previews",
            {"kind": "text", "content": "hello"},
        )
        self.assertEqual(response.status_code, 201)
        response = self.client.get(
            f"/api/knowledge/attachments/{attachment_id}/previews", **self.headers
        )
        self.assertEqual(response.json()["data"][0]["content"], "hello")

        response = self._post(
            f"/api/knowledge/attachments/{attachment_id}/extraction", {}
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["data"]["status"], "pending")

        response = self.client.patch(
            f"/api/knowledge/attachments/{attachment_id}/extraction",
            data=json.dumps({"text": "extracted body"}),
            content_type="application/json",
            **self.headers,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], "done")
        self.assertEqual(Extraction.objects.count(), 1)

        response = self.client.get(
            f"/api/knowledge/attachments/{attachment_id}/extraction",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)

    def test_extraction_without_request_is_not_found(self):
        attachment_id = self._post(
            "/api/knowledge/attachments", {"filename": "x.txt"}
        ).json()["data"]["id"]
        response = self.client.get(
            f"/api/knowledge/attachments/{attachment_id}/extraction", **self.headers
        )
        self.assertEqual(response.status_code, 404)

    def test_knowledge_emits_outbox(self):
        self._post("/api/knowledge/resources", {"title": "Evented"})
        self.assertIn(
            "resource.created",
            set(OutboxEvent.objects.values_list("event_type", flat=True)),
        )

    def test_build_object_key_requires_tenant(self):
        from domain.errors import AuthorizationError

        with self.assertRaises(AuthorizationError):
            build_object_key(tenant=None, filename="a.txt")

    def test_attachment_cross_tenant_note_is_rejected(self):
        from apps.notes.models import Note
        from apps.tenancy.models import Tenant

        other = Tenant.objects.get(slug="other")
        note = Note.objects.create(tenant=other, title="Other note")
        response = self._post(
            "/api/knowledge/attachments",
            {"filename": "a.txt", "note_id": note.id},
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Resource.objects.count(), 0)
