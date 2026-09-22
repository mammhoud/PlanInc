"""Framework-independent tenant resolution contract for the Django migration."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit


TENANT_SLUG = re.compile(r"^[a-z][a-z0-9-]{1,62}$")


class TenantResolutionError(ValueError):
    """Raised when a request cannot be mapped to exactly one tenant."""


@dataclass(frozen=True)
class TenantResolution:
    slug: str
    source: str


def validate_slug(slug: str) -> str:
    normalized = slug.strip().lower()
    if not TENANT_SLUG.fullmatch(normalized):
        raise TenantResolutionError("invalid tenant slug")
    return normalized


def normalize_host(host: str) -> str:
    value = host.strip().lower().rstrip(".")
    if not value or any(character.isspace() for character in value):
        raise TenantResolutionError("invalid tenant host")
    try:
        parsed = urlsplit(f"//{value}")
    except ValueError as exc:
        raise TenantResolutionError("invalid tenant host") from exc
    if parsed.hostname is None or parsed.port is not None:
        raise TenantResolutionError("invalid tenant host")
    return parsed.hostname


def resolve_tenant(
    *,
    host: str,
    tenant_header: str | None = None,
    environment: str = "production",
    base_domain: str = "notes.structa.cloud",
) -> TenantResolution:
    """Resolve a tenant from host first, with a restricted local header escape hatch."""

    normalized_host = normalize_host(host)
    normalized_base = normalize_host(base_domain)
    suffix = f".{normalized_base}"

    if normalized_host.endswith(suffix):
        slug = normalized_host[: -len(suffix)]
        if "." not in slug:
            return TenantResolution(validate_slug(slug), "hostname")

    if tenant_header is not None:
        if environment not in {"development", "test"}:
            raise TenantResolutionError("tenant header is not allowed in production")
        return TenantResolution(validate_slug(tenant_header), "header")

    raise TenantResolutionError("tenant could not be resolved from hostname")
