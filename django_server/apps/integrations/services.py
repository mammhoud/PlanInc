"""Integration use cases: RSS, webhooks, plugins, MCP, SSO, and share links."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.operations.services import enqueue_event
from domain.errors import ConflictError, NotFoundError, ValidationError
from domain.events.types import (
    MCP_SERVER_ADDED,
    PLUGIN_INSTALLED,
    PLUGIN_UNINSTALLED,
    RSS_FEED_ADDED,
    SHARE_LINK_CREATED,
    SHARE_LINK_REVOKED,
    SSO_CONNECTION_CONFIGURED,
    WEBHOOK_CREATED,
    WEBHOOK_DELIVERY_QUEUED,
)
from domain.policies.tenant import require_same_tenant, require_tenant_scope
from domain.ports import secrets as secrets_port

from .models import (
    MCPServer,
    PluginInstallation,
    RSSFeed,
    ShareLink,
    SSOConnection,
    WebhookDelivery,
    WebhookEndpoint,
)

SSO_PROVIDERS = {choice for choice, _ in SSOConnection.PROVIDER_CHOICES}
MCP_TRANSPORTS = {choice for choice, _ in MCPServer.TRANSPORT_CHOICES}
SHARE_VISIBILITIES = {choice for choice, _ in ShareLink.VISIBILITY_CHOICES}
DELIVERY_STATUSES = {choice for choice, _ in WebhookDelivery.STATUS_CHOICES}


# --------------------------------------------------------------------------- #
# RSS
# --------------------------------------------------------------------------- #
@transaction.atomic
def add_rss_feed(*, tenant, url: str, title: str = "") -> RSSFeed:
    require_tenant_scope(tenant)
    url = (url or "").strip()
    if not url:
        raise ValidationError("A feed URL is required.")
    if RSSFeed.objects.filter(tenant=tenant, url=url).exists():
        raise ConflictError("That feed is already subscribed.")
    feed = RSSFeed.objects.create(tenant=tenant, url=url, title=title)
    enqueue_event(
        tenant=tenant,
        event_type=RSS_FEED_ADDED,
        aggregate_type="rss_feed",
        aggregate_id=feed.pk,
        payload={"url": feed.url},
        idempotency_key=f"integration.rss.added:{feed.pk}",
    )
    return feed


# --------------------------------------------------------------------------- #
# Webhooks
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_webhook(
    *, tenant, url: str, events=None, description: str = "", secret: str = ""
) -> WebhookEndpoint:
    require_tenant_scope(tenant)
    url = (url or "").strip()
    if not url:
        raise ValidationError("A webhook URL is required.")
    if WebhookEndpoint.objects.filter(tenant=tenant, url=url).exists():
        raise ConflictError("That webhook is already registered.")
    endpoint = WebhookEndpoint.objects.create(
        tenant=tenant,
        url=url,
        description=description,
        events=list(events or []),
        encrypted_secret=secrets_port.encrypt_secret(secret) if secret else "",
    )
    enqueue_event(
        tenant=tenant,
        event_type=WEBHOOK_CREATED,
        aggregate_type="webhook_endpoint",
        aggregate_id=endpoint.pk,
        payload={"url": endpoint.url, "events": endpoint.events},
        idempotency_key=f"integration.webhook.created:{endpoint.pk}",
    )
    return endpoint


@transaction.atomic
def queue_delivery(
    *, endpoint: WebhookEndpoint, event_type: str, payload: dict
) -> WebhookDelivery:
    require_tenant_scope(endpoint.tenant)
    delivery = WebhookDelivery.objects.create(
        endpoint=endpoint,
        event_type=event_type,
        payload=payload,
        status="queued",
    )
    enqueue_event(
        tenant=endpoint.tenant,
        event_type=WEBHOOK_DELIVERY_QUEUED,
        aggregate_type="webhook_delivery",
        aggregate_id=delivery.pk,
        payload={"endpoint_id": endpoint.pk, "event_type": event_type},
        idempotency_key=f"integration.webhook.delivery.queued:{delivery.pk}",
    )
    return delivery


@transaction.atomic
def record_delivery(
    *,
    delivery: WebhookDelivery,
    status: str,
    response_code: int | None = None,
    error: str = "",
) -> WebhookDelivery:
    require_tenant_scope(delivery.endpoint.tenant)
    if status not in DELIVERY_STATUSES:
        raise ValidationError("Unknown delivery status.")
    delivery.status = status
    delivery.response_code = response_code
    delivery.error = error
    delivery.attempts += 1
    delivery.save()
    return delivery


# --------------------------------------------------------------------------- #
# Plugins
# --------------------------------------------------------------------------- #
@transaction.atomic
def install_plugin(
    *, tenant, name: str, version: str = "", config: dict | None = None
) -> PluginInstallation:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A plugin name is required.")
    plugin, _ = PluginInstallation.objects.update_or_create(
        tenant=tenant,
        name=name,
        defaults={"version": version, "config": config or {}, "is_active": True},
    )
    enqueue_event(
        tenant=tenant,
        event_type=PLUGIN_INSTALLED,
        aggregate_type="plugin_installation",
        aggregate_id=plugin.pk,
        payload={"name": plugin.name, "version": plugin.version},
        idempotency_key=f"integration.plugin.installed:{tenant.pk}:{name}:{version}",
    )
    return plugin


@transaction.atomic
def uninstall_plugin(*, plugin: PluginInstallation) -> None:
    require_tenant_scope(plugin.tenant)
    tenant = plugin.tenant
    plugin_id = plugin.pk
    name = plugin.name
    plugin.delete()
    enqueue_event(
        tenant=tenant,
        event_type=PLUGIN_UNINSTALLED,
        aggregate_type="plugin_installation",
        aggregate_id=plugin_id,
        payload={"name": name},
        idempotency_key=f"integration.plugin.uninstalled:{plugin_id}",
    )


# --------------------------------------------------------------------------- #
# MCP
# --------------------------------------------------------------------------- #
@transaction.atomic
def add_mcp_server(
    *,
    tenant,
    name: str,
    url: str = "",
    transport: str = "sse",
    api_key: str = "",
) -> MCPServer:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("An MCP server name is required.")
    if transport not in MCP_TRANSPORTS:
        raise ValidationError("Unknown MCP transport.")
    if MCPServer.objects.filter(tenant=tenant, name=name).exists():
        raise ConflictError("That MCP server is already connected.")
    server = MCPServer.objects.create(
        tenant=tenant,
        name=name,
        url=url,
        transport=transport,
        encrypted_api_key=secrets_port.encrypt_secret(api_key) if api_key else "",
    )
    enqueue_event(
        tenant=tenant,
        event_type=MCP_SERVER_ADDED,
        aggregate_type="mcp_server",
        aggregate_id=server.pk,
        payload={"name": server.name, "transport": server.transport},
        idempotency_key=f"integration.mcp.added:{server.pk}",
    )
    return server


# --------------------------------------------------------------------------- #
# SSO
# --------------------------------------------------------------------------- #
@transaction.atomic
def configure_sso(
    *,
    tenant,
    provider: str,
    metadata_url: str = "",
    client_id: str = "",
    client_secret: str = "",
) -> SSOConnection:
    require_tenant_scope(tenant)
    if provider not in SSO_PROVIDERS:
        raise ValidationError("Unknown SSO provider.")
    connection, _ = SSOConnection.objects.update_or_create(
        tenant=tenant,
        provider=provider,
        defaults={
            "metadata_url": metadata_url,
            "client_id": client_id,
            "is_active": True,
            **(
                {"encrypted_client_secret": secrets_port.encrypt_secret(client_secret)}
                if client_secret
                else {}
            ),
        },
    )
    enqueue_event(
        tenant=tenant,
        event_type=SSO_CONNECTION_CONFIGURED,
        aggregate_type="sso_connection",
        aggregate_id=connection.pk,
        payload={"provider": connection.provider},
        idempotency_key=f"integration.sso.configured:{connection.pk}",
    )
    return connection


# --------------------------------------------------------------------------- #
# Share links
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_share_link(
    *,
    tenant,
    note=None,
    visibility: str = "public",
    ttl_days: int | None = None,
) -> ShareLink:
    require_tenant_scope(tenant)
    if visibility not in SHARE_VISIBILITIES:
        raise ValidationError("Unknown share visibility.")
    if note is not None:
        require_same_tenant(tenant=tenant, resource=note)
    expires_at = None
    if ttl_days is not None:
        if ttl_days < 1:
            raise ValidationError("ttl_days must be positive.")
        expires_at = timezone.now() + timedelta(days=ttl_days)
    link = ShareLink.objects.create(
        tenant=tenant,
        note=note,
        token=secrets.token_urlsafe(24),
        visibility=visibility,
        expires_at=expires_at,
    )
    enqueue_event(
        tenant=tenant,
        event_type=SHARE_LINK_CREATED,
        aggregate_type="share_link",
        aggregate_id=link.pk,
        payload={"note_id": note.pk if note else None, "visibility": visibility},
        idempotency_key=f"integration.share.created:{link.pk}",
    )
    return link


@transaction.atomic
def revoke_share_link(*, link: ShareLink) -> ShareLink:
    require_tenant_scope(link.tenant)
    if link.revoked_at is None:
        link.revoked_at = timezone.now()
        link.save(update_fields=["revoked_at"])
        enqueue_event(
            tenant=link.tenant,
            event_type=SHARE_LINK_REVOKED,
            aggregate_type="share_link",
            aggregate_id=link.pk,
            payload={},
            idempotency_key=f"integration.share.revoked:{link.pk}",
        )
    return link


def resolve_share_link(*, tenant, token: str) -> ShareLink:
    """Resolve an active share link scoped to the request tenant."""
    require_tenant_scope(tenant)
    link = ShareLink.objects.filter(tenant=tenant, token=token).first()
    if link is None:
        raise NotFoundError("The share link is unknown.")
    if not link.is_active:
        raise NotFoundError("The share link is expired or revoked.")
    return link
