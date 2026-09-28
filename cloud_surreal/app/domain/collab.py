"""Collaboration domain services (slice S6).

Ports the account-scoped rules of ``server/routerTrpc/{agentDirectory,
conversation,message,follows,shareApproval}.ts``.

Deliberate deviations from the source stack:

- ``follows`` is the federated *site* follow list (``siteUrl`` /
  ``followType``), not a user graph. The TS handlers also POST back to the
  followed site over HTTP; a port must not make an outbound request on a write
  path, so the port stores the row and skips the notification. The row shape is
  unchanged, so the lists stay truthful.
- ``shareApprovals`` keeps the layered model: an approval row is created
  ``pending`` and only an ``approved`` row is access-bearing — a pending
  internal request never writes ``noteInternalShare``, so it cannot leak a note.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from ..db.ids import next_id
from .errors import DomainError
from .store import AccountStore, normalize_record, now
from .users import normalize_id

AGENT_DIRECTORY = "agentDirectory"
CONVERSATION = "conversation"
MESSAGE = "message"
FOLLOWS = "follows"
SHARE_APPROVAL = "shareApproval"
CACHE = "cache"
CONFIG = "config"
NOTES = "notes"

SHARE_APPROVAL_POLICY_KEY = "requireShareApproval"
INVITE_TTL_DAYS = 14
AGENT_DIR_KINDS = ("working", "skills")


def _new_token() -> str:
    return secrets.token_urlsafe(24)


def derive_agent_dir_label(label: str, path: str) -> str:
    """Mirror ``deriveAgentDirLabel``: fall back to the path's basename."""
    text = (label or "").strip()
    if text:
        return text[:80]
    cleaned = (path or "").rstrip("/")
    return (cleaned.rsplit("/", 1)[-1] or cleaned)[:80]


class AgentDirectoryService(AccountStore):
    """``agentDirectories.*`` — working/skills directory entries."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, AGENT_DIRECTORY)

    async def list_dirs(
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
            key=lambda row: (
                row.get("kind") or "",
                row.get("sortOrder") or 0,
                str(row.get("createdAt") or ""),
            )
        )
        return rows

    async def create_dir(self, account_id: int, data: dict) -> dict:
        kind = str(data.get("kind") or "working")
        if kind not in AGENT_DIR_KINDS:
            raise DomainError("BAD_REQUEST", "Unknown directory kind")
        path = str(data.get("path") or "")
        existing = await self.scoped(account_id, kind=kind, path=path)
        if existing:
            return existing[0]
        rows = await self.scoped(account_id, kind=kind)
        return await self.create(
            account_id,
            {
                "kind": kind,
                "label": derive_agent_dir_label(str(data.get("label") or ""), path),
                "path": path,
                "isDefault": bool(data.get("isDefault")),
                "enabled": data.get("enabled", True),
                "sortOrder": int(data.get("sortOrder") or len(rows)),
            },
        )

    async def update_dir(self, account_id: int, data: dict) -> dict:
        patch = {
            key: data[key]
            for key in ("kind", "label", "path", "isDefault", "enabled", "sortOrder")
            if key in data
        }
        if "label" in patch and "path" in patch:
            patch["label"] = derive_agent_dir_label(patch["label"], patch["path"])
        return await self.update(data.get("id"), account_id, patch)

    async def reorder(
        self, account_id: int, kind: str, ordered_ids: list
    ) -> list[dict]:
        for index, record_id in enumerate(ordered_ids or []):
            await self.update(record_id, account_id, {"sortOrder": index})
        return await self.list_dirs(account_id, kind=kind, include_disabled=True)


class ConversationService(AccountStore):
    """``conversation.*`` — AI chat threads."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, CONVERSATION)

    async def create_conversation(self, account_id: int, title: str | None) -> dict:
        return await self.create(account_id, {"title": title or "", "isShare": False})

    async def list_conversations(
        self, account_id: int, page: int = 1, size: int = 20
    ) -> dict:
        rows = await self.scoped(account_id)
        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        total = len(rows)
        start = max(page - 1, 0) * size
        return {"total": total, "items": rows[start : start + size]}

    async def detail(self, account_id: int, conversation_id: Any) -> dict:
        conversation = await self.get(conversation_id, account_id)
        messages = [
            row
            for row in await self._messages()
            if row.get("conversationId") == conversation["id"]
        ]
        messages.sort(key=lambda row: str(row.get("createdAt") or ""))
        return {**conversation, "messages": messages}

    async def public_detail(self, share_id: str) -> dict | None:
        for row in await self.all():
            if row.get("shareId") == share_id and row.get("isShare"):
                messages = [
                    message
                    for message in await self._messages()
                    if message.get("conversationId") == row["id"]
                ]
                messages.sort(key=lambda message: str(message.get("createdAt") or ""))
                return {**row, "messages": messages}
        return None

    async def toggle_share(self, account_id: int, conversation_id: Any) -> dict:
        conversation = await self.get(conversation_id, account_id)
        if conversation.get("isShare"):
            return await self.update(
                conversation["id"], account_id, {"isShare": False, "shareId": None}
            )
        share_id = conversation.get("shareId") or _new_token()[:12]
        return await self.update(
            conversation["id"],
            account_id,
            {"isShare": True, "shareId": share_id},
        )

    async def clear_messages(self, account_id: int, conversation_id: Any) -> dict:
        conversation = await self.get(conversation_id, account_id)
        for row in await self._messages():
            if row.get("conversationId") == conversation["id"]:
                await self._client.delete(f"{MESSAGE}:{row['id']}")
        return {"success": True}

    async def delete_conversation(self, account_id: int, conversation_id: Any) -> dict:
        conversation = await self.get(conversation_id, account_id)
        for row in await self._messages():
            if row.get("conversationId") == conversation["id"]:
                await self._client.delete(f"{MESSAGE}:{row['id']}")
        await self.delete(conversation["id"], account_id)
        return {"success": True}

    async def _messages(self) -> list[dict]:
        return [normalize_record(row) for row in await self._client.select(MESSAGE)]


