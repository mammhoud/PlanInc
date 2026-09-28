from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TransactionTestCase
from django.utils import timezone

from apps.tenancy.models import Membership, Tenant
from apps.workspaces.services import create_workspace
from config.routing import application

from .publish import (
    publish_event,
    publish_outbox_event,
    tenant_group,
    workspace_group,
)


class RealtimeTests(TransactionTestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")
        self.tenant = Tenant.objects.get(slug="demo")
        self.user = get_user_model().objects.create_user(
            username="member", password="x"
        )
        Membership.objects.create(tenant=self.tenant, user=self.user)
        self.workspace = create_workspace(
            tenant=self.tenant, name="Team", slug="team", owner=self.user
        )

    def _communicator(self, query: str):
        return WebsocketCommunicator(application, f"/ws/tenant?{query}")

    async def test_anonymous_tenant_subscription_receives_ready(self):
        communicator = self._communicator("tenant=demo")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        ready = await communicator.receive_json_from()
        self.assertEqual(ready["type"], "ready")
        self.assertEqual(ready["tenant"], "demo")
        await communicator.disconnect()

    async def test_missing_tenant_is_rejected(self):
        communicator = self._communicator("")
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_workspace_subscription_requires_membership(self):
        communicator = self._communicator(
            f"tenant=demo&workspace={self.workspace.id}"
        )
        connected, _ = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_workspace_subscription_with_membership_succeeds(self):
        from apps.tenancy.jwt import issue_session_token

        token = await database_sync_to_async(issue_session_token)(self.user)
        communicator = self._communicator(
            f"tenant=demo&workspace={self.workspace.id}&token={token}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        ready = await communicator.receive_json_from()
        self.assertEqual(ready["workspace_id"], self.workspace.id)
        await communicator.disconnect()

    async def test_ping_and_resync(self):
        communicator = self._communicator("tenant=demo&resume_from=cursor-7")
        await communicator.connect()
        ready = await communicator.receive_json_from()
        self.assertEqual(ready["resume_from"], "cursor-7")

        await communicator.send_json_to({"type": "ping"})
        self.assertEqual((await communicator.receive_json_from())["type"], "pong")

        await communicator.send_json_to({"type": "resync", "since": "cursor-7"})
        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "resync")
        self.assertEqual(message["since"], "cursor-7")

        await communicator.send_json_to({"type": "bogus"})
        self.assertEqual(
            (await communicator.receive_json_from())["error"], "unsupported_event"
        )
        await communicator.disconnect()

    async def test_group_event_delivery(self):
        communicator = self._communicator("tenant=demo")
        await communicator.connect()
        await communicator.receive_json_from()
        layer = get_channel_layer()
        await layer.group_send(
            tenant_group("demo"),
            {"type": "planinc.event", "event": "note.created", "payload": {"id": 1}},
        )
        message = await communicator.receive_json_from()
        self.assertEqual(message["type"], "event")
        self.assertEqual(message["event"], "note.created")
        self.assertEqual(message["payload"]["id"], 1)
        await communicator.disconnect()

    def test_publish_event_targets_tenant_and_workspace_groups(self):
        sent = []

        async def fake_group_send(group, message):
            sent.append((group, message))

        layer = get_channel_layer()
        original = layer.group_send
        layer.group_send = fake_group_send
        try:
            count = publish_event(
                tenant_slug="demo",
                event_type="note.created",
                payload={"id": 2},
                workspace_id=self.workspace.id,
            )
        finally:
            layer.group_send = original
        self.assertEqual(count, 2)
        groups = {group for group, _ in sent}
        self.assertIn(tenant_group("demo"), groups)
        self.assertIn(workspace_group(self.workspace.id), groups)

    def test_publish_outbox_event_bridges_committed_rows(self):
        from apps.notes.services import create_note
        from apps.operations.models import OutboxEvent

        create_note(tenant=self.tenant, title="Realtime")
        event = OutboxEvent.objects.filter(
            tenant=self.tenant, event_type="note.created"
        ).first()
        self.assertIsNotNone(event)
        # Unpublished rows publish; already-published rows are skipped.
        self.assertEqual(publish_outbox_event(event), 1)
        event.published_at = timezone.now()
        event.save(update_fields=["published_at"])
        self.assertEqual(publish_outbox_event(event), 0)

    def test_publish_event_requires_tenant(self):
        with self.assertRaises(ValueError):
            publish_event(tenant_slug="", event_type="x")
