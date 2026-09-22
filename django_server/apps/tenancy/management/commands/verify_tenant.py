from django.core.management.base import BaseCommand, CommandError

from apps.tenancy.models import Tenant


class Command(BaseCommand):
    help = "Verify a PlanInc tenant registry entry."

    def add_arguments(self, parser):
        parser.add_argument("slug")

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.prefetch_related("domains").get(
                slug=options["slug"]
            )
        except Tenant.DoesNotExist as exc:
            raise CommandError("Tenant does not exist.") from exc
        status = "active" if tenant.is_active else "suspended"
        domains = ", ".join(domain.hostname for domain in tenant.domains.all()) or "none"
        self.stdout.write(
            f"{tenant.slug}: {status}; schema={tenant.schema_name}; domains={domains}"
        )
