class TenantAccessError(PermissionError):
    """Raised when a service is called without an explicit tenant scope."""


def require_tenant_scope(tenant):
    if tenant is None or not getattr(tenant, "is_active", False):
        raise TenantAccessError("An active tenant context is required.")
    return tenant


def require_same_tenant(*, tenant, resource):
    require_tenant_scope(tenant)
    if getattr(resource, "tenant_id", None) != tenant.pk:
        raise TenantAccessError("The resource is outside the tenant context.")
    return resource

