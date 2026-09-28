"""``public.*`` service (slice S5).

These procedures are unauthenticated reads the frontend calls on boot (site name
and avatar, which OAuth buttons to show, the version banner) plus a couple of
diagnostics. The network-backed ones are best-effort by contract: the TS router
returns an empty string or an empty list on failure rather than erroring, because
a GitHub or Docker Hub outage must not break page load. That behaviour is
preserved and each fetch is capped with a timeout and a size limit.

Tiny TTL cache: the TS router wraps these in ``cache.wrap`` with TTLs from 5
minutes to 12 hours. An in-process dict is enough for a single-node deployment
and keeps the fixed upstream request rate the same.

Deferred: ``musicMetadata`` (needs an audio tag parser plus a Spotify client) and
``branding.generateLogo`` / ``branding.searchImages`` (need an image provider).
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from .errors import DomainError

HUB_INDEX_URL = (
    "https://raw.githubusercontent.com/mammhoud/planinc-hub/refs/heads/main/index.json"
)
CLIENT_RELEASES_URL = "https://api.github.com/repos/mammhoud/planinc/releases/latest"
SERVER_TAGS_URL = "https://hub.docker.com/v2/repositories/mammhoud/planinc/tags"
PROXY_TEST_DEFAULT_URL = "https://www.google.com"

REQUEST_TIMEOUT = 10
PROXY_TIMEOUT = 20
MAX_RESPONSE_BYTES = 1024 * 1024

VERSION_TTL = 600.0
LINK_PREVIEW_TTL = 3600.0
HUB_TTL = 12 * 3600.0
SITE_INFO_TTL = 300.0


class TTLCache:
    """Minimal TTL cache; ``get`` returns a sentinel miss so ``None`` caches."""

    _MISS = object()

    def __init__(self) -> None:
        self._entries: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any:
        entry = self._entries.get(key)
        if entry is None:
            return self._MISS
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._entries.pop(key, None)
            return self._MISS
        return value

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._entries[key] = (time.monotonic() + ttl, value)

    def invalidate(self, prefix: str) -> None:
        for key in [k for k in self._entries if k.startswith(prefix)]:
            self._entries.pop(key, None)


class _LinkPreviewParser(HTMLParser):
    """Extract the title/favicon/description trio the client renders.

    Precedence follows ``unfurl``: OpenGraph/Twitter metadata wins over the plain
    document title and meta description, independent of the order the tags appear
    in (``<title>`` usually comes first).
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._og_title = ""
        self._doc_title = ""
        self._og_description = ""
        self._meta_description = ""
        self._og_image = ""
        self._icon = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): (value or "") for key, value in attrs}
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            prop = (values.get("property") or values.get("name") or "").lower()
            content = values.get("content") or ""
            if prop in ("og:title", "twitter:title") and not self._og_title:
                self._og_title = content
            elif prop in ("og:description", "twitter:description"):
                if not self._og_description:
                    self._og_description = content
            elif prop == "description" and not self._meta_description:
                self._meta_description = content
            elif prop in ("og:image", "twitter:image") and not self._og_image:
                self._og_image = content
        elif tag == "link":
            rel = (values.get("rel") or "").lower()
            if "icon" in rel and not self._icon:
                self._icon = values.get("href") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and not self._doc_title:
            self._doc_title = data.strip()

    def result(self) -> dict[str, str]:
        return {
            "title": self._og_title or self._doc_title,
            "favicon": self._og_image or self._icon,
            "description": self._og_description or self._meta_description,
        }


def _fetch_text(url: str, timeout: float = REQUEST_TIMEOUT) -> str:
    """Blocking GET returning decoded text (capped). Raises on failure."""
    import urllib.error
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": "PlanInc"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        raw = response.read(MAX_RESPONSE_BYTES)
    return raw.decode("utf-8", "replace")


