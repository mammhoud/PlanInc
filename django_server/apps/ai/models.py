from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class AIProvider(models.Model):
    """Tenant-configured AI provider. Credentials are stored encrypted."""

    KIND_CHOICES = [
        ("local", "Local / echo"),
        ("openai", "OpenAI"),
        ("azure_openai", "Azure OpenAI"),
        ("openai_compatible", "OpenAI-compatible"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="ai_providers"
    )
    name = models.CharField(max_length=160)
    kind = models.CharField(max_length=32, choices=KIND_CHOICES, default="openai")
    base_url = models.URLField(max_length=1000, blank=True)
    encrypted_api_key = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="unique_ai_provider_name_per_tenant",
            )
        ]


class AIModel(models.Model):
    provider = models.ForeignKey(
        AIProvider, on_delete=models.CASCADE, related_name="models"
    )
    name = models.CharField(max_length=160)
    context_window = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "name"],
                name="unique_ai_model_per_provider",
            )
        ]


class Agent(models.Model):
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="ai_agents"
    )
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    system_prompt = models.TextField(blank=True)
    model = models.ForeignKey(
        AIModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agents",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="unique_ai_agent_name_per_tenant",
            )
        ]


class AgentTool(models.Model):
    """A tool permit granted to an agent."""

    agent = models.ForeignKey(
        Agent, on_delete=models.CASCADE, related_name="tools"
    )
    name = models.CharField(max_length=120)
    config = models.JSONField(default=dict, blank=True)
    is_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["agent", "name"],
                name="unique_agent_tool",
            )
        ]


class AIConversation(models.Model):
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="ai_conversations"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_ai_conversations",
    )
    agent = models.ForeignKey(
        Agent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    title = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]


class AIMessage(models.Model):
    ROLE_CHOICES = [
        ("system", "System"),
        ("user", "User"),
        ("assistant", "Assistant"),
        ("tool", "Tool"),
    ]

    conversation = models.ForeignKey(
        AIConversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default="user")
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class AIRun(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("succeeded", "Succeeded"),
        ("failed", "Failed"),
    ]

    conversation = models.ForeignKey(
        AIConversation, on_delete=models.CASCADE, related_name="runs"
    )
    model = models.ForeignKey(
        AIModel,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="runs",
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    provider_metadata = models.JSONField(default=dict, blank=True)
    output = models.TextField(blank=True)
    error = models.TextField(blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class AIUsage(models.Model):
    run = models.ForeignKey(
        AIRun, on_delete=models.CASCADE, related_name="usage_records"
    )
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)


class Embedding(models.Model):
    """A stored vector for a note or resource, used by permission-aware search."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="embeddings"
    )
    object_type = models.CharField(max_length=32)
    object_id = models.BigIntegerField()
    model = models.CharField(max_length=160, blank=True)
    dimensions = models.PositiveIntegerField(default=0)
    vector = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "object_type", "object_id", "model"],
                name="unique_embedding_object",
            )
        ]
