from django.core.management import call_command
from django.test import TestCase

from apps.tenancy.models import Tenant
from domain.errors import ValidationError
from domain.policies.tenant import TenantAccessError

from .models import OutboxEvent, RetentionRecord
from .services import (
    get_checkpoint,
    record_retention,
    retention_cutoff,
    save_checkpoint,
    set_retention_policy,
)


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
            OutboxEvent.objects.filter(
                published_at__isnull=True, event_type="note.created"
            ).count(),
            1,
        )


class JobCheckpointTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        call_command("provision_tenant", "other", name="Other")
        self.tenant = Tenant.objects.get(slug="demo")
        self.other = Tenant.objects.get(slug="other")

    def test_checkpoint_is_idempotent_and_monotonic(self):
        first = save_checkpoint(
            tenant=self.tenant,
            job_type="import_surreal",
            scope="personal",
            cursor={"offset": 10},
            processed=10,
        )
        again = save_checkpoint(
            tenant=self.tenant,
            job_type="import_surreal",
            scope="personal",
            cursor={"offset": 10},
            processed=10,
        )
        self.assertEqual(first.pk, again.pk)
        self.assertEqual(again.processed, 10)

        advanced = save_checkpoint(
            tenant=self.tenant,
            job_type="import_surreal",
            scope="personal",
            cursor={"offset": 25},
            processed=25,
        )
        self.assertEqual(advanced.processed, 25)
        self.assertEqual(advanced.cursor, {"offset": 25})

        stale = save_checkpoint(
            tenant=self.tenant,
            job_type="import_surreal",
            scope="personal",
            processed=5,
        )
        self.assertEqual(stale.processed, 25)
        self.assertEqual(stale.cursor, {"offset": 25})

    def test_checkpoint_completion_and_lookup(self):
        save_checkpoint(
            tenant=self.tenant,
            job_type="search_index",
            scope="personal",
            processed=3,
            complete=True,
        )
        checkpoint = get_checkpoint(
            tenant=self.tenant, job_type="search_index", scope="personal"
        )
        self.assertIsNotNone(checkpoint)
        self.assertTrue(checkpoint.is_complete)
        self.assertIsNone(
            get_checkpoint(tenant=self.tenant, job_type="search_index")
        )

    def test_checkpoint_is_tenant_scoped(self):
        save_checkpoint(
            tenant=self.tenant, job_type="j", scope="s", processed=3
        )
        self.assertIsNone(get_checkpoint(tenant=self.other, job_type="j", scope="s"))

    def test_checkpoint_requires_tenant_and_job_type(self):
        with self.assertRaises(TenantAccessError):
            save_checkpoint(tenant=None, job_type="j")
        with self.assertRaises(ValidationError):
            save_checkpoint(tenant=self.tenant, job_type="  ")


class RetentionTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        self.tenant = Tenant.objects.get(slug="demo")

    def test_policy_upsert_and_cutoff(self):
        self.assertIsNone(
            retention_cutoff(tenant=self.tenant, aggregate_type="outbox_event")
        )
        set_retention_policy(
            tenant=self.tenant, aggregate_type="outbox_event", ttl_days=30
        )
        cutoff = retention_cutoff(
            tenant=self.tenant, aggregate_type="outbox_event"
        )
        self.assertIsNotNone(cutoff)

        updated = set_retention_policy(
            tenant=self.tenant, aggregate_type="outbox_event", ttl_days=7
        )
        self.assertEqual(updated.ttl_days, 7)

    def test_policy_rejects_non_positive_ttl(self):
        with self.assertRaises(ValidationError):
            set_retention_policy(
                tenant=self.tenant, aggregate_type="note", ttl_days=0
            )

    def test_record_retention_validates_action(self):
        with self.assertRaises(ValidationError):
            record_retention(
                tenant=self.tenant,
                aggregate_type="note",
                aggregate_id=1,
                action="bogus",
            )
        record = record_retention(
            tenant=self.tenant,
            aggregate_type="note",
            aggregate_id=1,
            action=RetentionRecord.PURGED,
            reason="expired",
        )
        self.assertEqual(record.action, "purged")
        self.assertEqual(record.aggregate_id, "1")

