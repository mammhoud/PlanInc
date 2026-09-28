"""Account-scoped tag surface and comment listing (slice S2b).

``TagService`` owns the tag listing plus the seven ``tags.*`` mutations ported
from ``server/routerTrpc/tag.ts``. The mutations only work because slice S2t
derives ``tagsToNote`` links from note content: ``updateTagName`` and
``updateTagMany`` rewrite bodies and rely on re-derivation, and
``deleteOnlyTag`` garbage-collects tags whose usage count reached zero.

``CommentService`` stays read-only; comment mutation is owned by S6.

Upstream quirk kept deliberately: ``updateTagName`` does **not** rename the tag
row — the new name arrives through the content rewrite and the subsequent
derivation, exactly as ``tag.ts`` behaves.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from ..db.ids import next_id
from .errors import DomainError
from .tagging import TAG, TAG_TO_NOTE, TagDerivation, extract_hashtags
from .users import normalize_id

COMMENT = "comments"


def _now() -> datetime:
    return datetime.now(UTC)


def _scoped(rows: list[dict], account_id: int) -> list[dict]:
    out = []
    for row in rows:
        record = dict(row)
        record["id"] = normalize_id(record.get("id"))
        record["accountId"] = normalize_id(record.get("accountId"))
        if record["accountId"] == account_id:
            out.append(record)
    return out


def _strip_tag_token(content: str, name: str) -> str:
    """Remove the ``#name`` (and ``#parent/name``) tokens from ``content``."""
    result = content
    for token in extract_hashtags(content):
        if name in token.lstrip("#").split("/"):
            result = result.replace(token, "")
    return re.sub(r"[ \t]{2,}", " ", result).strip()


class TagService:
    def __init__(self, client: Any) -> None:
        self._client = client

    # -- reads ------------------------------------------------------------

    async def list_for_account(self, account_id: int) -> list[dict]:
        rows = _scoped(await self._client.select(TAG), account_id)
        rows.sort(key=lambda row: (row.get("sortOrder") or 0, row.get("name") or ""))
        return rows

    async def by_id(self, tag_id: Any, account_id: int) -> dict | None:
        target = normalize_id(tag_id)
        if target is None:
            return None
        for row in _scoped(await self._client.select(TAG), account_id):
            if row["id"] == target:
                return row
        return None

    async def full_name(self, tag_id: Any, account_id: int) -> str:
        """Render the parent chain as ``#a/b/c`` (``fullTagNameById``)."""
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            raise DomainError("NOT_FOUND", "Tag not found")
        names = [tag.get("name") or ""]
        seen = {tag["id"]}
        parent = normalize_id(tag.get("parent"))
        while parent and parent not in seen:
            seen.add(parent)
            ancestor = await self.by_id(parent, account_id)
            if ancestor is None:
                break
            names.insert(0, ancestor.get("name") or "")
            parent = normalize_id(ancestor.get("parent"))
        return "#" + "/".join(names)

    # -- mutations --------------------------------------------------------

    async def update_icon(self, tag_id: Any, account_id: int, icon: str) -> dict:
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            raise DomainError("NOT_FOUND", "Tag not found")
        await self._client.update(f"{TAG}:{tag['id']}", {"icon": icon})
        return {**tag, "icon": icon}

    async def update_order(
        self, tag_id: Any, account_id: int, sort_order: int
    ) -> dict:
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            raise DomainError("NOT_FOUND", "Tag not found")
        await self._client.update(f"{TAG}:{tag['id']}", {"sortOrder": sort_order})
        return {**tag, "sortOrder": sort_order}

    async def update_tag_many(
        self, account_id: int, ids: list, tag: str
    ) -> bool:
        """Append ``#tag`` to each note body, then let derivation link it."""
        for note_id in ids or []:
            note = await self._note(note_id, account_id)
            if note is None:
                continue
            content = f"{note.get('content') or ''} #{tag}".strip()
            await self._set_note_content(note["id"], account_id, content)
        return True

    async def update_tag_name(
        self, tag_id: Any, account_id: int, old_name: str, new_name: str
    ) -> bool:
        """Rewrite ``#old`` to ``#new`` in linked bodies; never renames the row."""
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            return True
        for note in await self._notes_for_tags([tag["id"]], account_id):
            content = str(note.get("content") or "")
            renamed = content.replace(f"#{old_name}", f"#{new_name}")
            if renamed != content:
                await self._set_note_content(note["id"], account_id, renamed)
        return True

    async def delete_only_tag(self, tag_id: Any, account_id: int) -> bool:
        """Strip the tag from every linked body, unlink, then GC the chain."""
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            return True
        chain = await self._chain_ids(tag["id"], account_id)
        for note in await self._notes_for_tags(chain, account_id):
            content = str(note.get("content") or "")
            stripped = _strip_tag_token(content, tag.get("name") or "")
            if stripped != content:
                await self._set_note_content(note["id"], account_id, stripped)
            await self._unlink(note["id"], chain)
        for chain_id in chain:
            if await self._usage_count(chain_id) == 0:
                await self._client.delete(f"{TAG}:{chain_id}")
        return True

    async def delete_tag_with_all_notes(self, tag_id: Any, account_id: int) -> bool:
        """Trash the linked notes, then run :meth:`delete_only_tag`."""
        tag = await self.by_id(tag_id, account_id)
        if tag is None:
            return True
        chain = await self._chain_ids(tag["id"], account_id)
        for note in await self._notes_for_tags(chain, account_id):
            await self._client.update(
                f"notes:{note['id']}", {"isRecycle": True, "updatedAt": _now()}
            )
        return await self.delete_only_tag(tag["id"], account_id)

    # -- internals --------------------------------------------------------

    async def _note(self, note_id: Any, account_id: int) -> dict | None:
        target = normalize_id(note_id)
        if target is None:
            return None
        for raw in await self._client.select("notes"):
            record = dict(raw)
            record["id"] = normalize_id(record.get("id"))
            record["accountId"] = normalize_id(record.get("accountId"))
            if record["id"] == target and record["accountId"] == account_id:
                return record
        return None

    async def _set_note_content(
        self, note_id: int, account_id: int, content: str
    ) -> None:
        await self._client.update(
            f"notes:{note_id}", {"content": content, "updatedAt": _now()}
        )
        await TagDerivation(self._client).derive(account_id, note_id, content)

    async def _links(self) -> list[dict]:
        return await self._client.select(TAG_TO_NOTE)

    async def _notes_for_tags(self, tag_ids: set[int], account_id: int) -> list[dict]:
        wanted = set(tag_ids)
        note_ids = {
            normalize_id(row.get("noteId"))
            for row in await self._links()
            if normalize_id(row.get("tagId")) in wanted
        }
        notes = []
        for note_id in note_ids:
            note = await self._note(note_id, account_id)
            if note is not None:
                notes.append(note)
        return notes

    async def _unlink(self, note_id: int, tag_ids: set[int]) -> None:
        target = normalize_id(note_id)
        for row in await self._links():
            if normalize_id(row.get("noteId")) != target:
                continue
            if normalize_id(row.get("tagId")) in tag_ids:
                link_id = normalize_id(row.get("id"))
                await self._client.delete(f"{TAG_TO_NOTE}:{link_id}")

    async def _usage_count(self, tag_id: int) -> int:
        return sum(
            1
            for row in await self._links()
            if normalize_id(row.get("tagId")) == tag_id
        )

    async def _chain_ids(self, tag_id: int, account_id: int) -> set[int]:
        """The tag, its ancestors, and every descendant (mirrors tag.ts)."""
        tags = _scoped(await self._client.select(TAG), account_id)
        by_id = {row["id"]: row for row in tags}
        chain: set[int] = set()

        def climb(current: int) -> None:
            if current in chain or current is None:
                return
            chain.add(current)
            node = by_id.get(current)
            if node is None:
                return
            parent = normalize_id(node.get("parent"))
            if parent:
                climb(parent)

        climb(tag_id)
        changed = True
        while changed:
            changed = False
            for row in tags:
                if (
                    normalize_id(row.get("parent")) in chain
                    and row["id"] not in chain
                ):
                    chain.add(row["id"])
                    changed = True
        return chain


