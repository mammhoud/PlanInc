from django.db import models

from apps.tenancy.models import Tenant


class RSSFeed(models.Model):
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="rss_feeds"
    )
    url = models.URLField(max_length=1000)
    title = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)
    last_fetched_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "url"], name="unique_rss_feed_url_per_tenant"
            )
        ]


class WebhookEndpoint(models.Model):
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="webhook_endpoints"
    )
    url = models.URLField(max_length=1000)
    description = models.CharField(max_length=300, blank=True)
    events = models.JSONField(default=list, blank=True)
    encrypted_secret = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "url"], name="unique_webhook_url_per_tenant"
            )
        ]


class WebhookDelivery(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("delivered", "Delivered"),
        ("failed", "Failed"),
    ]

    endpoint = models.ForeignKey(
        WebhookEndpoint, on_delete=models.CASCADE, related_name="deliveries"
    )
    event_type = models.CharField(max_length=120)
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    response_code = models.PositiveIntegerField(null=True, blank=True)
    error = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class PluginInstallation(models.Model):
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="plugin_installations"
    )
    name = models.CharField(max_length=160)
    version = models.CharField(max_length=64, blank=True)
    config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    installed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"], name="unique_plugin_per_tenant"
            )
        ]


class MCPServer(models.Model):
    TRANSPORT_CHOICES = [
        ("sse", "SSE"),
        ("stdio", "stdio"),
        ("http", "HTTP"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="mcp_servers"
    )
    name = models.CharField(max_length=160)
    url = models.URLField(max_length=1000, blank=True)
    transport = models.CharField(
        max_length=16, choices=TRANSPORT_CHOICES, default="sse"
    )
    encrypted_api_key = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"], name="unique_mcp_server_per_tenant"
            )
        ]


class SSOConnection(models.Model):
    PROVIDER_CHOICES = [
        ("oidc", "OIDC"),
        ("saml", "SAML"),
        ("github", "GitHub"),
        ("google", "Google"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="sso_connections"
    )
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES)
    metadata_url = models.URLField(max_length=1000, blank=True)
    client_id = models.CharField(max_length=300, blank=True)
    encrypted_client_secret = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["provider", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "provider"], name="unique_sso_connection_per_tenant"
            )
        ]


class ShareLink(models.Model):
    VISIBILITY_CHOICES = [
        ("public", "Public"),
        ("workspace", "Workspace"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="share_links"
    )
    note = models.ForeignKey(
        "notes.Note",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="share_links",
    )
    token = models.CharField(max_length=64, unique=True)
    visibility = models.CharField(
        max_length=16, choices=VISIBILITY_CHOICES, default="public"
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    @property
    def is_active(self) -> bool:
        from django.utils import timezone

        if self.revoked_at is not None:
            return False
        return self.expires_at is None or self.expires_at > timezone.now()