class MessageService(AccountStore):
    """``message.*`` — messages inside a conversation."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, MESSAGE)

    async def _owned_conversation(self, conversation_id: Any, account_id: int) -> dict:
        for row in await self._client.select(CONVERSATION):
            record = normalize_record(row)
            if (
                record["id"] == normalize_id(conversation_id)
                and record.get("accountId") == account_id
            ):
                return record
        raise DomainError("NOT_FOUND", "Conversation not found")

    async def create_message(self, account_id: int, data: dict) -> dict:
        conversation = await self._owned_conversation(
            data.get("conversationId"), account_id
        )
        return await self.create(
            account_id,
            {
                "conversationId": conversation["id"],
                "content": data.get("content") or "",
                "role": data.get("role") or "user",
                "metadata": data.get("metadata"),
            },
        )

    async def update_message(self, account_id: int, data: dict) -> dict:
        return await self.update(
            data.get("id"), account_id, {"content": data.get("content") or ""}
        )

    async def clear_after(self, account_id: int, message_id: Any) -> dict:
        anchor = await self.get(message_id, account_id)
        cutoff = str(anchor.get("createdAt") or "")
        removed = 0
        anchor_conversation = anchor["conversationId"]
        for row in await self.scoped(account_id, conversationId=anchor_conversation):
            if str(row.get("createdAt") or "") > cutoff:
                await self._client.delete(f"{MESSAGE}:{row['id']}")
                removed += 1
        return {"success": True, "removed": removed}


class FollowsService(AccountStore):
    """``follows.*`` — federated site follow list."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, FOLLOWS)

    async def follow(self, account_id: int, data: dict) -> dict:
        site_url = str(data.get("siteUrl") or "")
        existing = await self.scoped(
            account_id, followType="following", siteUrl=site_url
        )
        if existing:
            return {"success": True, "data": existing[0]}
        row = await self.create(
            account_id,
            {
                "siteUrl": site_url,
                "siteName": data.get("siteName") or "",
                "siteAvatar": data.get("siteAvatar") or "",
                "description": data.get("description") or "",
                "followType": "following",
            },
        )
        return {"success": True, "data": row}

    async def unfollow(self, account_id: int, data: dict) -> bool:
        site_url = str(data.get("siteUrl") or "")
        for row in await self.scoped(
            account_id, followType="following", siteUrl=site_url
        ):
            await self._client.delete(f"{FOLLOWS}:{row['id']}")
        return True

    async def follow_list(
        self, account_id: int, user_id: Any | None = None
    ) -> list[dict]:
        target = normalize_id(user_id) or account_id
        rows = await self.scoped(target, followType="following")
        return [_clean_follow(row) for row in rows]

    async def follower_list(
        self, account_id: int, user_id: Any | None = None
    ) -> list[dict]:
        target = normalize_id(user_id) or account_id
        rows = await self.scoped(target, followType="follower")
        return [_clean_follow(row) for row in rows]

    async def recommand_list(self, account_id: int, search: str = "") -> list[dict]:
        for row in await self._client.select(CACHE):
            if row.get("key") != "recommand_list":
                continue
            value = row.get("value") or {}
            items = value.get(str(account_id)) or []
            filtered = [
                item for item in items if search in str(item.get("content") or "")
            ]
            filtered.sort(
                key=lambda item: str(item.get("updatedAt") or ""), reverse=True
            )
            return filtered
        return []


