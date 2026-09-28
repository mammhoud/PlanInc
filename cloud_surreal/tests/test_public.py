import asyncio
import base64
import json
from pathlib import Path

import pytest

from app.domain import public as public_module
from app.domain.errors import DomainError
from app.domain.preferences import ConfigService, FontService
from app.domain.public import PublicService, TTLCache, _package_version
from tests.fakes import FakeDb


@pytest.fixture()
def db() -> FakeDb:
    return FakeDb()


@pytest.fixture()
def service(db) -> PublicService:
    return PublicService(db, ConfigService(db))


def _code(exc_info) -> str:
    error = exc_info.value
    assert isinstance(error, DomainError)
    return error.code


# -- versions -------------------------------------------------------------


def test_server_version_reads_the_repo_package_json():
    assert _package_version()


def test_server_version_is_cached(monkeypatch, service):
    calls: list[Path | None] = []

    def fake(start=None):
        calls.append(start)
        return "9.9.9"

    monkeypatch.setattr(public_module, "_package_version", fake)
    assert asyncio.run(service.server_version()) == "9.9.9"
    assert asyncio.run(service.server_version()) == "9.9.9"
    assert len(calls) == 1


def test_latest_versions_degrade_to_empty_on_failure(monkeypatch, service):
    def boom(*_args, **_kwargs):
        raise OSError("network down")

    monkeypatch.setattr(public_module, "_fetch_text", boom)
    assert asyncio.run(service.latest_client_version()) == ""
    assert asyncio.run(service.latest_server_version()) == ""


def test_latest_client_version_parses_the_release_tag(monkeypatch, service):
    monkeypatch.setattr(
        public_module,
        "_fetch_text",
        lambda url, timeout=10: json.dumps({"tag_name": "v1.4.2"}),
    )
    assert asyncio.run(service.latest_client_version()) == "1.4.2"


def test_latest_server_version_picks_the_newest_non_latest_tag(monkeypatch, service):
    payload = {
        "results": [
            {"name": "latest", "last_updated": "2030-01-01T00:00:00Z"},
            {"name": "1.0.0", "last_updated": "2024-01-01T00:00:00Z"},
            {"name": "1.1.0", "last_updated": "2025-06-01T00:00:00Z"},
        ]
    }
    monkeypatch.setattr(
        public_module, "_fetch_text", lambda url, timeout=10: json.dumps(payload)
    )
    assert asyncio.run(service.latest_server_version()) == "1.1.0"


# -- config reads ---------------------------------------------------------


def test_oauth_providers_reads_the_global_config(db, service):
    db.seed(
        "config",
        1,
        {
            "key": "oauth2Providers",
            "config": {
                "value": [
                    {"id": "github", "name": "GitHub", "icon": "gh"},
                    {"id": "google", "name": "Google"},
                    "garbage",
                ]
            },
        },
    )
    assert asyncio.run(service.oauth_providers()) == [
        {"id": "github", "name": "GitHub", "icon": "gh"},
        {"id": "google", "name": "Google", "icon": None},
    ]


def test_oauth_providers_is_empty_without_config(service):
    assert asyncio.run(service.oauth_providers()) == []


def test_site_info_defaults_to_the_superadmin(db, service):
    db.seed("accounts", 1, {"name": "root", "nickname": "Root", "role": "superadmin"})
    db.seed("accounts", 2, {"name": "user", "role": "user"})
    info = asyncio.run(service.site_info())
    assert info["id"] == 1
    assert info["name"] == "Root"
    assert info["role"] == "superadmin"


def test_site_info_can_address_a_specific_account(db, service):
    db.seed("accounts", 1, {"name": "root", "role": "superadmin"})
    db.seed("accounts", 2, {"name": "bob", "role": "user"})
    info = asyncio.run(service.site_info(2))
    assert info["id"] == 2
    assert info["name"] == "bob"
    assert info["role"] == "user"


def test_site_info_raises_for_an_unknown_account(db, service):
    db.seed("accounts", 1, {"name": "root", "role": "superadmin"})
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.site_info(999))
    assert _code(exc_info) == "NOT_FOUND"


# -- hub ------------------------------------------------------------------


def test_hub_list_is_empty_like_the_ts_router(service):
    assert asyncio.run(service.hub_list()) == []


def test_hub_site_list_parses_sites_and_degrades_on_failure(monkeypatch, service):
    monkeypatch.setattr(
        public_module,
        "_fetch_text",
        lambda url, timeout=10: json.dumps({"sites": [{"title": "hub", "url": "u"}]}),
    )
    assert asyncio.run(service.hub_site_list()) == [{"title": "hub", "url": "u"}]

    service._cache.invalidate("hub-site-list")
    monkeypatch.setattr(public_module, "_fetch_text", lambda url, timeout=10: "{nope")
    assert asyncio.run(service.hub_site_list()) == []


