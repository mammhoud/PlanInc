"""Planning use cases: categories, tasks, task links, tickets, and study review."""

from __future__ import annotations

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.audit.services import record_audit
from apps.operations.services import enqueue_event
from domain.errors import ConflictError, ValidationError
from domain.events.types import (
    STUDY_ITEM_CREATED,
    STUDY_ITEM_REVIEWED,
    TASK_CREATED,
    TASK_DELETED,
    TASK_LINKED,
    TASK_UNLINKED,
    TASK_UPDATED,
    TICKET_CREATED,
    TICKET_DELETED,
    TICKET_UPDATED,
)
from domain.policies.tenant import require_same_tenant, require_tenant_scope

from .models import Category, StudyItem, Task, TaskLink, Ticket

TASK_STATUSES = {choice for choice, _ in Task.STATUS_CHOICES}
TASK_PRIORITIES = {choice for choice, _ in Task.PRIORITY_CHOICES}
TICKET_STATUSES = {choice for choice, _ in Ticket.STATUS_CHOICES}
STUDY_STATUSES = {choice for choice, _ in StudyItem.STATUS_CHOICES}
TASK_LINK_KINDS = {choice for choice, _ in TaskLink.KIND_CHOICES}


def _actor_pk(actor):
    return actor.pk if getattr(actor, "pk", None) else None


# --------------------------------------------------------------------------- #
# Categories
# --------------------------------------------------------------------------- #
def list_categories(*, tenant):
    require_tenant_scope(tenant)
    return Category.objects.filter(tenant=tenant)


@transaction.atomic
def create_category(
    *, tenant, name: str, workspace=None, color: str = "", position: int = 0
) -> Category:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A category name is required.")
    slug = slugify(name)[:80]
    if not slug:
        raise ValidationError("The category name does not produce a usable slug.")
    if Category.objects.filter(tenant=tenant, slug=slug).exists():
        raise ConflictError("A category with that name already exists.")
    return Category.objects.create(
        tenant=tenant,
        workspace=workspace,
        name=name,
        slug=slug,
        color=color,
        position=position,
    )


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
def list_tasks(*, tenant, status: str | None = None, workspace=None):
    require_tenant_scope(tenant)
    queryset = Task.objects.filter(tenant=tenant)
    if status:
        if status not in TASK_STATUSES:
            raise ValidationError("Unknown task status.")
        queryset = queryset.filter(status=status)
    if workspace is not None:
        queryset = queryset.filter(workspace=workspace)
    return queryset


@transaction.atomic
def create_task(
    *,
    tenant,
    title: str,
    description: str = "",
    workspace=None,
    status: str = "todo",
    priority: str = "medium",
    due_at=None,
    assignee=None,
    note=None,
    category_ids=None,
) -> Task:
    require_tenant_scope(tenant)
    title = (title or "").strip()
    if not title:
        raise ValidationError("A task title is required.")
    _validate_status_priority(status=status, priority=priority)
    if note is not None:
        require_same_tenant(tenant=tenant, resource=note)
    task = Task.objects.create(
        tenant=tenant,
        workspace=workspace,
        title=title,
        description=description,
        status=status,
        priority=priority,
        due_at=due_at,
        assignee=_actor_pk(assignee),
        note=note,
    )
    _apply_categories(task=task, category_ids=category_ids)
    enqueue_event(
        tenant=tenant,
        event_type=TASK_CREATED,
        aggregate_type="task",
        aggregate_id=task.pk,
        payload={"title": task.title, "status": task.status},
        idempotency_key=f"task.created:{task.pk}",
    )
    record_audit(
        tenant=tenant,
        action="task.created",
        actor=assignee,
        object_type="task",
        object_id=task.pk,
    )
    return task


@transaction.atomic
def update_task(*, task: Task, **fields) -> Task:
    require_tenant_scope(task.tenant)
    category_ids = fields.pop("category_ids", None)
    if "status" in fields and fields["status"] is not None:
        if fields["status"] not in TASK_STATUSES:
            raise ValidationError("Unknown task status.")
        task.status = fields["status"]
    if "priority" in fields and fields["priority"] is not None:
        if fields["priority"] not in TASK_PRIORITIES:
            raise ValidationError("Unknown task priority.")
        task.priority = fields["priority"]
    for field in ("title", "description"):
        if fields.get(field) is not None:
            value = str(fields[field]).strip()
            if field == "title" and not value:
                raise ValidationError("A task title is required.")
            setattr(task, field, value)
    if fields.get("due_at") is not None:
        task.due_at = fields["due_at"]
    if fields.get("assignee") is not None:
        task.assignee = fields["assignee"]
    if fields.get("note") is not None:
        require_same_tenant(tenant=task.tenant, resource=fields["note"])
        task.note = fields["note"]
    if fields.get("workspace") is not None:
        task.workspace = fields["workspace"]
    task.save()
    if category_ids is not None:
        _apply_categories(task=task, category_ids=category_ids)
    enqueue_event(
        tenant=task.tenant,
        event_type=TASK_UPDATED,
        aggregate_type="task",
        aggregate_id=task.pk,
        payload={"title": task.title, "status": task.status},
        idempotency_key=f"task.updated:{task.pk}:{task.updated_at.isoformat()}",
    )
    return task


