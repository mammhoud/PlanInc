from django.conf import settings
from django.db import models

from apps.tenancy.models import Tenant


class Category(models.Model):
    """Tenant-scoped bucket for tasks and tickets."""

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="planning_categories",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="categories",
    )
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80)
    color = models.CharField(max_length=16, blank=True)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "name", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "slug"],
                name="unique_category_slug_per_tenant",
            )
        ]


class Task(models.Model):
    STATUS_CHOICES = [
        ("todo", "Todo"),
        ("doing", "Doing"),
        ("blocked", "Blocked"),
        ("done", "Done"),
    ]
    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("urgent", "Urgent"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="tasks")
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    title = models.CharField(max_length=240)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="todo")
    priority = models.CharField(
        max_length=16, choices=PRIORITY_CHOICES, default="medium"
    )
    due_at = models.DateTimeField(null=True, blank=True)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planinc_tasks",
    )
    note = models.ForeignKey(
        "notes.Note",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="planning_tasks",
    )
    categories = models.ManyToManyField(
        Category,
        related_name="tasks",
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["tenant", "status"])]


class TaskLink(models.Model):
    """Directed dependency/relation between two tasks."""

    KIND_CHOICES = [
        ("blocks", "Blocks"),
        ("relates", "Relates"),
        ("duplicates", "Duplicates"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="task_links"
    )
    source = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="outgoing_links",
    )
    target = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="incoming_links",
    )
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="relates")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["source", "target", "kind"],
                name="unique_task_link",
            ),
            models.CheckConstraint(
                condition=~models.Q(source=models.F("target")),
                name="task_link_no_self",
            ),
        ]


class Ticket(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("in_progress", "In progress"),
        ("closed", "Closed"),
    ]
    PRIORITY_CHOICES = Task.PRIORITY_CHOICES

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="tickets")
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tickets",
    )
    title = models.CharField(max_length=240)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="open")
    priority = models.CharField(
        max_length=16, choices=PRIORITY_CHOICES, default="medium"
    )
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tickets",
    )
    external_ref = models.CharField(max_length=180, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [models.Index(fields=["tenant", "status"])]


class StudyItem(models.Model):
    """A spaced-repetition review item, optionally reviewing a note."""

    STATUS_CHOICES = [
        ("new", "New"),
        ("learning", "Learning"),
        ("review", "Review"),
        ("mastered", "Mastered"),
    ]

    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name="study_items"
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="study_items",
    )
    note = models.ForeignKey(
        "notes.Note",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="study_items",
    )
    title = models.CharField(max_length=240)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="new")
    due_at = models.DateTimeField(null=True, blank=True)
    interval_days = models.PositiveIntegerField(default=1)
    review_count = models.PositiveIntegerField(default=0)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_at", "-id"]
        indexes = [models.Index(fields=["tenant", "status"])]
