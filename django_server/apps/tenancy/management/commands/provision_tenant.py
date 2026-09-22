from django.core.management.base import BaseCommand, CommandError

from apps.tenancy.models import Tenant
from apps.tenancy.services import provision_tenant


class Command(BaseCommand):
    help = "Create or reconcile a PlanInc tenant registry entry."

    def add_arguments(self, parser):
        parser.add_argument("slug")
        parser.add_argument("--name", required=True)
        parser.add_argument("--hostname")

    def handle(self, *args, **options):
        slug = options["slug"]
        try:
            tenant = provision_tenant(
                slug=slug,
                name=options["name"],
                hostname=options["hostname"],
            )
        except Exception as exc:
            raise CommandError(f"Tenant provisioning failed: {exc}") from exc
        self.stdout.write(
            self.style.SUCCESS(
                f"Tenant {tenant.slug} is ready ({tenant.schema_name})."
            )
        )