def test_hub_site_list_refresh_bypasses_the_cache(monkeypatch, service):
    calls: list[str] = []

    def fake(url, timeout=10):
        calls.append(url)
        return json.dumps({"sites": []})

    monkeypatch.setattr(public_module, "_fetch_text", fake)
    asyncio.run(service.hub_site_list())
    asyncio.run(service.hub_site_list())
    assert len(calls) == 1

    asyncio.run(service.hub_site_list(refresh=True))
    assert len(calls) == 2


# -- link preview ---------------------------------------------------------

_HTML = """
<html><head>
  <title>Fallback title</title>
  <meta property="og:title" content="OG Title">
  <meta name="description" content="A description">
  <link rel="icon" href="/favicon.ico">
</head></html>
"""


def test_link_preview_extracts_and_resolves_fields(monkeypatch, service):
    monkeypatch.setattr(public_module, "_fetch_text", lambda url, timeout=10: _HTML)
    assert asyncio.run(service.link_preview("https://example.com/page")) == {
        "title": "OG Title",
        "favicon": "https://example.com/favicon.ico",
        "description": "A description",
    }


def test_link_preview_returns_empty_fields_on_failure(monkeypatch, service):
    def boom(url, timeout=10):
        raise OSError("unreachable")

    monkeypatch.setattr(public_module, "_fetch_text", boom)
    assert asyncio.run(service.link_preview("https://nope.test")) == {
        "title": "",
        "favicon": "",
        "description": "",
    }


def test_link_preview_degrades_when_only_the_title_is_present(monkeypatch, service):
    monkeypatch.setattr(
        public_module, "_fetch_text", lambda url, timeout=10: "<title>Only</title>"
    )
    preview = asyncio.run(service.link_preview("https://example.com"))
    assert preview == {"title": "Only", "favicon": "", "description": ""}


# -- proxy diagnostics ----------------------------------------------------


def test_test_http_proxy_rejects_non_http_urls(service):
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.test_http_proxy("file:///etc/passwd"))
    assert _code(exc_info) == "BAD_REQUEST"


def test_test_http_proxy_reports_success(monkeypatch, service):
    monkeypatch.setattr(public_module, "_probe_status", lambda url: 204)
    result = asyncio.run(service.test_http_proxy("https://example.com"))
    assert result["success"] is True
    assert result["statusCode"] == 204
    assert result["responseTime"] >= 0


def test_test_http_proxy_reports_failure_with_a_reason(monkeypatch, service):
    def boom(url):
        raise ConnectionRefusedError("nope")

    monkeypatch.setattr(public_module, "_probe_status", boom)
    result = asyncio.run(service.test_http_proxy())
    assert result["success"] is False
    assert result["responseTime"] == -1
    assert "refused" in result["message"].lower()
    assert result["errorDetails"] == {"url": public_module.PROXY_TEST_DEFAULT_URL}


def test_test_http_proxy_treats_4xx_as_connected_but_not_successful(
    monkeypatch, service
):
    monkeypatch.setattr(public_module, "_probe_status", lambda url: 404)
    result = asyncio.run(service.test_http_proxy("https://example.com"))
    assert result["success"] is False
    assert result["statusCode"] == 404


# -- cache ----------------------------------------------------------------


def test_ttl_cache_expires_and_invalidates():
    cache = TTLCache()
    cache.set("k", "v", 60)
    assert cache.get("k") == "v"
    assert cache.get("missing") is TTLCache._MISS

    cache.set("expired", "v", -1)
    assert cache.get("expired") is TTLCache._MISS

    cache.set("hub-site-list:x", 1, 60)
    cache.set("other", 2, 60)
    cache.invalidate("hub-site-list")
    assert cache.get("hub-site-list:x") is TTLCache._MISS
    assert cache.get("other") == 2


# -- fonts.getFontData ----------------------------------------------------


def test_font_data_is_base64_and_missing_fonts_are_null(db):
    fonts = FontService(db)
    db.seed("fonts", 1, {"name": "Inter", "fileData": b"\x00\x01font"})
    assert asyncio.run(fonts.get_font_data("Inter")) == {
        "name": "Inter",
        "fileData": base64.b64encode(b"\x00\x01font").decode(),
    }
    assert asyncio.run(fonts.get_font_data("Nope")) == {
        "name": "Nope",
        "fileData": None,
    }


def test_font_data_handles_a_font_without_bytes(db):
    fonts = FontService(db)
    db.seed("fonts", 1, {"name": "Inter"})
    assert asyncio.run(fonts.get_font_data("Inter")) == {
        "name": "Inter",
        "fileData": None,
    }