class CommentService:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def list_for_account(
        self, account_id: int, note_id: Any | None = None
    ) -> list[dict]:
        rows = _scoped(await self._client.select(COMMENT), account_id)
        if note_id is not None:
            target = normalize_id(note_id)
            rows = [row for row in rows if normalize_id(row.get("noteId")) == target]
        rows.sort(key=lambda row: str(row.get("createdAt") or ""))
        return rows

    async def _note(self, note_id: Any) -> dict | None:
        target = normalize_id(note_id)
        if target is None:
            return None
        for raw in await self._client.select("notes"):
            if normalize_id(raw.get("id")) == target:
                return dict(raw)
        return None

    async def create(self, account_id: int, data: dict) -> bool:
        """Add a comment to a note the caller owns (TS ``comments.create``)."""
        note = await self._note(data.get("noteId"))
        if note is None or normalize_id(note.get("accountId")) != account_id:
            raise DomainError(
                "FORBIDDEN",
                "You do not have permission to comment on this note",
            )
        new_id = await next_id(self._client, COMMENT)
        stamp = _now()
        await self._client.create(
            f"{COMMENT}:{new_id}",
            {
                "content": data.get("content") or "",
                "noteId": normalize_id(note.get("id")),
                "parentId": normalize_id(data.get("parentId")),
                "accountId": account_id,
                "guestName": data.get("guestName"),
                "createdAt": stamp,
                "updatedAt": stamp,
            },
        )
        return True

    async def delete(self, comment_id: Any, account_id: int) -> dict:
        target = normalize_id(comment_id)
        if target is None:
            raise DomainError("NOT_FOUND", "Comment not found")
        for raw in await self._client.select(COMMENT):
            if normalize_id(raw.get("id")) != target:
                continue
            if normalize_id(raw.get("accountId")) != account_id:
                raise DomainError("NOT_FOUND", "Comment not found")
            await self._client.delete(f"{COMMENT}:{target}")
            return {"success": True}
        raise DomainError("NOT_FOUND", "Comment not found")
