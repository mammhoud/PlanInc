from django.db import models

from apps.tenancy.models import Tenant


class SearchDocument(models.Model):
    """Denormalized, permission-carrying projection of a searchable object.

    The row keeps ``workspace_id`` so a query can drop documents the requesting
    user cannot access. Documents without a workspace are visible to the whole
    tenant. ``search_text`` is the queryable body (a Postgres ``tsvector``
    column is a future upgrade; the same field backs SQLite tests).
    """

    OBJECT_TYPES = [
        ("note", "Note"),
        ("resource", "Resource"),
        ("task", "Task"),
        ("ticket", "Ticket"),
        ("attachment", "Attachment"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="search_documents"
    )
    object_type = models.CharField(max_length=32, choices=OBJECT_TYPES)
    object_id = models.BigIntegerField()
    title = models.CharField(max_length=500)
    search_text = models.TextField(blank=True)
    # Delimited tag index ("|alpha|urgent|") so tag filters stay a portable
    # ``icontains`` lookup instead of a JSON containment operator.
    tag_slugs = models.CharField(max_length=500, blank=True, default="")
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="search_documents",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "object_type", "object_id"],
                name="unique_search_document_object",
            )
        ]
        indexes = [models.Index(fields=["tenant", "object_type"])]