@transaction.atomic
def delete_task(*, task: Task) -> None:
    require_tenant_scope(task.tenant)
    tenant = task.tenant
    task_id = task.pk
    task.delete()
    enqueue_event(
        tenant=tenant,
        event_type=TASK_DELETED,
        aggregate_type="task",
        aggregate_id=task_id,
        payload={},
        idempotency_key=f"task.deleted:{task_id}",
    )


def _validate_status_priority(*, status, priority):
    if status not in TASK_STATUSES:
        raise ValidationError("Unknown task status.")
    if priority not in TASK_PRIORITIES:
        raise ValidationError("Unknown task priority.")


def _apply_categories(*, task, category_ids):
    if category_ids is None:
        return
    category_ids = list(dict.fromkeys(int(cid) for cid in category_ids))
    categories = list(Category.objects.filter(tenant=task.tenant, id__in=category_ids))
    if len(categories) != len(category_ids):
        raise ValidationError("One or more categories are unknown for this tenant.")
    task.categories.set(categories)


# --------------------------------------------------------------------------- #
# Task links
# --------------------------------------------------------------------------- #
def list_task_links(*, task: Task):
    require_tenant_scope(task.tenant)
    return task.outgoing_links.select_related("target")


@transaction.atomic
def create_task_link(*, source: Task, target: Task, kind: str = "relates") -> TaskLink:
    require_tenant_scope(source.tenant)
    require_same_tenant(tenant=source.tenant, resource=target)
    if kind not in TASK_LINK_KINDS:
        raise ValidationError("Unknown task link kind.")
    if source.pk == target.pk:
        raise ValidationError("A task cannot link to itself.")
    link, created = TaskLink.objects.get_or_create(
        source=source,
        target=target,
        kind=kind,
        defaults={"tenant": source.tenant},
    )
    if created:
        enqueue_event(
            tenant=source.tenant,
            event_type=TASK_LINKED,
            aggregate_type="task",
            aggregate_id=source.pk,
            payload={"target_id": target.pk, "kind": kind},
            idempotency_key=f"task.linked:{source.pk}:{target.pk}:{kind}",
        )
    return link


@transaction.atomic
def delete_task_link(*, link: TaskLink) -> None:
    require_tenant_scope(link.tenant)
    tenant = link.tenant
    link_id = link.pk
    source_id = link.source_id
    target_id = link.target_id
    link.delete()
    enqueue_event(
        tenant=tenant,
        event_type=TASK_UNLINKED,
        aggregate_type="task",
        aggregate_id=source_id,
        payload={"target_id": target_id},
        idempotency_key=f"task.unlinked:{link_id}",
    )


# --------------------------------------------------------------------------- #
# Tickets
# --------------------------------------------------------------------------- #
def list_tickets(*, tenant, status: str | None = None):
    require_tenant_scope(tenant)
    queryset = Ticket.objects.filter(tenant=tenant)
    if status:
        if status not in TICKET_STATUSES:
            raise ValidationError("Unknown ticket status.")
        queryset = queryset.filter(status=status)
    return queryset


@transaction.atomic
def create_ticket(
    *,
    tenant,
    title: str,
    body: str = "",
    workspace=None,
    status: str = "open",
    priority: str = "medium",
    task=None,
    external_ref: str = "",
) -> Ticket:
    require_tenant_scope(tenant)
    title = (title or "").strip()
    if not title:
        raise ValidationError("A ticket title is required.")
    if status not in TICKET_STATUSES:
        raise ValidationError("Unknown ticket status.")
    if priority not in TASK_PRIORITIES:
        raise ValidationError("Unknown ticket priority.")
    if task is not None:
        require_same_tenant(tenant=tenant, resource=task)
    ticket = Ticket.objects.create(
        tenant=tenant,
        workspace=workspace,
        title=title,
        body=body,
        status=status,
        priority=priority,
        task=task,
        external_ref=external_ref,
    )
    enqueue_event(
        tenant=tenant,
        event_type=TICKET_CREATED,
        aggregate_type="ticket",
        aggregate_id=ticket.pk,
        payload={"title": ticket.title, "status": ticket.status},
        idempotency_key=f"ticket.created:{ticket.pk}",
    )
    record_audit(
        tenant=tenant,
        action="ticket.created",
        object_type="ticket",
        object_id=ticket.pk,
    )
    return ticket


