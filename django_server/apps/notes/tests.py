from django.core.management import call_command
from django.test import TestCase

from .models import Note
from apps.operations.models import OutboxEvent


class NotesIsolationTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")

    def test_notes_are_scoped_to_tenant(self):
        response = self.client.post(
            "/api/notes",
            data='{"title":"Same id","body":"demo"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        self.assertEqual(response.status_code, 201)
        note_id = response.json()["data"]["id"]

        response = self.client.get(
            "/api/notes",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.json()["data"], [])

        response = self.client.get(
            f"/api/notes/{note_id}",
            HTTP_X_PLANINC_TENANT="other",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(Note.objects.count(), 1)
        self.assertEqual(OutboxEvent.objects.filter(tenant__slug="demo").count(), 1)
