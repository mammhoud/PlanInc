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


class PublishOutboxTests(TestCase):
    def test_publish_writes_deliverables_and_stamps_once(self):
        import json
        import tempfile
        from pathlib import Path

        call_command("provision_tenant", "demo", name="Demo")
        self.client.post(
            "/api/notes",
            data='{"title":"Inbox","body":"Capture"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        note_id = self.client.get(
            "/api/notes", HTTP_X_PLANINC_TENANT="demo"
        ).json()["data"][0]["id"]
        self.client.delete(
            f"/api/notes/{note_id}", HTTP_X_PLANINC_TENANT="demo"
        )

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "deliverables.jsonl"
            call_command("publish_outbox", output=output)
            lines = [
                json.loads(line)
                for line in output.read_text(encoding="utf-8").splitlines()
            ]
            by_type = {line["event_type"]: line for line in lines}
            self.assertIn("note.created", by_type)
            self.assertIn("note.deleted", by_type)
            self.assertFalse(by_type["note.created"]["tombstone"])
            self.assertTrue(by_type["note.deleted"]["tombstone"])
            for line in lines:
                self.assertEqual(line["tenant"], "demo")
                self.assertTrue(line["idempotency_key"])

            # Second run publishes nothing new (stamped).
            call_command("publish_outbox", output=output)
            self.assertEqual(output.read_text(encoding="utf-8").strip(), "")

    def test_publish_dry_run_leaves_events_unpublished(self):
        import tempfile
        from pathlib import Path

        call_command("provision_tenant", "demo", name="Demo")
        self.client.post(
            "/api/notes",
            data='{"title":"Inbox","body":"Capture"}',
            content_type="application/json",
            HTTP_X_PLANINC_TENANT="demo",
        )
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "deliverables.jsonl"
            call_command("publish_outbox", output=output, dry_run=True)
            self.assertTrue(output.read_text(encoding="utf-8").strip())
        self.assertEqual(
            OutboxEvent.objects.filter(published_at__isnull=True).count(), 1
        )

