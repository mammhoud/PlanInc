"""Planning-family domain services (slice S3).

Ports ``ticket``, ``study``, ``task``, ``planningLink``, ``planningField`` and
``planningCategory`` from ``server/routerTrpc``. All entities are account-scoped
through :class:`AccountStore`; cross-account access is ``NOT_FOUND``.

Task scheduling is persisted (start/stop/update) but execution is owned by the
jobs phase, not this slice.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from .errors import DomainError
from .store import AccountStore
from .users import normalize_id

# -- self-reference guard for planning links --------------------------------

ENTITY_TABLE = {
    "note": "notes",
    "ticket": "tickets",
    "study": "studyItems",
    "resource": "attachments",
    "agent": "conversation",
}

CATEGORY_COLORS = [
    "#20808D",
    "#1FB8CD",
    "#091717",
    "#B4791E",
    "#B4426B",
    "#6D5AE6",
    "#2F7D5B",
    "#5A6B7B",
]
CATEGORY_ICONS = [
    "tabler:list-check",
    "tabler:target-arrow",
    "tabler:flag",
    "tabler:sparkles",
    "tabler:clock-hour-4",
    "tabler:book",
    "tabler:rocket",
    "tabler:folder",
]


def slugify_category(name: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", str(name or "").strip().lower())
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug[:60] or "category"


def merge_category_tag(
    tags: list[str], category: str, previous_category: str
) -> list[str]:
    """Mirror the category as a tag, dropping the previous category tag."""
    next_tags = [tag for tag in tags or [] if tag != previous_category]
    trimmed = (category or "").strip()
    if trimmed:
        next_tags.append(trimmed)
    seen: list[str] = []
    for tag in next_tags:
        if tag and tag not in seen:
            seen.append(tag)
    return seen


class TicketService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "tickets")

    async def list_tickets(
        self, account_id: int, status: str | None = None
    ) -> list[dict]:
        rows = await self.scoped(account_id)
        if status:
            rows = [row for row in rows if row.get("status") == status]
        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return rows

    async def create_ticket(self, account_id: int, data: dict) -> dict:
        title = str(data.get("title") or "").strip()
        if not title:
            raise DomainError("BAD_REQUEST", "title is required")
        tags = merge_category_tag(
            data.get("tags") or [], str(data.get("category") or ""), ""
        )
        return await self.create(
            account_id,
            {
                "title": title,
                "description": data.get("description") or "",
                "status": data.get("status") or "open",
                "priority": data.get("priority") or "medium",
                "noteId": normalize_id(data.get("noteId")),
                "studyItemId": normalize_id(data.get("studyItemId")),
                "category": data.get("category") or "",
                "tags": tags,
                "customFields": data.get("customFields") or {},
            },
        )

    async def update_ticket(self, account_id: int, data: dict) -> dict:
        current = await self.get(data.get("id"), account_id)
        patch = {
            key: data[key]
            for key in (
                "title",
                "description",
                "status",
                "priority",
                "noteId",
                "studyItemId",
                "category",
                "tags",
                "customFields",
            )
            if data.get(key) is not None
        }
        if "category" in patch or "tags" in patch:
            patch["tags"] = merge_category_tag(
                patch.get("tags", current.get("tags") or []),
                patch.get("category", current.get("category") or ""),
                current.get("category") or "" if "category" in patch else "",
            )
        return await self.update(current["id"], account_id, patch)


class StudyService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "studyItems")

    async def list_study(
        self,
        account_id: int,
        *,
        search_text: str = "",
        status: str | None = None,
        category: str | None = None,
        kind: str = "all",
        due_only: bool = False,
    ) -> list[dict]:
        rows = await self.scoped(account_id)
        needle = (search_text or "").strip().lower()
        now = datetime.now(UTC)
        result = []
        for item in rows:
            if status and item.get("status") != status:
                continue
            if category and item.get("category") != category:
                continue
            is_card = bool(item.get("question") or item.get("answer"))
            if kind == "question" and not is_card:
                continue
            if kind == "note" and is_card:
                continue
            if due_only and not _is_due(item, now):
                continue
            if needle:
                haystack = " ".join(
                    [
                        str(item.get("title") or ""),
                        str(item.get("description") or ""),
                        str(item.get("question") or ""),
                        str(item.get("answer") or ""),
                        str(item.get("category") or ""),
                        " ".join(item.get("tags") or []),
                    ]
                ).lower()
                if needle not in haystack:
                    continue
            result.append(item)
        result.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return result

    async def due_list(self, account_id: int, limit: int = 50) -> list[dict]:
        rows = await self.scoped(account_id)
        now = datetime.now(UTC)
        due = [row for row in rows if _is_due(row, now)]
        due.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return due[:limit]

    async def create_study(self, account_id: int, data: dict) -> dict:
        title = str(data.get("title") or "").strip()
        if not title:
            raise DomainError("BAD_REQUEST", "title is required")
        has_card = bool(data.get("question") or data.get("answer"))
        return await self.create(
            account_id,
            {
                "title": title,
                "description": data.get("description") or "",
                "status": data.get("status") or "planned",
                "sourceUrl": data.get("sourceUrl") or "",
                "noteId": normalize_id(data.get("noteId")),
                "category": data.get("category") or "",
                "tags": merge_category_tag(
                    data.get("tags") or [], str(data.get("category") or ""), ""
                ),
                "customFields": data.get("customFields") or {},
                "question": data.get("question") or "",
                "answer": data.get("answer") or "",
                "srsEase": 2.5,
                "srsInterval": 0,
                "srsReps": 0,
                "srsLapses": 0,
                "srsDueAt": datetime.now(UTC) if has_card else None,
                "srsLastAt": None,
            },
        )

    async def update_study(self, account_id: int, data: dict) -> dict:
        current = await self.get(data.get("id"), account_id)
        patch = {
            key: data[key]
            for key in (
                "title",
                "description",
                "status",
                "sourceUrl",
                "noteId",
                "category",
                "tags",
                "customFields",
                "question",
                "answer",
            )
            if data.get(key) is not None
        }
        if "category" in patch or "tags" in patch:
            patch["tags"] = merge_category_tag(
                patch.get("tags", current.get("tags") or []),
                patch.get("category", current.get("category") or ""),
                current.get("category") or "" if "category" in patch else "",
            )
        next_card = bool(
            (patch.get("question") or current.get("question"))
            or (patch.get("answer") or current.get("answer"))
        )
        if next_card and not current.get("srsDueAt") and not current.get("srsReps"):
            patch.setdefault("srsDueAt", datetime.now(UTC))
        return await self.update(current["id"], account_id, patch)

    async def review(self, account_id: int, item_id: Any, rating: str) -> dict:
        current = await self.get(item_id, account_id)
        next_state = apply_sm2(
            {
                "srsEase": _num(current.get("srsEase"), 2.5),
                "srsInterval": _num(current.get("srsInterval"), 0),
                "srsReps": _num(current.get("srsReps"), 0),
                "srsLapses": _num(current.get("srsLapses"), 0),
            },
            rating,
        )
        return await self.update(current["id"], account_id, next_state)


class PlanningLinkService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "planningLinks")

    async def list_links(
        self,
        account_id: int,
        *,
        entity_type: str | None = None,
        entity_id: Any | None = None,
        graph_only: bool = False,
    ) -> list[dict]:
        rows = await self.scoped(account_id)
        if entity_type and entity_id is not None:
            target = normalize_id(entity_id)
            rows = [
                row
                for row in rows
                if (
                    row.get("sourceType") == entity_type
                    and normalize_id(row.get("sourceId")) == target
                )
                or (
                    row.get("targetType") == entity_type
                    and normalize_id(row.get("targetId")) == target
                )
            ]
        if graph_only:
            rows = [row for row in rows if row.get("showInGraph")]
        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return rows

    async def create_link(self, account_id: int, data: dict) -> dict:
        source_type = data.get("sourceType")
        target_type = data.get("targetType")
        source_id = normalize_id(data.get("sourceId"))
        target_id = normalize_id(data.get("targetId"))
        if source_type == target_type and source_id == target_id:
            raise DomainError("BAD_REQUEST", "An item cannot link to itself")
        await self._assert_entity(account_id, source_type, source_id)
        await self._assert_entity(account_id, target_type, target_id)
        for existing in await self.scoped(
            account_id,
            sourceType=source_type,
            sourceId=source_id,
            targetType=target_type,
            targetId=target_id,
        ):
            return await self.update(
                existing["id"],
                account_id,
                {
                    "showInGraph": data.get("showInGraph", True),
                    "label": data.get("label") or "",
                },
            )
        return await self.create(
            account_id,
            {
                "sourceType": source_type,
                "sourceId": source_id,
                "targetType": target_type,
                "targetId": target_id,
                "label": data.get("label") or "",
                "showInGraph": data.get("showInGraph", True),
                "metadata": data.get("metadata") or {},
            },
        )

    async def _assert_entity(
        self, account_id: int, entity_type: str | None, entity_id: int | None
    ) -> None:
        table = ENTITY_TABLE.get(str(entity_type))
        if table is None or entity_id is None:
            raise DomainError("BAD_REQUEST", f"unknown entity type: {entity_type}")
        rows = await self._client.select(table)
        for row in rows:
            if normalize_id(row.get("id")) == entity_id and (
                normalize_id(row.get("accountId")) == account_id
            ):
                return
        raise DomainError("NOT_FOUND", f"{entity_type} not found")


class PlanningFieldService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "planningFormFields")

    async def list_fields(
        self,
        account_id: int,
        *,
        kind: str | None = None,
        include_disabled: bool = False,
    ) -> list[dict]:
        rows = await self.scoped(account_id)
        if kind:
            rows = [row for row in rows if row.get("kind") == kind]
        if not include_disabled:
            rows = [row for row in rows if row.get("enabled", True)]
        rows.sort(
            key=lambda row: (row.get("sortOrder") or 0, str(row.get("createdAt") or ""))
        )
        return rows

    async def create_field(self, account_id: int, data: dict) -> dict:
        kind = data.get("kind")
        key = str(data.get("key") or "").strip().lower()
        if not kind or not key:
            raise DomainError("BAD_REQUEST", "kind and key are required")
        clash = await self.scoped(account_id, kind=kind, key=key)
        if clash:
            raise DomainError(
                "CONFLICT", f'A "{key}" field already exists for this form'
            )
        return await self.create(
            account_id,
            {
                "kind": kind,
                "key": key,
                "label": data.get("label") or key,
                "fieldType": data.get("fieldType") or "text",
                "options": data.get("options") or [],
                "required": bool(data.get("required")),
                "showInGraph": bool(data.get("showInGraph")),
                "enabled": bool(data.get("enabled", True)),
                "sortOrder": int(data.get("sortOrder") or 0),
            },
        )

    async def update_field(self, account_id: int, data: dict) -> dict:
        current = await self.get(data.get("id"), account_id)
        patch = {
            key: data[key]
            for key in (
                "kind",
                "key",
                "label",
                "fieldType",
                "options",
                "required",
                "showInGraph",
                "enabled",
                "sortOrder",
            )
            if data.get(key) is not None
        }
        if "key" in patch or "kind" in patch:
            next_kind = patch.get("kind", current.get("kind"))
            next_key = str(patch.get("key", current.get("key"))).lower()
            patch["key"] = next_key
            clash = await self.scoped(account_id, kind=next_kind, key=next_key)
            if any(row["id"] != current["id"] for row in clash):
                raise DomainError(
                    "CONFLICT", f'A "{next_key}" field already exists for this form'
                )
        return await self.update(current["id"], account_id, patch)


class PlanningCategoryService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "planningCategories")

    async def list_categories(
        self, account_id: int, *, include_disabled: bool = False
    ) -> list[dict]:
        rows = await self.scoped(account_id)
        if not include_disabled:
            rows = [row for row in rows if row.get("enabled", True)]
        rows.sort(
            key=lambda row: (row.get("sortOrder") or 0, str(row.get("createdAt") or ""))
        )
        return rows

    async def create_category(self, account_id: int, data: dict) -> dict:
        name = str(data.get("name") or "").strip()
        if not name:
            raise DomainError("BAD_REQUEST", "name is required")
        slug = str(data.get("slug") or "").strip().lower() or slugify_category(name)
        if await self.scoped(account_id, slug=slug):
            raise DomainError("CONFLICT", f'A "{name}" category already exists')
        siblings = await self.scoped(account_id)
        if data.get("isDefault"):
            for sibling in siblings:
                if sibling.get("isDefault"):
                    await self.update(sibling["id"], account_id, {"isDefault": False})
        return await self.create(
            account_id,
            {
                "name": name,
                "slug": slug,
                "color": data.get("color") or CATEGORY_COLORS[0],
                "icon": data.get("icon") or CATEGORY_ICONS[0],
                "isDefault": bool(data.get("isDefault")) or not siblings,
                "enabled": bool(data.get("enabled", True)),
                "sortOrder": len(siblings),
            },
        )

    async def update_category(self, account_id: int, data: dict) -> dict:
        current = await self.get(data.get("id"), account_id)
        patch = {
            key: data[key]
            for key in ("name", "slug", "color", "icon", "isDefault", "enabled")
            if data.get(key) is not None
        }
        if "slug" in patch:
            patch["slug"] = str(patch["slug"]).lower()
            if patch["slug"] != current["slug"]:
                clash = await self.scoped(account_id, slug=patch["slug"])
                if any(row["id"] != current["id"] for row in clash):
                    raise DomainError("CONFLICT", "That slug is already in use")
        if patch.get("isDefault"):
            for sibling in await self.scoped(account_id):
                if sibling["id"] != current["id"] and sibling.get("isDefault"):
                    await self.update(sibling["id"], account_id, {"isDefault": False})
        return await self.update(current["id"], account_id, patch)

    async def delete_category(
        self, account_id: int, category_id: Any, reassign_to_id: Any | None = None
    ) -> dict:
        current = await self.get(category_id, account_id)
        target = normalize_id(reassign_to_id)
        if target is not None:
            await self.get(target, account_id)
        notes = await self._client.select("notes")
        reassigned = 0
        for note in notes:
            if normalize_id(note.get("accountId")) == account_id and normalize_id(
                note.get("categoryId")
            ) == current["id"]:
                await self._client.update(
                    f"notes:{normalize_id(note.get('id'))}", {"categoryId": target}
                )
                reassigned += 1
        await self.delete(current["id"], account_id)
        remaining = await self.list_categories(account_id, include_disabled=True)
        for index, sibling in enumerate(remaining):
            patch = {}
            if (sibling.get("sortOrder") or 0) != index:
                patch["sortOrder"] = index
            if current.get("isDefault") and index == 0 and not sibling.get("isDefault"):
                patch["isDefault"] = True
            if patch:
                await self.update(sibling["id"], account_id, patch)
        return {"success": True, "reassigned": reassigned}

    async def reorder(self, account_id: int, ordered_ids: list) -> list[dict]:
        rows = await self.scoped(account_id)
        known = {row["id"] for row in rows}
        ordered = [normalize_id(value) for value in ordered_ids or []]
        for index, record_id in enumerate(value for value in ordered if value in known):
            current = next(row for row in rows if row["id"] == record_id)
            if (current.get("sortOrder") or 0) != index:
                await self.update(record_id, account_id, {"sortOrder": index})
        return await self.list_categories(account_id, include_disabled=True)

    async def assign(
        self, account_id: int, note_id: Any, category_id: Any | None
    ) -> dict:
        note = None
        for row in await self._client.select("notes"):
            if normalize_id(row.get("id")) == normalize_id(note_id) and normalize_id(
                row.get("accountId")
            ) == account_id:
                note = row
                break
        if note is None:
            raise DomainError("NOT_FOUND", "Plan not found")
        next_name = ""
        if category_id is not None:
            category = await self.get(category_id, account_id)
            next_name = str(category.get("name") or "")
        previous_name = ""
        if note.get("categoryId") is not None:
            previous = await self.by_id(note.get("categoryId"))
            if previous is not None:
                previous_name = str(previous.get("name") or "")
        tags = merge_category_tag(
            list(note.get("tags") or []), next_name, previous_name
        )
        await self._client.update(
            f"notes:{normalize_id(note.get('id'))}",
            {"categoryId": normalize_id(category_id), "tags": tags},
        )
        return {"success": True}

    async def seed_defaults(
        self, account_id: int, names: list | None = None
    ) -> list[dict]:
        chosen = [str(name) for name in (names or []) if str(name).strip()] or [
            "Now",
            "Next",
            "Later",
        ]
        existing = await self.scoped(account_id)
        created: list[dict] = []
        for index, name in enumerate(chosen):
            slug = slugify_category(name)
            if any(row.get("slug") == slug for row in existing + created):
                continue
            created.append(
                await self.create(
                    account_id,
                    {
                        "name": name,
                        "slug": slug,
                        "color": CATEGORY_COLORS[index % len(CATEGORY_COLORS)],
                        "icon": CATEGORY_ICONS[index % len(CATEGORY_ICONS)],
                        "isDefault": not existing and not created,
                        "enabled": True,
                        "sortOrder": len(existing) + len(created),
                    },
                )
            )
        return created


class TaskService(AccountStore):
    """Persisted scheduler state; job execution belongs to the jobs phase."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, "scheduledTasks")

    async def list_tasks(self) -> list[dict]:
        rows = await self.all()
        return [
            {
                "name": row.get("task"),
                "schedule": row.get("schedule") or "",
                "lastRun": row.get("lastRun"),
                "isRunning": bool(row.get("isRunning")),
                "output": row.get("output"),
            }
            for row in rows
            if row.get("task")
        ]

    async def upsert_task(self, data: dict) -> dict:
        task = str(data.get("task") or "")
        action = str(data.get("type") or "")
        if not task:
            raise DomainError("BAD_REQUEST", "task is required")
        existing = next(
            (row for row in await self.all() if row.get("task") == task), None
        )
        schedule = data.get("time") or (existing or {}).get("schedule") or "0 0 * * *"
        if action == "start":
            payload = {"task": task, "schedule": schedule, "isRunning": True}
        elif action == "stop":
            payload = {"task": task, "schedule": schedule, "isRunning": False}
        elif action == "update":
            payload = {"task": task, "schedule": schedule, "isRunning": True}
        else:
            raise DomainError("BAD_REQUEST", f"unknown task action: {action}")
        if existing is None:
            await self.create(0, payload)
        else:
            await self._client.update(f"{self.table}:{existing['id']}", payload)
        return {"success": True, "action": action, "cron": schedule}


