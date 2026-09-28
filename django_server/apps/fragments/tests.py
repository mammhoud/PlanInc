import json

from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note


class FragmentTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.headers = {"HTTP_X_PLANINC_TENANT": "demo"}

    def _create_note(self, title):
        response = self.client.post(
            "/api/notes",
            data=json.dumps({"title": title}),
            content_type="application/json",
            **self.headers,
        )
        return response.json()["data"]["id"]

    def test_notes_table_renders_html(self):
        self._create_note("Alpha")
        response = self.client.get("/fragments/notes", **self.headers)
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn("notes-table", body)
        self.assertIn("Alpha", body)
        self.assertNotIn("Beta", body)

    def test_notes_table_json_fallback(self):
        self._create_note("Alpha")
        response = self.client.get(
            "/fragments/notes?format=json", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["title"], "Alpha")

    def test_fragments_are_tenant_scoped(self):
        self._create_note("Only demo")
        response = self.client.get(
            "/fragments/notes", HTTP_X_PLANINC_TENANT="other"
        )
        self.assertIn("No notes yet.", response.content.decode())
        self.assertEqual(Note.objects.count(), 1)

    def test_fragments_require_tenant(self):
        response = self.client.get("/fragments/notes")
        self.assertEqual(response.status_code, 400)

    def test_comments_fragment(self):
        note_id = self._create_note("With comments")
        self.client.post(
            f"/api/notes/{note_id}/comments",
            data=json.dumps({"body": "nice work"}),
            content_type="application/json",
            **self.headers,
        )
        response = self.client.get(
            f"/fragments/notes/{note_id}/comments", **self.headers
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("nice work", response.content.decode())

        response = self.client.get(
            f"/fragments/notes/{note_id}/comments",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)
