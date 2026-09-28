import pytest

from app.auth.jwt import TokenClaims
from app.domain import policies
from app.domain.errors import DomainError


def _claims(role: str = "user") -> TokenClaims:
    return TokenClaims(sub="1", name="n", role=role, exp=9999999999, iat=1)


def test_require_authenticated_rejects_anonymous():
    with pytest.raises(DomainError) as err:
        policies.require_authenticated(None)
    assert err.value.code == "UNAUTHORIZED"


def test_require_superadmin_rejects_regular_user():
    with pytest.raises(DomainError) as err:
        policies.require_superadmin(_claims("user"))
    assert err.value.code == "FORBIDDEN"
    assert policies.require_superadmin(_claims("superadmin")).role == "superadmin"


def test_require_tenant_accepts_mapping_and_slug():
    assert policies.require_tenant({"slug": "acme"})["slug"] == "acme"
    assert policies.require_tenant("acme") == "acme"
    for missing in (None, "", {"slug": "  "}):
        with pytest.raises(DomainError):
            policies.require_tenant(missing)


def test_require_workspace_role_checks_role_and_status():
    assert policies.require_workspace_role({"role": "admin"}, ("admin", "owner"))
    with pytest.raises(DomainError) as err:
        policies.require_workspace_role({"role": "viewer"}, ("admin",))
    assert err.value.code == "FORBIDDEN"
    with pytest.raises(DomainError):
        policies.require_workspace_role({"role": "admin", "active": False}, ("admin",))
    with pytest.raises(DomainError):
        policies.require_workspace_role(None, ("admin",))
