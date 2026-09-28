from django.urls import path

from . import views

urlpatterns = [
    path("api/integrations/rss", views.rss_feeds, name="integrations-rss"),
    path(
        "api/integrations/rss/<int:feed_id>",
        views.rss_feed_detail,
        name="integrations-rss-detail",
    ),
    path("api/integrations/webhooks", views.webhooks, name="integrations-webhooks"),
    path(
        "api/integrations/webhooks/<int:endpoint_id>",
        views.webhook_detail,
        name="integrations-webhook-detail",
    ),
    path(
        "api/integrations/webhooks/<int:endpoint_id>/deliveries",
        views.webhook_deliveries,
        name="integrations-webhook-deliveries",
    ),
    path("api/integrations/plugins", views.plugins, name="integrations-plugins"),
    path(
        "api/integrations/plugins/<int:plugin_id>",
        views.plugin_detail,
        name="integrations-plugin-detail",
    ),
    path("api/integrations/mcp", views.mcp_servers, name="integrations-mcp"),
    path(
        "api/integrations/mcp/<int:server_id>",
        views.mcp_server_detail,
        name="integrations-mcp-detail",
    ),
    path("api/integrations/sso", views.sso_connections, name="integrations-sso"),
    path("api/integrations/shares", views.shares, name="integrations-shares"),
    path(
        "api/integrations/shares/<int:link_id>",
        views.share_detail,
        name="integrations-share-detail",
    ),
    path(
        "api/integrations/shares/<str:token>/resolve",
        views.share_resolve,
        name="integrations-share-resolve",
    ),
]
