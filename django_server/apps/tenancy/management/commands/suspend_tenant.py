from django.core.management.base import BaseCommand, CommandError

from apps.tenancy.models import Tenant, TenantProvisioningEvent


class Command(BaseCommand):
    help = "Suspend a PlanInc tenant without deleting its data."

    def add_arguments(self, parser):
        parser.add_argument("slug")

    def handle(self, *args, **options):
        try:
            tenant = Tenant.objects.get(slug=options["slug"])
        except Tenant.DoesNotExist as exc:
            raise CommandError("Tenant does not exist.") from exc
        if tenant.is_active:
            tenant.is_active = False
            tenant.save(update_fields=["is_active"])
            TenantProvisioningEvent.objects.create(
                tenant=tenant,
                event_type="suspended",
            )
        self.stdout.write(self.style.SUCCESS(f"Tenant {tenant.slug} is suspended."))
