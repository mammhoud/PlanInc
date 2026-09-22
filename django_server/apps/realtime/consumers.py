from channels.generic.websocket import AsyncJsonWebsocketConsumer


class TenantConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        tenant = self.scope.get("tenant_slug")
        if not tenant:
            await self.close(code=4400)
            return
        self.group_name = f"tenant_{tenant}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") != "ping":
            await self.send_json({"error": "unsupported_event"})
            return
        await self.send_json({"type": "pong"})
