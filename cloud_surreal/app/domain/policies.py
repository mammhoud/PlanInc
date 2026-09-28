"""Authorization policies.

The Django tenancy/workspace guard is preserved here as policy, not as an ORM:
``require_tenant`` and ``require_workspace_role`` are the same checks the
Django middleware and views applied, expressed as callable guards so every
service can enforce them uniformly.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from ..auth.jwt import TokenClaims
from .errors import DomainError


def require_authenticated(claims: TokenClaims | None) -> TokenClaims:
    if claims is None:
        raise DomainError("UNAUTHORIZED", "sign in required", 401)
    return claims


def current_account_id(claims: TokenClaims | None) -> int:
    """Resolve the caller's numeric account id from the JWT ``sub`` claim."""
    resolved = require_authenticated(claims)
    try:
        return int(resolved.sub)
    except (TypeError, ValueError) as exc:
        raise DomainError("UNAUTHORIZED", "invalid account subject", 401) from exc


def require_role(claims: TokenClaims | None, allowed: Iterable[str]) -> TokenClaims:
    resolved = require_authenticated(claims)
    if resolved.role not in set(allowed):
        raise DomainError("FORBIDDEN", "insufficient role", 403)
    return resolved


def require_superadmin(claims: TokenClaims | None) -> TokenClaims:
    return require_role(claims, ("superadmin",))


def require_tenant(tenant: Mapping[str, Any] | str | None) -> Any:
    """Reject a request with no resolvable tenant.

    Accepts a tenant mapping (with ``slug``) or a bare slug string, matching the
    values Django's ``middleware.tenant`` produced.
    """
    if tenant is None:
        raise DomainError("BAD_REQUEST", "tenant is required", 400)
    if isinstance(tenant, str):
        if not tenant.strip():
            raise DomainError("BAD_REQUEST", "tenant is required", 400)
        return tenant
    if not str(tenant.get("slug", "")).strip():
        raise DomainError("BAD_REQUEST", "tenant is required", 400)
    return tenant


def require_workspace_role(
    membership: Mapping[str, Any] | None, allowed: Iterable[str]
) -> Mapping[str, Any]:
    """Require an active membership with one of ``allowed`` workspace roles."""
    if membership is None:
        raise DomainError("FORBIDDEN", "workspace membership required", 403)
    if not membership.get("active", True):
        raise DomainError("FORBIDDEN", "workspace membership is suspended", 403)
    role = str(membership.get("role", ""))
    if role not in set(allowed):
        raise DomainError("FORBIDDEN", "workspace role not permitted", 403)
    return membership