def _clean_follow(row: dict) -> dict:
    record = dict(row)
    for key in ("siteName", "siteAvatar", "description"):
        if record.get(key) is None:
            record.pop(key, None)
    return record


class ShareApprovalService(AccountStore):
    """``shareApprovals.*`` — layered share approvals (internal/email/public)."""

    def __init__(self, client: Any) -> None:
        super().__init__(client, SHARE_APPROVAL)

    # -- policy -----------------------------------------------------------

    async def _policy_required(self) -> bool:
        for row in await self._client.select(CONFIG):
            if row.get("key") != SHARE_APPROVAL_POLICY_KEY:
                continue
            config = row.get("config") or {}
            value = config.get("value") if isinstance(config, dict) else config
            return value is True or value == "true"
        return False

    async def policy(self, account_id: int, is_admin: bool) -> dict:
        return {
            "requireShareApproval": await self._policy_required(),
            "isAdmin": bool(is_admin),
        }

    async def set_policy(self, required: bool) -> dict:
        for row in await self._client.select(CONFIG):
            if row.get("key") == SHARE_APPROVAL_POLICY_KEY:
                await self._client.update(
                    f"{CONFIG}:{normalize_id(row.get('id'))}",
                    {"config": {"value": bool(required)}},
                )
                return {"requireShareApproval": bool(required)}
        new_id = await next_id(self._client, CONFIG)
        await self._client.create(
            f"{CONFIG}:{new_id}",
            {"key": SHARE_APPROVAL_POLICY_KEY, "config": {"value": bool(required)}},
        )
        return {"requireShareApproval": bool(required)}

    # -- reads ------------------------------------------------------------

    async def inbox(self, account_id: int, status: str | None = None) -> list[dict]:
        rows = await self.all()
        rows = [
            row
            for row in rows
            if normalize_id(row.get("inviteeAccountId")) == account_id
        ]
        if status:
            rows = [row for row in rows if row.get("status") == status]
        return rows

    async def outgoing(
        self,
        account_id: int,
        note_id: Any | None = None,
        status: str | None = None,
    ) -> list[dict]:
        rows = [
            row
            for row in await self.all()
            if account_id
            in {
                normalize_id(row.get("accountId")),
                normalize_id(row.get("requestedBy")),
            }
        ]
        if note_id is not None:
            target = normalize_id(note_id)
            rows = [row for row in rows if normalize_id(row.get("noteId")) == target]
        if status:
            rows = [row for row in rows if row.get("status") == status]
        return rows

    async def pending_admin(self, status: str | None = None) -> list[dict]:
        rows = [
            row
            for row in await self.all()
            if row.get("requiresAdmin") and not row.get("adminApproved")
        ]
        if status:
            rows = [row for row in rows if row.get("status") == status]
        return rows

    async def for_note(self, account_id: int, note_id: Any) -> list[dict]:
        await self._owned_note(note_id, account_id)
        target = normalize_id(note_id)
        return [
            row for row in await self.all() if normalize_id(row.get("noteId")) == target
        ]

    # -- requests ---------------------------------------------------------

    async def _owned_note(self, note_id: Any, account_id: int) -> dict:
        target = normalize_id(note_id)
        for raw in await self._client.select(NOTES):
            record = normalize_record(raw)
            if record["id"] == target and record.get("accountId") == account_id:
                return record
        raise DomainError("NOT_FOUND", "Note not found")

    async def _create_approval(
        self, account_id: int, note_id: int, fields: dict
    ) -> dict:
        required = await self._policy_required()
        return await self.create(
            account_id,
            {
                "noteId": note_id,
                "scope": fields.get("scope") or "internal",
                "status": fields.get("status") or "pending",
                "inviteeAccountId": normalize_id(fields.get("inviteeAccountId")),
                "inviteeEmail": fields.get("inviteeEmail"),
                "token": fields.get("token"),
                "canEdit": fields.get("canEdit", True),
                "requiresAdmin": required,
                "adminApproved": not required,
                "requestedBy": account_id,
                "decidedBy": None,
                "decidedAt": None,
                "decisionNote": None,
                "expiresAt": fields.get("expiresAt"),
                "message": fields.get("message") or "",
            },
        )

    async def request_internal(self, account_id: int, data: dict) -> list[dict]:
        note = await self._owned_note(data.get("noteId"), account_id)
        created = []
        for invitee in data.get("accountIds") or []:
            invitee_id = normalize_id(invitee)
            if invitee_id in (None, account_id):
                continue
            created.append(
                await self._create_approval(
                    account_id,
                    note["id"],
                    {
                        "scope": "internal",
                        "inviteeAccountId": invitee_id,
                        "canEdit": data.get("canEdit", True),
                        "message": data.get("message"),
                    },
                )
            )
        return created

    async def invite_by_email(self, account_id: int, data: dict) -> dict:
        note = await self._owned_note(data.get("noteId"), account_id)
        approval = await self._create_approval(
            account_id,
            note["id"],
            {
                "scope": "email",
                "inviteeEmail": data.get("email"),
                "token": _new_token(),
                "canEdit": data.get("canEdit", True),
                "message": data.get("message"),
                "expiresAt": now() + timedelta(days=INVITE_TTL_DAYS),
            },
        )
        return {"approval": approval, "token": approval.get("token")}

    async def request_public(self, account_id: int, data: dict) -> dict:
        note = await self._owned_note(data.get("noteId"), account_id)
        required = await self._policy_required()
        approval = await self._create_approval(
            account_id,
            note["id"],
            {
                "scope": "public",
                "status": "pending" if required else "approved",
                "canEdit": data.get("canEdit", True),
                "message": data.get("message"),
            },
        )
        published = False
        share_url = None
        if not required:
            published, share_url = await self._publish(note["id"])
        return {"approval": approval, "published": published, "shareUrl": share_url}

    # -- decisions --------------------------------------------------------

    async def _publish(self, note_id: int) -> tuple[bool, str | None]:
        for raw in await self._client.select(NOTES):
            record = normalize_record(raw)
            if record["id"] != note_id:
                continue
            share_id = record.get("shareEncryptedUrl") or _new_token()[:12]
            await self._client.update(
                f"{NOTES}:{note_id}",
                {"isShare": True, "shareEncryptedUrl": share_id},
            )
            return True, share_id
        return False, None

    async def decide(self, account_id: int, data: dict) -> dict:
        approval = await self.get(data.get("id"), account_id)
        status = str(data.get("status") or "approved")
        approved = status == "approved"
        patch = {
            "status": status,
            "decidedBy": account_id,
            "decidedAt": now(),
            "decisionNote": data.get("decisionNote"),
        }
        if approved and approval.get("scope") == "public":
            patch["adminApproved"] = True
        updated = await self.update(approval["id"], account_id, patch)
        if approved and approval.get("scope") == "internal":
            await self._grant_internal_share(
                approval["noteId"], approval.get("inviteeAccountId")
            )
        if approved and approval.get("scope") == "public":
            await self._publish(approval["noteId"])
        return updated

    async def accept_invite(self, account_id: int, token: str) -> dict:
        for row in await self.all():
            if row.get("token") != token:
                continue
            expires = row.get("expiresAt")
            if isinstance(expires, datetime) and expires < datetime.now(UTC):
                raise DomainError("BAD_REQUEST", "Invite expired")
            updated = await self.update(
                row["id"],
                row.get("accountId"),
                {
                    "status": "approved",
                    "inviteeAccountId": account_id,
                    "decidedBy": account_id,
                    "decidedAt": now(),
                },
            )
            await self._grant_internal_share(row["noteId"], account_id)
            return updated
        raise DomainError("NOT_FOUND", "Invite not found")

    async def revoke(self, account_id: int, approval_id: Any) -> dict:
        approval = await self.get(approval_id, account_id)
        return await self.update(
            approval["id"], account_id, {"status": "revoked", "decidedAt": now()}
        )

    async def _grant_internal_share(self, note_id: Any, invitee: Any) -> None:
        target_note = normalize_id(note_id)
        target_account = normalize_id(invitee)
        if target_note is None or target_account is None:
            return
        for row in await self._client.select("noteInternalShare"):
            if (
                normalize_id(row.get("noteId")) == target_note
                and normalize_id(row.get("accountId")) == target_account
            ):
                return
        new_id = await next_id(self._client, "noteInternalShare")
        await self._client.create(
            f"noteInternalShare:{new_id}",
            {"noteId": target_note, "accountId": target_account, "canEdit": True},
        )
