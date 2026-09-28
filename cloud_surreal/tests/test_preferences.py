import asyncio
import json
from datetime import UTC, datetime

from robyn import TestClient as RobynTestClient

from app.auth.jwt import issue_api_token
from app.config import Settings
from app.domain.preferences import (
    AnalyticsService,
    BrandingService,
    ConfigService,
    FontService,
    NotificationService,
)
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "prefs-secret-that-is-long-enough!!"
SETTINGS = Settings(
    db_file="/tmp/prefs.db",
    db_ns="planinc",
    db_name="planinc",
    jwt_secret=SECRET,
    port=1111,
)
ACCOUNT = 1


def _run(coro):
    return asyncio.run(coro)


# -- services ---------------------------------------------------------------


def test_config_update_creates_then_updates_and_scopes():
    db = FakeDb()
    service = ConfigService(db)
    _run(service.update(ACCOUNT, "theme", "dark"))
    _run(service.update(ACCOUNT, "theme", "light"))
    _run(service.update(2, "theme", "other"))

    mine = _run(service.list(ACCOUNT))
    assert mine == [{"key": "theme", "value": "light"}]
    assert len(db.tables["config"]) == 2


def test_config_plugin_and_ai_config():
    service = ConfigService(FakeDb())
    _run(service.set_plugin_config(ACCOUNT, "demo", {"on": True}))
    assert _run(service.get_plugin_config(ACCOUNT, "demo")) == {"on": True}
    assert set(_run(service.ai_config())) >= {"aiProvider", "aiModel"}


def test_notification_lifecycle():
    service = NotificationService(FakeDb())
    created = _run(service.create_notification(ACCOUNT, {"title": "hi"}))
    assert _run(service.unread_count(ACCOUNT)) == 1
    _run(service.mark_as_read(ACCOUNT, created["id"]))
    assert _run(service.unread_count(ACCOUNT)) == 0
    _run(service.delete(created["id"], ACCOUNT))
    assert _run(service.list_notifications(ACCOUNT)) == []


def _at(day: int) -> datetime:
    return datetime(2026, 5, day, tzinfo=UTC)


def test_analytics_counts_and_insights():
    db = FakeDb()
    db.seed("notes", 1, {"accountId": ACCOUNT, "content": "abcd", "createdAt": _at(2)})
    db.seed("notes", 2, {"accountId": ACCOUNT, "content": "ef", "createdAt": _at(2)})
    db.seed("notes", 3, {"accountId": ACCOUNT, "content": "x", "createdAt": _at(3)})
    db.seed("notes", 9, {"accountId": 2, "content": "theirs", "createdAt": _at(2)})
    db.seed("tag", 1, {"accountId": ACCOUNT, "name": "work"})
    db.seed("tagsToNote", 1, {"noteId": 1, "tagId": 1})
    db.seed("tagsToNote", 2, {"noteId": 2, "tagId": 1})

    service = AnalyticsService(db)
    daily = _run(service.daily_note_count(ACCOUNT))
    assert daily == [
        {"date": "2026-05-02", "count": 2},
        {"date": "2026-05-03", "count": 1},
    ]

    monthly = _run(service.monthly_stats(ACCOUNT, "2026-05"))
    assert monthly["noteCount"] == 3
    assert monthly["totalWords"] == 7
    assert monthly["maxDailyWords"] == 6
    assert monthly["activeDays"] == 2
    assert monthly["tagStats"] == [{"tagName": "work", "count": 2}]

    insights = _run(service.insights(ACCOUNT, "2026-05"))
    assert insights["daily"] == daily
    assert insights["monthly"] == monthly


def test_branding_and_fonts():
    config = ConfigService(FakeDb())
    branding = BrandingService(config)
    assert _run(branding.get(ACCOUNT)) == {"logo": None}
    assert _run(branding.set_logo(ACCOUNT, "logo.png")) == {"logo": "logo.png"}

    db = FakeDb()
    db.seed("fonts", 1, {"name": "Inter", "url": "inter.woff2"})
    fonts = FontService(db)
    assert [f["name"] for f in _run(fonts.list_fonts())] == ["Inter"]
    assert _run(fonts.get_by_name("Inter"))["url"] == "inter.woff2"


# -- routes -----------------------------------------------------------------


def _client() -> RobynTestClient:
    services = AppServices.from_client(FakeDb(), SECRET)
    app = create_app(SETTINGS, router=build_trpc_router(services), services=services)
    return RobynTestClient(app)


def _post(client, path: str, payload: dict, token: str | None = None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return client.post(f"/api/trpc/{path}", body=json.dumps(payload), headers=headers)


def _data(response):
    return json.loads(response.text)["result"]["data"]["json"]


def test_config_update_and_public_list():
    client = _client()
    token = issue_api_token(SECRET, ACCOUNT, "u", "user")

    public = _data(_post(client, "config.list", {"json": {}}))
    assert public == []

    _data(
        _post(
            client, "config.update", {"json": {"key": "theme", "value": "dark"}}, token
        )
    )
    listed = _data(_post(client, "config.list", {"json": {}}, token))
    assert listed == [{"key": "theme", "value": "dark"}]


def test_notification_and_branding_routes():
    client = _client()
    token = issue_api_token(SECRET, ACCOUNT, "u", "user")

    created = _data(
        _post(client, "notifications.create", {"json": {"title": "hi"}}, token)
    )
    assert _data(_post(client, "notifications.unreadCount", {"json": {}}, token)) == 1
    _data(
        _post(
            client,
            "notifications.markAsRead",
            {"json": {"id": created["id"]}},
            token,
        )
    )
    assert _data(_post(client, "notifications.unreadCount", {"json": {}}, token)) == 0

    _data(_post(client, "branding.setLogo", {"json": {"url": "l.png"}}, token))
    branding = _data(_post(client, "branding.get", {"json": {}}, token))
    assert branding == {"logo": "l.png"}


def test_analytics_route_requires_authentication():
    client = _client()
    response = _post(client, "analytics.dailyNoteCount", {"json": {}})
    assert json.loads(response.text)["error"]["json"]["data"]["code"] == "UNAUTHORIZED"