# -- SM-2 -------------------------------------------------------------------


def _num(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_due(item: dict, now: datetime) -> bool:
    if not item.get("question") and not item.get("answer"):
        return False
    due = item.get("srsDueAt")
    if not due:
        return True
    if isinstance(due, str):
        try:
            due = datetime.fromisoformat(due.replace("Z", "+00:00"))
        except ValueError:
            return True
    return due <= now


def apply_sm2(current: dict, rating: str) -> dict:
    """Simplified SM-2 grading, matching the TS server's schedule math."""
    ease = current["srsEase"] if current["srsEase"] > 0 else 2.5
    interval = current["srsInterval"] if current["srsInterval"] > 0 else 0
    reps = current["srsReps"] if current["srsReps"] > 0 else 0
    lapses = current["srsLapses"] if current["srsLapses"] > 0 else 0

    if rating == "again":
        lapses += 1
        reps = 0
        ease = max(1.3, ease - 0.2)
        interval = 0
    elif rating == "hard":
        ease = max(1.3, ease - 0.15)
        interval = 1 if interval <= 0 else max(1, round(interval * 1.2))
        reps += 1
    elif rating == "good":
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        reps += 1
    else:  # easy
        ease = min(3.0, ease + 0.15)
        interval = 4 if interval <= 0 else max(4, round(interval * ease * 1.3))
        reps += 1

    now = datetime.now(UTC)
    if interval <= 0:
        due = now.replace(hour=23, minute=59, second=0, microsecond=0)
    else:
        due = now + timedelta(days=interval)
    return {
        "srsEase": ease,
        "srsInterval": interval,
        "srsReps": reps,
        "srsLapses": lapses,
        "srsDueAt": due,
        "srsLastAt": now,
    }
