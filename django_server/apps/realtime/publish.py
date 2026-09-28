"""Realtime publish boundary.

Writes fan out here after they commit. Events go to a tenant group and,
optionally, to a workspace group so subscribers only receive rows they are
allowed to see.
"""

from __future__ import annotations

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

TENANT_GROUP_PREFIX = "tenant_"
WORKSPACE_GROUP_PREFIX = "workspace_"
EVENT_HANDLER = "planinc.event"


def tenant_group(slug: str) -> str:
    return f"{TENANT_GROUP_PREFIX}{slug}"


def workspace_group(workspace_id) -> str:
    return f"{WORKSPACE_GROUP_PREFIX}{workspace_id}"


def publish_event(
    *,
    tenant_slug: str,
    event_type: str,
    payload: dict | None = None,
    workspace_id=None,
) -> int:
    """Send an event; returns the number of groups targeted (0 if no layer)."""
    if not tenant_slug:
        raise ValueError("tenant_slug is required to publish an event")
    layer = get_channel_layer()
    if layer is None:
        return 0
    message = {
        "type": EVENT_HANDLER,
        "event": event_type,
        "payload": payload or {},
        "workspace_id": workspace_id,
    }
    groups = [tenant_group(tenant_slug)]
    if workspace_id is not None:
        groups.append(workspace_group(workspace_id))
    for group in groups:
        async_to_sync(layer.group_send)(group, message)
    return len(groups)


def publish_outbox_event(event) -> int:
    """Bridge a committed outbox row into the realtime channel."""
    if event is None or event.published_at is not None:
        return 0
    tenant_slug = getattr(getattr(event, "tenant", None), "slug", "")
    if not tenant_slug:
        return 0
    payload = {
        "aggregate_type": event.aggregate_type,
        "aggregate_id": event.aggregate_id,
        **(event.payload or {}),
    }
    workspace_id = payload.get("workspace_id")
    return publish_event(
        tenant_slug=tenant_slug,
        event_type=event.event_type,
        payload=payload,
        workspace_id=workspace_id,
    )
