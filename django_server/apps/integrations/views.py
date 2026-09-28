import json

from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.notes.models import Note
from apps.tenancy.models import Tenant
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from . import services
from .models import (
    MCPServer,
    PluginInstallation,
    RSSFeed,
    ShareLink,
    SSOConnection,
    WebhookEndpoint,
)


def _tenant_for_request(request):
    missing = require_tenant(request)
    if missing:
        return missing, None
    try:
        return None, Tenant.objects.get(
            slug=request.tenant_context.slug, is_active=True
        )
    except Tenant.DoesNotExist:
        return (
            failure(
                ErrorCode.TENANT_NOT_FOUND,
                "Tenant is unknown or inactive.",
                status=404,
            ),
            None,
        )


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _serialize_rss(feed):
    return {
        "id": feed.id,
        "url": feed.url,
        "title": feed.title,
        "is_active": feed.is_active,
        "last_fetched_at": (
            feed.last_fetched_at.isoformat() if feed.last_fetched_at else None
        ),
    }


def _serialize_webhook(endpoint):
    return {
        "id": endpoint.id,
        "url": endpoint.url,
        "description": endpoint.description,
        "events": endpoint.events,
        "is_active": endpoint.is_active,
        "has_secret": bool(endpoint.encrypted_secret),
    }


def _serialize_delivery(delivery):
    return {
        "id": delivery.id,
        "event_type": delivery.event_type,
        "status": delivery.status,
        "response_code": delivery.response_code,
        "attempts": delivery.attempts,
        "created_at": delivery.created_at.isoformat(),
    }


def _serialize_plugin(plugin):
    return {
        "id": plugin.id,
        "name": plugin.name,
        "version": plugin.version,
        "is_active": plugin.is_active,
        "installed_at": plugin.installed_at.isoformat(),
    }


def _serialize_mcp(server):
    return {
        "id": server.id,
        "name": server.name,
        "url": server.url,
        "transport": server.transport,
        "has_credentials": bool(server.encrypted_api_key),
        "is_active": server.is_active,
    }


def _serialize_sso(connection):
    return {
        "id": connection.id,
        "provider": connection.provider,
        "metadata_url": connection.metadata_url,
        "client_id": connection.client_id,
        "has_secret": bool(connection.encrypted_client_secret),
        "is_active": connection.is_active,
    }


def _serialize_share(link, *, include_token=True):
    data = {
        "id": link.id,
        "note_id": link.note_id,
        "visibility": link.visibility,
        "is_active": link.is_active,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
    }
    if include_token:
        data["token"] = link.token
    return data


