from django.core.management import call_command
from django.test import TestCase

from .models import OutboxEvent


class OutboxTests(TestCase):
    def test_note_create_is_atomic_with_outbox_event(self):
        call_command("provision_tenant", "demo", name="Demo")
        response = self.client.post(
            "/api/notes",
            data='{"title":"Inbox","body":"Capture"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )

        self.assertEqual(response.status_code, 201)
        event = OutboxEvent.objects.get(event_type="note.created")
        self.assertEqual(event.tenant.slug, "demo")
        self.assertEqual(event.aggregate_id, str(response.json()["data"]["id"]))

