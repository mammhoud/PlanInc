from contextlib import contextmanager

from django.db import transaction

from .models import Domain, Tenant, TenantProvisioningEvent


def schema_name_for_slug(slug: str) -> str:
    return f"tenant_{slug}"


@contextmanager
def tenant_schema_context(tenant: Tenant):
    """Run work inside the database schema of one tenant (one space scope).

    SQLite rehearsal: schemas do not exist, so this is a documented no-op
    that still asserts the tenant is active — every call site is then
    rehearsal-ready. PostgreSQL cutover (board A4): replace the body with
    ``django_tenants.utils.schema_context(tenant.schema_name)`` so each
    space connects to its own tenant schema.
    """
    if tenant is None or not getattr(tenant, "is_active", False):
        raise ValueError("An active tenant is required for schema context.")
    yield tenant


@transaction.atomic
def provision_tenant(*, slug: str, name: str, hostname: str | None = None) -> Tenant:
    tenant, created = Tenant.objects.get_or_create(
        slug=slug,
        defaults={"name": name, "schema_name": schema_name_for_slug(slug)},
    )
    changed = False
    if tenant.name != name:
        tenant.name = name
        changed = True
    expected_schema = schema_name_for_slug(slug)
    if tenant.schema_name != expected_schema:
        tenant.schema_name = expected_schema
        changed = True
    if changed:
        tenant.save(update_fields=["name", "schema_name"])

    if hostname:
        Domain.objects.get_or_create(
            tenant=tenant,
            hostname=hostname.lower(),
            defaults={"is_primary": True},
        )
    if created:
        TenantProvisioningEvent.objects.create(
            tenant=tenant,
            event_type="created",
            details={"hostname": hostname},
        )
    return tenant
