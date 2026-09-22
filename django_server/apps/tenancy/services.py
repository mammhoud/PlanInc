from django.db import transaction

from .models import Domain, Tenant, TenantProvisioningEvent


def schema_name_for_slug(slug: str) -> str:
    return f"tenant_{slug}"


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
