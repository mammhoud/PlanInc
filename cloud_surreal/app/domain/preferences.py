"""Config, notification, analytics, branding, and font services (slice S5).

``config`` rows are keyed by ``userId`` rather than ``accountId`` (matching the
TS ``config`` table), so :class:`ConfigService` is account-scoped by hand.
Analytics derives counts from notes in Python; branding stores its logo in the
config table. File- and AI-backed procedures (font upload, image search, logo
generation) are deferred to S4/Phase 4.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Any

from .errors import DomainError
from .store import AccountStore, normalize_record
from .users import normalize_id

CONFIG = "config"
DAILY_WINDOW_DAYS = 365


class ConfigService:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def _rows(self) -> list[dict]:
        return [normalize_record(row) for row in await self._client.select(CONFIG)]

    async def list(self, account_id: int) -> list[dict]:
        rows = [row for row in await self._rows() if row.get("userId") == account_id]
        return [self._flatten(row) for row in rows]

    async def get(self, account_id: int, key: str) -> Any:
        for row in await self._rows():
            if row.get("userId") == account_id and row.get("key") == key:
                return (row.get("config") or {}).get("value")
        return None

    async def update(self, account_id: int, key: str, value: Any) -> dict:
        if not key:
            raise DomainError("BAD_REQUEST", "key is required")
        for row in await self._rows():
            if row.get("userId") == account_id and row.get("key") == key:
                await self._client.update(
                    f"{CONFIG}:{row['id']}", {"config": {"value": value}}
                )
                return {"key": key, "value": value}
        from ..db.ids import next_id

        new_id = await next_id(self._client, CONFIG)
        await self._client.create(
            f"{CONFIG}:{new_id}",
            {"key": key, "config": {"value": value}, "userId": account_id},
        )
        return {"key": key, "value": value}

    async def value_for_key(self, key: str) -> Any:
        """Read a global (admin-scoped) config value by key alone.

        Mirrors ``getGlobalConfig({ useAdmin: true })``: the key is global rather
        than per-user, so the owning row is found by ``key`` instead of by
        ``userId``. ``UserService.config_value`` does the same lookup for the
        identity keys.
        """
        for row in await self._rows():
            if row.get("key") == key:
                config = row.get("config") or {}
                if isinstance(config, dict):
                    return config.get("value")
                return config
        return None

    async def set_plugin_config(
        self, account_id: int, plugin_id: str, value: Any
    ) -> dict:
        return await self.update(account_id, f"pluginConfig:{plugin_id}", value)

    async def get_plugin_config(self, account_id: int, plugin_id: str) -> Any:
        return await self.get(account_id, f"pluginConfig:{plugin_id}")

    async def ai_config(self) -> dict:
        keys = (
            "aiProvider",
            "aiModel",
            "aiBaseURL",
            "embeddingProvider",
            "embeddingModel",
            "aiPostProcessing",
        )
        return {key: await self.get(0, key) for key in keys}

    @staticmethod
    def _flatten(row: dict) -> dict:
        return {
            "key": row.get("key"),
            "value": (row.get("config") or {}).get("value"),
        }


class NotificationService(AccountStore):
    def __init__(self, client: Any) -> None:
        super().__init__(client, "notifications")

    async def list_notifications(self, account_id: int) -> list[dict]:
        rows = await self.scoped(account_id)
        rows.sort(key=lambda row: str(row.get("createdAt") or ""), reverse=True)
        return rows

    async def unread_count(self, account_id: int) -> int:
        return sum(
            1 for row in await self.scoped(account_id) if not row.get("isRead")
        )

    async def mark_as_read(self, account_id: int, notification_id: Any) -> dict:
        return await self.update(notification_id, account_id, {"isRead": True})

    async def create_notification(self, account_id: int, data: dict) -> dict:
        return await self.create(
            account_id,
            {
                "title": data.get("title") or "",
                "content": data.get("content") or "",
                "type": data.get("type") or "info",
                "isRead": False,
            },
        )


class AnalyticsService:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def _notes(self, account_id: int) -> list[dict]:
        return [
            normalize_record(row)
            for row in await self._client.select("notes")
            if normalize_id(row.get("accountId")) == account_id
        ]

    async def daily_note_count(self, account_id: int) -> list[dict]:
        per_day: dict[str, int] = {}
        for note in await self._notes(account_id):
            day = _day(note.get("createdAt"))
            if day:
                per_day[day] = per_day.get(day, 0) + 1
        return [{"date": day, "count": per_day[day]} for day in sorted(per_day)]

    async def monthly_stats(self, account_id: int, month: str | None = None) -> dict:
        month = month or datetime.now(UTC).strftime("%Y-%m")
        per_day: dict[str, int] = {}
        note_count = 0
        for note in await self._notes(account_id):
            day = _day(note.get("createdAt"))
            if not day or not day.startswith(month):
                continue
            note_count += 1
            per_day[day] = per_day.get(day, 0) + len(str(note.get("content") or ""))
        tag_stats = await self._tag_stats(account_id, month)
        return {
            "noteCount": note_count,
            "totalWords": sum(per_day.values()),
            "maxDailyWords": max(per_day.values()) if per_day else 0,
            "activeDays": len(per_day),
            "tagStats": tag_stats,
        }

    async def insights(self, account_id: int, month: str | None = None) -> dict:
        return {
            "daily": await self.daily_note_count(account_id),
            "monthly": await self.monthly_stats(account_id, month),
        }

    async def _tag_stats(
        self, account_id: int, month: str, top: int = 10
    ) -> list[dict]:
        note_ids = {
            note["id"]
            for note in await self._notes(account_id)
            if (_day(note.get("createdAt")) or "").startswith(month)
        }
        if not note_ids:
            return []
        names = {
            normalize_id(tag.get("id")): str(tag.get("name") or "")
            for tag in await self._client.select("tag")
            if normalize_id(tag.get("accountId")) == account_id
        }
        counts: dict[int, int] = {}
        for link in await self._client.select("tagsToNote"):
            if normalize_id(link.get("noteId")) in note_ids:
                tag_id = normalize_id(link.get("tagId"))
                counts[tag_id] = counts.get(tag_id, 0) + 1
        ranked = sorted(counts.items(), key=lambda pair: pair[1], reverse=True)
        result = [
            {"tagName": names.get(tag_id, str(tag_id)), "count": count}
            for tag_id, count in ranked[:top]
        ]
        others = sum(count for _, count in ranked[top:])
        if others:
            result.append({"tagName": "Others", "count": others})
        return result


class BrandingService:
    def __init__(self, config: ConfigService) -> None:
        self._config = config

    async def get(self, account_id: int) -> dict:
        return {"logo": await self._config.get(account_id, "logo")}

    async def set_logo(self, account_id: int, url: str) -> dict:
        await self._config.update(account_id, "logo", url)
        return {"logo": url}


class FontService:
    def __init__(self, client: Any) -> None:
        self._client = client

    async def list_fonts(self) -> list[dict]:
        return [normalize_record(row) for row in await self._client.select("fonts")]

    async def get_by_name(self, name: str) -> dict | None:
        for row in await self.list_fonts():
            if row.get("name") == name:
                return row
        return None

    async def get_font_data(self, name: str) -> dict:
        """Return the raw font bytes for ``name`` as base64.

        The TS router stores ``fileData`` as a binary column and base64-encodes it
        on the way out; the same shape is returned here so the client's
        ``atob``/``ArrayBuffer`` decode keeps working. A missing font is not an
        error — the contract is ``{name, fileData: null}``.
        """
        font = await self.get_by_name(name)
        if font is None:
            return {"name": name, "fileData": None}
        raw = font.get("fileData")
        if raw is None:
            return {"name": font.get("name", name), "fileData": None}
        if isinstance(raw, str):
            data = raw.encode("utf-8")
        elif isinstance(raw, (bytes, bytearray)):
            data = bytes(raw)
        else:
            data = str(raw).encode("utf-8")
        encoded = base64.b64encode(data).decode()
        return {"name": font.get("name", name), "fileData": encoded}


def _day(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC).strftime("%Y-%m-%d")
    if isinstance(value, str) and len(value) >= 10:
        return value[:10]
    return None