@transaction.atomic
def update_ticket(*, ticket: Ticket, **fields) -> Ticket:
    require_tenant_scope(ticket.tenant)
    if fields.get("status") is not None:
        if fields["status"] not in TICKET_STATUSES:
            raise ValidationError("Unknown ticket status.")
        ticket.status = fields["status"]
    if fields.get("priority") is not None:
        if fields["priority"] not in TASK_PRIORITIES:
            raise ValidationError("Unknown ticket priority.")
        ticket.priority = fields["priority"]
    for field in ("title", "body"):
        if fields.get(field) is not None:
            value = str(fields[field]).strip()
            if field == "title" and not value:
                raise ValidationError("A ticket title is required.")
            setattr(ticket, field, value)
    ticket.save()
    enqueue_event(
        tenant=ticket.tenant,
        event_type=TICKET_UPDATED,
        aggregate_type="ticket",
        aggregate_id=ticket.pk,
        payload={"title": ticket.title, "status": ticket.status},
        idempotency_key=f"ticket.updated:{ticket.pk}:{ticket.updated_at.isoformat()}",
    )
    return ticket


@transaction.atomic
def delete_ticket(*, ticket: Ticket) -> None:
    require_tenant_scope(ticket.tenant)
    tenant = ticket.tenant
    ticket_id = ticket.pk
    ticket.delete()
    enqueue_event(
        tenant=tenant,
        event_type=TICKET_DELETED,
        aggregate_type="ticket",
        aggregate_id=ticket_id,
        payload={},
        idempotency_key=f"ticket.deleted:{ticket_id}",
    )


# --------------------------------------------------------------------------- #
# Study review
# --------------------------------------------------------------------------- #
def list_study_items(*, tenant, status: str | None = None):
    require_tenant_scope(tenant)
    queryset = StudyItem.objects.filter(tenant=tenant)
    if status:
        if status not in STUDY_STATUSES:
            raise ValidationError("Unknown study status.")
        queryset = queryset.filter(status=status)
    return queryset


@transaction.atomic
def create_study_item(
    *, tenant, title: str, workspace=None, note=None, due_at=None, status: str = "new"
) -> StudyItem:
    require_tenant_scope(tenant)
    title = (title or "").strip()
    if not title:
        raise ValidationError("A study item title is required.")
    if status not in STUDY_STATUSES:
        raise ValidationError("Unknown study status.")
    if note is not None:
        require_same_tenant(tenant=tenant, resource=note)
    item = StudyItem.objects.create(
        tenant=tenant,
        workspace=workspace,
        note=note,
        title=title,
        status=status,
        due_at=due_at,
    )
    enqueue_event(
        tenant=tenant,
        event_type=STUDY_ITEM_CREATED,
        aggregate_type="study_item",
        aggregate_id=item.pk,
        payload={"title": item.title},
        idempotency_key=f"study_item.created:{item.pk}",
    )
    return item


@transaction.atomic
def review_study_item(*, item: StudyItem, correct: bool = True) -> StudyItem:
    """Advance one spaced-repetition review.

    A correct answer doubles the interval (capped at ``MAX_INTERVAL_DAYS``) and
    promotes the status; an incorrect answer resets to ``learning`` with a
    1-day interval. ``review_count`` always increases.
    """
    require_tenant_scope(item.tenant)
    if correct:
        item.interval_days = min(item.interval_days * 2, 365)
        if item.status in ("new", "learning"):
            item.status = "learning" if item.review_count < 1 else "review"
        elif item.status == "review" and item.interval_days >= 30:
            item.status = "mastered"
    else:
        item.interval_days = 1
        item.status = "learning"
    item.review_count += 1
    item.last_reviewed_at = timezone.now()
    item.due_at = timezone.now() + timedelta(days=item.interval_days)
    item.save()
    enqueue_event(
        tenant=item.tenant,
        event_type=STUDY_ITEM_REVIEWED,
        aggregate_type="study_item",
        aggregate_id=item.pk,
        payload={
            "status": item.status,
            "interval_days": item.interval_days,
            "correct": correct,
        },
        idempotency_key=f"study_item.reviewed:{item.pk}:{item.review_count}",
    )
    return item


@transaction.atomic
def update_study_item(*, item: StudyItem, **fields) -> StudyItem:
    require_tenant_scope(item.tenant)
    if fields.get("status") is not None and fields["status"] not in STUDY_STATUSES:
        raise ValidationError("Unknown study status.")
    for field in ("title", "status", "due_at", "note", "workspace"):
        if fields.get(field) is not None:
            setattr(item, field, fields[field])
    item.save()
    return item


@transaction.atomic
def delete_study_item(*, item: StudyItem) -> None:
    require_tenant_scope(item.tenant)
    item.delete()
