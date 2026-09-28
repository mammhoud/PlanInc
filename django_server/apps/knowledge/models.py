from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class Resource(models.Model):
    """A catalogued knowledge resource (link, file, or free text)."""

    KIND_CHOICES = [
        ("link", "Link"),
        ("file", "File"),
        ("note", "Note"),
        ("text", "Text"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="resources"
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resources",
    )
    title = models.CharField(max_length=300)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="link")
    url = models.URLField(max_length=1000, blank=True)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_resources",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["tenant", "kind"])]


class ResourceRelation(models.Model):
    """Directed edge between two resources (knowledge graph)."""

    KIND_CHOICES = [
        ("relates", "Relates"),
        ("references", "References"),
        ("derives", "Derives"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="resource_relations"
    )
    source = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="outgoing_relations",
    )
    target = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        related_name="incoming_relations",
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="relates")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "kind"],
                name="unique_resource_relation",
            ),
            models.CheckConstraint(
                condition=~models.Q(source=models.F("target")),
                name="resource_relation_no_self",
            ),
        ]


class Attachment(models.Model):
    """Stored-file metadata. Bytes live in object storage under a tenant key."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="attachments"
    )
    note = models.ForeignKey(
        "notes.Note",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    resource = models.ForeignKey(
        Resource,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="attachments",
    )
    filename = models.CharField(max_length=300)
    content_type = models.CharField(max_length=160, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    object_key = models.CharField(max_length=1000)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_attachments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "object_key"],
                name="unique_attachment_object_key_per_tenant",
            )
        ]
        indexes = [models.Index(fields=["tenant", "note"])]


class FilePreview(models.Model):
    KIND_CHOICES = [
        ("thumbnail", "Thumbnail"),
        ("text", "Text"),
        ("summary", "Summary"),
    ]

    attachment = models.ForeignKey(
        Attachment,
        on_delete=models.CASCADE,
        related_name="previews",
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="text")
    object_key = models.CharField(max_length=1000, blank=True)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["kind", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["attachment", "kind"],
                name="unique_attachment_preview_kind",
            )
        ]


class Extraction(models.Model):
    """Text-extraction state for an attachment."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("running", "Running"),
        ("done", "Done"),
        ("failed", "Failed"),
    ]

    attachment = models.OneToOneField(
        Attachment,
        on_delete=models.CASCADE,
        related_name="extraction",
    )
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="pending")
    text = models.TextField(blank=True)
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