def _probe_status(url: str) -> int:
    """Blocking GET returning only the status code (HTTP errors included)."""
    import urllib.error
    import urllib.request

    request = urllib.request.Request(url, headers={"User-Agent": "PlanInc"})
    try:
        with urllib.request.urlopen(request, timeout=PROXY_TIMEOUT) as response:  # noqa: S310
            response.read(1024)
            return int(response.status)
    except urllib.error.HTTPError as err:
        return int(err.code)


def _package_version(start: Path | None = None) -> str:
    """Read the nearest ``package.json`` version, as the TS ``serverVersion`` does.

    The TS server imports ``package.json`` directly. There is no equivalent at
    runtime here, so the file is located by walking up from the working directory
    (and from this module) until one is found — which covers both the container
    layout and a checkout.
    """
    roots = [start or Path.cwd(), Path(__file__).resolve().parent]
    seen: set[Path] = set()
    for root in roots:
        for directory in [root, *root.parents][:6]:
            candidate = directory / "package.json"
            if candidate in seen:
                continue
            seen.add(candidate)
            try:
                data = json.loads(candidate.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            version = data.get("version")
            if isinstance(version, str) and version:
                return version
    return ""


class PublicService:
    def __init__(self, client: Any, config_service: Any = None) -> None:
        self._client = client
        self._config = config_service
        self._cache = TTLCache()

    # -- versions ---------------------------------------------------------

    async def server_version(self) -> str:
        cached = self._cache.get("server-version")
        if cached is not TTLCache._MISS:
            return cached
        version = _package_version()
        self._cache.set("server-version", version, VERSION_TTL)
        return version

    async def latest_client_version(self) -> str:
        return await self._cached_version(
            "latest-client-version", CLIENT_RELEASES_URL, self._github_tag
        )

    async def latest_server_version(self) -> str:
        return await self._cached_version(
            "latest-server-version", SERVER_TAGS_URL, self._docker_hub_tag
        )

    async def _cached_version(self, key: str, url: str, extract) -> str:
        cached = self._cache.get(key)
        if cached is not TTLCache._MISS:
            return cached
        try:
            version = await asyncio.to_thread(extract, url)
        except Exception:  # noqa: BLE001 - an outage must not break page load
            version = ""
        self._cache.set(key, version, VERSION_TTL)
        return version

    @staticmethod
    def _github_tag(url: str) -> str:
        payload = json.loads(_fetch_text(url))
        tag = payload.get("tag_name") if isinstance(payload, dict) else None
        return str(tag).replace("v", "") if tag else ""

    @staticmethod
    def _docker_hub_tag(url: str) -> str:
        payload = json.loads(_fetch_text(url))
        results = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(results, list):
            return ""
        tags = [row for row in results if row.get("name") != "latest"]
        tags.sort(key=lambda row: str(row.get("last_updated") or ""), reverse=True)
        return str(tags[0]["name"]) if tags else ""

    # -- configuration reads ----------------------------------------------

    async def oauth_providers(self) -> list[dict]:
        providers = await self._config_value("oauth2Providers") or []
        listed = []
        for provider in providers:
            if not isinstance(provider, dict):
                continue
            listed.append(
                {
                    "id": provider.get("id"),
                    "name": provider.get("name"),
                    "icon": provider.get("icon"),
                }
            )
        return listed

    async def site_info(self, account_id: Any | None = None) -> dict:
        key = f"site-info:{account_id if account_id is not None else 'superadmin'}"
        cached = self._cache.get(key)
        if cached is not TTLCache._MISS:
            return cached
        accounts = [
            row
            for row in await self._client.select("accounts")
            if isinstance(row, dict)
        ]
        if account_id is None:
            chosen = next(
                (row for row in accounts if row.get("role") == "superadmin"), None
            )
        else:
            matched = _as_int(account_id)
            chosen = next(
                (row for row in accounts if _as_int(row.get("id")) == matched), None
            )
        if chosen is None:
            raise DomainError("NOT_FOUND", "Account not found")
        info = {
            "id": _as_int(chosen.get("id")),
            "name": chosen.get("nickname") or chosen.get("name") or "",
            "image": chosen.get("image") or "",
            "description": chosen.get("description") or "",
            "role": chosen.get("role")
            or ("superadmin" if account_id is None else "user"),
        }
        self._cache.set(key, info, SITE_INFO_TTL)
        return info

    async def hub_list(self) -> list[dict]:
        # The TS router returns a literal empty list; the real list is hubSiteList.
        return []

    async def hub_site_list(self, refresh: bool = False) -> list[dict]:
        if refresh:
            self._cache.invalidate("hub-site-list")
        cached = self._cache.get("hub-site-list")
        if cached is not TTLCache._MISS:
            return cached
        try:
            payload = json.loads(await asyncio.to_thread(_fetch_text, HUB_INDEX_URL))
            sites = payload.get("sites") if isinstance(payload, dict) else None
            result = sites if isinstance(sites, list) else []
        except Exception:  # noqa: BLE001 - hub is optional
            result = []
        self._cache.set("hub-site-list", result, HUB_TTL)
        return result

    # -- diagnostics ------------------------------------------------------

    async def link_preview(self, url: str) -> dict:
        cached = self._cache.get(f"link-preview:{url}")
        if cached is not TTLCache._MISS:
            return cached
        try:
            html = await asyncio.to_thread(_fetch_text, url)
            parser = _LinkPreviewParser()
            parser.feed(html)
            parser.close()
            result = parser.result()
            if result["favicon"] and not result["favicon"].startswith(
                ("http://", "https://", "data:")
            ):
                result["favicon"] = urljoin(url, result["favicon"])
        except Exception:  # noqa: BLE001 - unfurl failures degrade to empty fields
            result = {"title": "", "favicon": "", "description": ""}
        self._cache.set(f"link-preview:{url}", result, LINK_PREVIEW_TTL)
        return result

    async def test_http_proxy(self, url: str | None = None) -> dict:
        target = str(url or "").strip() or PROXY_TEST_DEFAULT_URL
        if not re.match(r"^https?://", target, re.IGNORECASE):
            raise DomainError("BAD_REQUEST", "url must be http(s)")
        started = time.monotonic()
        try:
            status = await asyncio.to_thread(_probe_status, target)
        except Exception as err:  # noqa: BLE001 - reported to the caller, not raised
            return {
                "success": False,
                "message": _proxy_error_message(err),
                "responseTime": -1,
                "error": str(err),
                "errorCode": getattr(err, "reason", None).__class__.__name__
                if getattr(err, "reason", None)
                else "",
                "errorDetails": {"url": target},
            }
        elapsed = int((time.monotonic() - started) * 1000)
        return {
            "success": 200 <= status < 400,
            "message": f"Successfully connected through proxy ({elapsed}ms)",
            "responseTime": elapsed,
            "statusCode": status,
        }

    async def _config_value(self, key: str) -> Any:
        if self._config is None:
            return None
        try:
            return await self._config.value_for_key(key)
        except DomainError:
            return None


def _as_int(value: Any) -> int | None:
    try:
        return int(str(value).rsplit(":", 1)[-1])
    except (TypeError, ValueError):
        return None


def _proxy_error_message(err: Exception) -> str:
    reason = getattr(err, "reason", None)
    name = reason.__class__.__name__ if reason is not None else err.__class__.__name__
    if "ConnectionRefused" in name:
        return (
            "Connection refused. Please check if the proxy server is running "
            "and accessible."
        )
    if "gaierror" in name or "NameResolution" in name:
        return "Proxy host not found. Please check your proxy host settings."
    if "timed out" in str(err).lower() or "Timeout" in name:
        return "Connection timed out. The proxy server took too long to respond."
    if "SSL" in name or "SSLError" in name:
        return "SSL/TLS protocol error. The proxy may not support secure connections."
    return "Failed to connect through proxy"
