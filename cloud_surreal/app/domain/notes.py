"""Notes core domain service (slice S2).

Ports the account-scoped CRUD, reference, recycle-bin and review rules of
``server/routerTrpc/note.ts``. Every read and write is scoped to the caller's
account: a note owned by another account is reported as ``NOT_FOUND`` so its
existence never leaks.

Reads load the table and filter in Python, matching the identity slice's
approach until predicates move into query parameters.
"""

from __future__ import annotations

import random
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from ..db.ids import next_id
from .errors import DomainError
from .tagging import TagDerivation
from .users import normalize_id

NOTES = "notes"
TAG_TO_NOTE = "tagsToNote"
NOTE_REFERENCE = "noteReference"
NOTE_HISTORY = "noteHistory"
INTERNAL_SHARE = "noteInternalShare"
ATTACHMENTS = "attachments"

# Versions kept per note (server/routerTrpc/note.ts NOTE_HISTORY_RETENTION).
NOTE_HISTORY_RETENTION = 50

# Fields a client may set through ``upsert``/``updateMany``.
WRITABLE_FIELDS = {
    "content",
    "type",
    "metadata",
    "isTop",
    "isArchived",
    "isRecycle",
    "isShare",
    "isReviewed",
    "categoryId",
    "sortOrder",
    "assignee",
    "account",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _as_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _share_id() -> str:
    return secrets.token_urlsafe(16)[:12]


def normalize_note(row: dict) -> dict:
    record = dict(row)
    record["id"] = normalize_id(record.get("id"))
    if "accountId" in record:
        record["accountId"] = normalize_id(record.get("accountId"))
    return record


class NoteService:
    def __init__(self, client: Any) -> None:
        self._client = client

    # -- reads ------------------------------------------------------------

    async def _all(self) -> list[dict]:
        return [normalize_note(row) for row in await self._client.select(NOTES)]

    async def by_id(self, note_id: Any) -> dict | None:
        target = normalize_id(note_id)
        if target is None:
            return None
        for row in await self._all():
            if row["id"] == target:
                return row
        return None

    async def get(self, note_id: Any, account_id: int) -> dict:
        note = await self.by_id(note_id)
        if note is None or note.get("accountId") != account_id:
            raise DomainError("NOT_FOUND", "Note not found")
        return note

    async def list_for_account(
        self,
        account_id: int,
        *,
        include_recycle: bool = False,
        search: str | None = None,
        type_: str | None = None,
        category_id: int | None = None,
        tag_id: int | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        rows = [row for row in await self._all() if row.get("accountId") == account_id]
        if not include_recycle:
            rows = [row for row in rows if not row.get("isRecycle")]
        if search:
            needle = search.lower()
            rows = [
                row for row in rows if needle in str(row.get("content") or "").lower()
            ]
        if type_:
            rows = [row for row in rows if row.get("type") == type_]
        if category_id is not None:
            rows = [row for row in rows if row.get("categoryId") == category_id]
        if tag_id is not None:
            tagged = await self._note_ids_for_tag(tag_id)
            rows = [row for row in rows if row["id"] in tagged]
        rows.sort(key=lambda row: str(row.get("updatedAt") or ""), reverse=True)
        return rows[:limit] if limit else rows

    async def list_by_ids(self, ids: list, account_id: int) -> list[dict]:
        wanted = {normalize_id(value) for value in ids or []}
        return [
            row
            for row in await self._all()
            if row["id"] in wanted and row.get("accountId") == account_id
        ]

    async def public_detail(self, note_id: Any) -> dict | None:
        note = await self.by_id(note_id)
        if note is None or not note.get("isShare"):
            return None
        return note

    # -- writes -----------------------------------------------------------

    async def upsert(self, account_id: int, data: dict) -> dict:
        if not isinstance(data, dict):
            raise DomainError("BAD_REQUEST", "note input is required")
        patch = {key: data[key] for key in WRITABLE_FIELDS if key in data}
        note_id = normalize_id(data.get("id"))
        now = _now()
        if note_id is None:
            new_id = await next_id(self._client, NOTES)
            record = {
                **patch,
                "accountId": account_id,
                "createdAt": now,
                "updatedAt": now,
            }
            created = await self._client.create(f"{NOTES}:{new_id}", record)
            if isinstance(created, list):
                created = created[0] if created else record
            note = normalize_note({**record, **(created or {})})
            if "content" in patch:
                # Tags are derived from the body (S2t), mirroring the TS upsert.
                await TagDerivation(self._client).derive(
                    account_id, note["id"], patch["content"]
                )
            return note

        current = await self.get(note_id, account_id)
        if "content" in patch and patch["content"] != current.get("content"):
            # Snapshot the previous revision before overwriting it (TS upsert).
            await self._record_history(current)
        await self._client.update(f"{NOTES}:{note_id}", {**patch, "updatedAt": now})
        if "content" in patch:
            await TagDerivation(self._client).derive(
                account_id, note_id, patch["content"]
            )
        return normalize_note({**current, **patch, "updatedAt": now})

    async def update_many(self, ids: list, account_id: int, data: dict) -> int:
        patch = {key: data[key] for key in WRITABLE_FIELDS if key in data}
        if not patch:
            return 0
        changed = 0
        for note_id in ids or []:
            note = await self.by_id(note_id)
            if note is None or note.get("accountId") != account_id:
                continue
            await self._client.update(
                f"{NOTES}:{note['id']}", {**patch, "updatedAt": _now()}
            )
            changed += 1
        return changed

    async def trash_many(self, ids: list, account_id: int) -> int:
        return await self.update_many(ids, account_id, {"isRecycle": True})

    async def delete_many(self, ids: list, account_id: int) -> int:
        changed = 0
        for note_id in ids or []:
            note = await self.by_id(note_id)
            if note is None or note.get("accountId") != account_id:
                continue
            await self._client.delete(f"{NOTES}:{note['id']}")
            changed += 1
        return changed

    async def clear_recycle_bin(self, account_id: int) -> int:
        recycled = [
            row
            for row in await self._all()
            if row.get("accountId") == account_id and row.get("isRecycle")
        ]
        for row in recycled:
            await self._client.delete(f"{NOTES}:{row['id']}")
        return len(recycled)

    # -- references -------------------------------------------------------

    async def _references(self) -> list[dict]:
        return await self._client.select(NOTE_REFERENCE)

    async def add_reference(self, from_id: Any, to_id: Any, account_id: int) -> bool:
        source = await self.get(from_id, account_id)
        target = await self.get(to_id, account_id)
        for row in await self._references():
            if normalize_id(row.get("fromNoteId")) == source["id"] and normalize_id(
                row.get("toNoteId")
            ) == target["id"]:
                return True
        new_id = await next_id(self._client, NOTE_REFERENCE)
        await self._client.create(
            f"{NOTE_REFERENCE}:{new_id}",
            {"fromNoteId": source["id"], "toNoteId": target["id"]},
        )
        return True

    async def remove_reference(self, from_id: Any, to_id: Any, account_id: int) -> bool:
        source = await self.get(from_id, account_id)
        target = await self.get(to_id, account_id)
        for row in await self._references():
            if normalize_id(row.get("fromNoteId")) == source["id"] and normalize_id(
                row.get("toNoteId")
            ) == target["id"]:
                await self._client.delete(
                    f"{NOTE_REFERENCE}:{normalize_id(row.get('id'))}"
                )
        return True

    async def reference_list(
        self, note_id: Any, kind: str, account_id: int
    ) -> list[dict]:
        source = await self.get(note_id, account_id)
        collected: list[dict] = []
        for row in await self._references():
            if kind == "referencedBy":
                matches = normalize_id(row.get("toNoteId")) == source["id"]
                other = normalize_id(row.get("fromNoteId"))
            else:
                matches = normalize_id(row.get("fromNoteId")) == source["id"]
                other = normalize_id(row.get("toNoteId"))
            if not matches:
                continue
            note = await self.by_id(other)
            if note is not None and note.get("accountId") == account_id:
                collected.append(note)
        return collected

    async def related(self, note_id: Any, account_id: int) -> list[dict]:
        source = await self.get(note_id, account_id)
        mine = await self._tag_ids_for(source["id"])
        related: list[dict] = []
        for note in await self.list_for_account(account_id):
            if note["id"] == source["id"]:
                continue
            if mine & await self._tag_ids_for(note["id"]):
                related.append(note)
        return related

    async def _tag_ids_for(self, note_id: Any) -> set[int]:
        target = normalize_id(note_id)
        rows = await self._client.select(TAG_TO_NOTE)
        return {
            normalize_id(row.get("tagId"))
            for row in rows
            if normalize_id(row.get("noteId")) == target
        }

    async def _note_ids_for_tag(self, tag_id: Any) -> set[int]:
        target = normalize_id(tag_id)
        rows = await self._client.select(TAG_TO_NOTE)
        return {
            normalize_id(row.get("noteId"))
            for row in rows
            if normalize_id(row.get("tagId")) == target
        }

    # -- review -----------------------------------------------------------

    async def review(
        self, note_id: Any, account_id: int, reviewed: bool = True
    ) -> dict:
        note = await self.get(note_id, account_id)
        patch = {"isReviewed": reviewed, "reviewedAt": _now() if reviewed else None}
        await self._client.update(f"{NOTES}:{note['id']}", patch)
        return normalize_note({**note, **patch})

    async def review_stats(self, account_id: int) -> dict:
        rows = await self.list_for_account(account_id)
        reviewed = sum(1 for row in rows if row.get("isReviewed"))
        return {
            "total": len(rows),
            "reviewed": reviewed,
            "pending": len(rows) - reviewed,
        }

    async def daily_review_list(
        self, account_id: int, limit: int | None = None
    ) -> list[dict]:
        """Unreviewed notes created in the last 24h (TS ``dailyReviewNoteList``)."""
        cutoff = _now() - timedelta(hours=24)
        rows = [
            row
            for row in await self._all()
            if row.get("accountId") == account_id
            and not row.get("isReviewed")
            and not row.get("isArchived")
            and not row.get("isRecycle")
            and (created := _as_dt(row.get("createdAt"))) is not None
            and created > cutoff
        ]
        rows.sort(key=lambda row: row["id"] or 0, reverse=True)
        return rows[:limit] if limit else rows

    async def random_list(self, account_id: int, limit: int = 30) -> list[dict]:
        """A shuffled sample of the account's active notes (TS ``randomNoteList``)."""
        rows = [
            row
            for row in await self._all()
            if row.get("accountId") == account_id
            and not row.get("isArchived")
            and not row.get("isRecycle")
        ]
        random.shuffle(rows)
        return rows[:limit]

    async def public_list(
        self, *, page: int = 1, size: int = 30, search: str | None = None
    ) -> list[dict]:
        """Public feed: every ``isShare`` note, newest first."""
        rows = [row for row in await self._all() if row.get("isShare")]
        if search:
            needle = search.lower()
            rows = [
                row for row in rows if needle in str(row.get("content") or "").lower()
            ]
        rows.sort(key=lambda row: row["id"] or 0, reverse=True)
        start = max(page - 1, 0) * size
        return rows[start : start + size]

    # -- sharing ----------------------------------------------------------

    async def share_note(
        self,
        note_id: Any,
        account_id: int,
        *,
        is_cancel: bool = False,
        password: str | None = None,
        expire_at: Any = None,
    ) -> dict:
        note = await self.get(note_id, account_id)
        if is_cancel:
            patch: dict[str, Any] = {
                "isShare": False,
                "sharePassword": "",
                "shareExpiryDate": None,
                "shareEncryptedUrl": None,
            }
        else:
            patch = {
                "isShare": True,
                "shareEncryptedUrl": note.get("shareEncryptedUrl") or _share_id(),
                "sharePassword": password or "",
                "shareExpiryDate": expire_at,
            }
        await self._client.update(f"{NOTES}:{note['id']}", patch)
        return normalize_note({**note, **patch})

    async def _internal_shares(self, note_id: int) -> list[dict]:
        out = []
        for row in await self._client.select(INTERNAL_SHARE):
            record = dict(row)
            record["id"] = normalize_id(record.get("id"))
            record["noteId"] = normalize_id(record.get("noteId"))
            record["accountId"] = normalize_id(record.get("accountId"))
            if record["noteId"] == note_id:
                out.append(record)
        return out

    async def internal_share_note(
        self,
        note_id: Any,
        account_id: int,
        account_ids: list,
        is_cancel: bool = False,
    ) -> dict:
        note = await self.by_id(note_id)
        if note is None or note.get("accountId") != account_id:
            return {"success": False, "message": "Note not found"}
        wanted = {normalize_id(value) for value in (account_ids or [])}
        wanted.discard(account_id)
        existing = await self._internal_shares(note["id"])
        if is_cancel:
            for row in existing:
                if normalize_id(row.get("accountId")) in wanted:
                    await self._client.delete(f"{INTERNAL_SHARE}:{row['id']}")
            return {"success": True, "message": "Internal sharing cancelled"}
        valid = {
            normalize_id(account.get("id"))
            for account in await self._client.select("accounts")
            if normalize_id(account.get("id")) in wanted
        }
        for row in existing:
            if normalize_id(row.get("accountId")) not in valid:
                await self._client.delete(f"{INTERNAL_SHARE}:{row['id']}")
        shared = {normalize_id(row.get("accountId")) for row in existing}
        for target in valid - shared:
            new_id = await next_id(self._client, INTERNAL_SHARE)
            await self._client.create(
                f"{INTERNAL_SHARE}:{new_id}",
                {"noteId": note["id"], "accountId": target, "canEdit": True},
            )
        return {"success": True, "message": "Note shared internally"}

    async def internal_shared_users(self, note_id: Any, account_id: int) -> list[dict]:
        note = await self.get(note_id, account_id)
        shares = await self._internal_shares(note["id"])
        accounts = {
            normalize_id(row.get("id")): row
            for row in await self._client.select("accounts")
        }
        users = []
        for share in shares:
            target = normalize_id(share.get("accountId"))
            account = accounts.get(target)
            if account is None:
                continue
            users.append(
                {
                    "id": target,
                    "name": account.get("name") or "",
                    "nickname": account.get("nickname") or "",
                    "image": account.get("image") or "",
                }
            )
        return users

    # -- history ----------------------------------------------------------

    async def _history_rows(self, note_id: int) -> list[dict]:
        out = []
        for row in await self._client.select(NOTE_HISTORY):
            record = dict(row)
            record["id"] = normalize_id(record.get("id"))
            record["noteId"] = normalize_id(record.get("noteId"))
            if record["noteId"] == note_id:
                out.append(record)
        return out

    async def _record_history(self, note: dict) -> None:
        rows = await self._history_rows(note["id"])
        version = max((row.get("version") or 0) for row in rows) + 1 if rows else 1
        # Keep the newest retention-1 existing revisions so that, once this
        # snapshot is written, exactly NOTE_HISTORY_RETENTION rows remain.
        rows.sort(key=lambda row: row.get("version") or 0, reverse=True)
        for stale in rows[NOTE_HISTORY_RETENTION - 1 :]:
            await self._client.delete(f"{NOTE_HISTORY}:{stale['id']}")
        history_id = await next_id(self._client, NOTE_HISTORY)
        await self._client.create(
            f"{NOTE_HISTORY}:{history_id}",
            {
                "noteId": note["id"],
                "content": note.get("content") or "",
                "version": version,
                "accountId": note.get("accountId"),
                "metadata": {
                    "type": note.get("type"),
                    "isArchived": note.get("isArchived"),
                    "isTop": note.get("isTop"),
                    "isShare": note.get("isShare"),
                    "isRecycle": note.get("isRecycle"),
                },
                "createdAt": _now(),
            },
        )

    async def history(self, note_id: Any, account_id: int) -> list[dict]:
        note = await self.get(note_id, account_id)
        rows = await self._history_rows(note["id"])
        rows.sort(key=lambda row: row.get("version") or 0, reverse=True)
        return rows

    # -- ordering ---------------------------------------------------------

    async def update_notes_order(self, account_id: int, updates: list) -> dict:
        for entry in updates or []:
            note = await self.by_id(entry.get("id"))
            if note is None or note.get("accountId") != account_id:
                continue
            await self._client.update(
                f"{NOTES}:{note['id']}",
                {"sortOrder": entry.get("sortOrder"), "updatedAt": _now()},
            )
        return {"success": True}

    async def update_attachments_order(self, account_id: int, entries: list) -> dict:
        note_ids = {
            row["id"]
            for row in await self._all()
            if row.get("accountId") == account_id
        }
        for entry in entries or []:
            name = entry.get("name")
            for row in await self._client.select(ATTACHMENTS):
                record = dict(row)
                record["id"] = normalize_id(record.get("id"))
                if record.get("name") != name:
                    continue
                if normalize_id(record.get("note")) not in note_ids:
                    continue
                await self._client.update(
                    f"{ATTACHMENTS}:{record['id']}",
                    {"sortOrder": entry.get("sortOrder")},
                )
        return {"success": True}