# --------------------------------------------------------------------------- RSS
@require_http_methods(["GET", "POST"])
@service_view
def rss_feeds(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [_serialize_rss(feed) for feed in RSSFeed.objects.filter(tenant=tenant)]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("url"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "url must be a string.")
    feed = services.add_rss_feed(
        tenant=tenant, url=payload["url"], title=str(payload.get("title", ""))
    )
    return success(_serialize_rss(feed), status=201)


@require_http_methods(["DELETE"])
@service_view
def rss_feed_detail(request, feed_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    feed = RSSFeed.objects.filter(id=feed_id, tenant=tenant).first()
    if feed is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    feed.delete()
    return success(None)


# -------------------------------------------------------------------- webhooks
@require_http_methods(["GET", "POST"])
@service_view
def webhooks(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_webhook(row)
                for row in WebhookEndpoint.objects.filter(tenant=tenant)
            ]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("url"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "url must be a string.")
    endpoint = services.create_webhook(
        tenant=tenant,
        url=payload["url"],
        events=payload.get("events"),
        description=str(payload.get("description", "")),
        secret=str(payload.get("secret", "")),
    )
    return success(_serialize_webhook(endpoint), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def webhook_detail(request, endpoint_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    endpoint = WebhookEndpoint.objects.filter(id=endpoint_id, tenant=tenant).first()
    if endpoint is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(_serialize_webhook(endpoint))
    if request.method == "DELETE":
        endpoint.delete()
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    if payload.get("events") is not None:
        endpoint.events = list(payload["events"])
    if payload.get("description") is not None:
        endpoint.description = str(payload["description"])
    if payload.get("is_active") is not None:
        endpoint.is_active = bool(payload["is_active"])
    endpoint.save()
    return success(_serialize_webhook(endpoint))


@require_http_methods(["GET", "POST"])
@service_view
def webhook_deliveries(request, endpoint_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    endpoint = WebhookEndpoint.objects.filter(id=endpoint_id, tenant=tenant).first()
    if endpoint is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(
            [_serialize_delivery(row) for row in endpoint.deliveries.all()]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("event_type"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "event_type must be a string.")
    delivery = services.queue_delivery(
        endpoint=endpoint,
        event_type=payload["event_type"],
        payload=payload.get("payload") or {},
    )
    return success(_serialize_delivery(delivery), status=201)


# --------------------------------------------------------------------- plugins
@require_http_methods(["GET", "POST"])
@service_view
def plugins(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_plugin(row)
                for row in PluginInstallation.objects.filter(tenant=tenant)
            ]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    plugin = services.install_plugin(
        tenant=tenant,
        name=payload["name"],
        version=str(payload.get("version", "")),
        config=payload.get("config"),
    )
    return success(_serialize_plugin(plugin), status=201)


@require_http_methods(["DELETE"])
@service_view
def plugin_detail(request, plugin_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    plugin = PluginInstallation.objects.filter(id=plugin_id, tenant=tenant).first()
    if plugin is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    services.uninstall_plugin(plugin=plugin)
    return success(None)


# ------------------------------------------------------------------------- MCP
@require_http_methods(["GET", "POST"])
@service_view
def mcp_servers(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [_serialize_mcp(row) for row in MCPServer.objects.filter(tenant=tenant)]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    server = services.add_mcp_server(
        tenant=tenant,
        name=payload["name"],
        url=str(payload.get("url", "")),
        transport=str(payload.get("transport", "sse")),
        api_key=str(payload.get("api_key", "")),
    )
    return success(_serialize_mcp(server), status=201)


@require_http_methods(["DELETE"])
@service_view
def mcp_server_detail(request, server_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    server = MCPServer.objects.filter(id=server_id, tenant=tenant).first()
    if server is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    server.delete()
    return success(None)


# ------------------------------------------------------------------------- SSO
@require_http_methods(["GET", "POST"])
@service_view
def sso_connections(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_sso(row)
                for row in SSOConnection.objects.filter(tenant=tenant)
            ]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("provider"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "provider must be a string.")
    connection = services.configure_sso(
        tenant=tenant,
        provider=payload["provider"],
        metadata_url=str(payload.get("metadata_url", "")),
        client_id=str(payload.get("client_id", "")),
        client_secret=str(payload.get("client_secret", "")),
    )
    return success(_serialize_sso(connection), status=201)


# ----------------------------------------------------------------------- shares
@require_http_methods(["GET", "POST"])
@service_view
def shares(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        return success(
            [
                _serialize_share(row)
                for row in ShareLink.objects.filter(tenant=tenant)
            ]
        )
    payload = _payload(request) or {}
    note = None
    if payload.get("note_id") is not None:
        note = Note.objects.filter(id=payload["note_id"], tenant=tenant).first()
        if note is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown note.", status=404)
    link = services.create_share_link(
        tenant=tenant,
        note=note,
        visibility=str(payload.get("visibility", "public")),
        ttl_days=payload.get("ttl_days"),
    )
    return success(_serialize_share(link), status=201)


@require_http_methods(["GET", "DELETE"])
@service_view
def share_detail(request, link_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    link = ShareLink.objects.filter(id=link_id, tenant=tenant).first()
    if link is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "DELETE":
        services.revoke_share_link(link=link)
        return success(None)
    return success(_serialize_share(link))


@require_http_methods(["GET"])
@service_view
def share_resolve(request, token):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    link = services.resolve_share_link(tenant=tenant, token=token)
    data = _serialize_share(link, include_token=False)
    if link.note is not None:
        data["note"] = {"id": link.note.id, "title": link.note.title}
    return success(data)
