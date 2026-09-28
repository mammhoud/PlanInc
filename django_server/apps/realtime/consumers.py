from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .publish import tenant_group, workspace_group


class TenantConsumer(AsyncJsonWebsocketConsumer):
    """Tenant/workspace event stream with a reconnect (resync) contract.

    Connect with ``?tenant=<slug>`` and, optionally, ``?workspace=<id>``. A
    workspace subscription requires an authenticated member: missing auth or
    membership closes the socket with 4403 before accept. Clients reconnecting
    pass ``?resume_from=<cursor>`` and receive it back in the ``ready`` frame so
    they can resume; a ``resync`` request is acknowledged with the same cursor.
    """

    async def connect(self):
        tenant = self.scope.get("tenant_slug")
        if not tenant:
            await self.close(code=4400)
            return
        workspace_id = self.scope.get("workspace_id")
        user_id = self.scope.get("user_id")
        if workspace_id is not None:
            if not user_id or not await self._is_workspace_member(
                user_id=user_id, tenant_slug=tenant, workspace_id=workspace_id
            ):
                await self.close(code=4403)
                return

        self.group_name = tenant_group(tenant)
        self.workspace_group_name = (
            workspace_group(workspace_id) if workspace_id is not None else None
        )
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        if self.workspace_group_name is not None:
            await self.channel_layer.group_add(
                self.workspace_group_name, self.channel_name
            )
        await self.accept()
        await self.send_json(
            {
                "type": "ready",
                "tenant": tenant,
                "workspace_id": workspace_id,
                "resume_from": self.scope.get("resume_from"),
            }
        )

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name, self.channel_name
            )
        if getattr(self, "workspace_group_name", None):
            await self.channel_layer.group_discard(
                self.workspace_group_name, self.channel_name
            )

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "ping":
            await self.send_json({"type": "pong"})
            return
        if kind == "resync":
            # Acknowledge the client cursor; durable catch-up reads from the
            # outbox (via the REST API) from this point.
            await self.send_json(
                {"type": "resync", "since": content.get("since")}
            )
            return
        await self.send_json({"type": "error", "error": "unsupported_event"})

    async def planinc_event(self, message):
        await self.send_json(
            {
                "type": "event",
                "event": message.get("event"),
                "payload": message.get("payload", {}),
            }
        )

    @database_sync_to_async
    def _is_workspace_member(self, *, user_id, tenant_slug, workspace_id) -> bool:
        from django.contrib.auth import get_user_model

        from apps.tenancy.models import Membership
        from apps.workspaces.models import WorkspaceMember

        user = get_user_model().objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            return False
        if not Membership.objects.filter(
            user=user, tenant__slug=tenant_slug
        ).exists():
            return False
        return WorkspaceMember.objects.filter(
            user=user,
            workspace_id=workspace_id,
            workspace__tenant__slug=tenant_slug,
        ).exists()
