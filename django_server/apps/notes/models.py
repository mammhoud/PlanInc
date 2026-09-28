from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class Note(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="notes")
    # Optional workspace binding. Kept nullable so the original tenant-scoped
    # notes slice keeps working; workspace-aware flows set it explicitly.
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notes",
    )
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    # Author drives the Surreal account mapping on sync (username equality).
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_notes",
    )
    # Stable cross-store identity for Surreal↔Postgres sync
    # (e.g. "surreal:notes:42"). Null for natively-created rows.
    external_id = models.CharField(max_length=180, null=True, blank=True)
    tags = models.ManyToManyField(
        "notes.Tag",
        related_name="notes",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "title"],
                name="unique_note_title_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["tenant", "external_id"],
                name="unique_note_external_id_per_tenant",
            ),
        ]


class Tag(models.Model):
    """Tenant-scoped label attached to notes (:class:`Note` M2M)."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="note_tags"
    )
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80)
    color = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "slug"],
                name="unique_tag_slug_per_tenant",
            )
        ]

    def __str__(self) -> str:  # pragma: no cover - admin/debug convenience
        return self.name


class NoteVersion(models.Model):
    """Immutable point-in-time snapshot of a note (edit history)."""

    note = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="versions",
    )
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_note_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["note", "version"],
                name="unique_note_version",
            )
        ]


class NoteComment(models.Model):
    """A threaded comment on a note."""

    note = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_note_comments",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    body = models.TextField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]

    @property
    def is_resolved(self) -> bool:
        return self.resolved_at is not None


class NoteLink(models.Model):
    """A directed link between two notes; reverse edges are backlinks."""

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="note_links"
    )
    source = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="outgoing_links",
    )
    target = models.ForeignKey(
        Note,
        on_delete=models.CASCADE,
        related_name="incoming_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target"],
                name="unique_note_link",
            ),
            models.CheckConstraint(
                condition=~models.Q(source=models.F("target")),
                name="note_link_no_self",
            ),
        ]
