"""Publish due outbox events as TS-ingest deliverables (Postgres→Surreal leg).

Each line of the output JSONL is one deliverable::

    {"idempotency_key": ..., "tenant": ..., "event_type": ...,
     "aggregate_type": ..., "aggregate_id": ..., "payload": {...},
     "tombstone": false, "available_at": ...}

Delete events map to ``tombstone: true`` (formint-cloud tombstones.py
pattern) so the Surreal side deletes instead of upserting. Published rows
are stamped unless ``--dry-run``. Delivery to ``POST /api/sync/ingest``
(see docs/03-runtime-http-api.md sync contract) is a separate transport
step; this command is the durable, replayable source of truth.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.operations.models import OutboxEvent


class Command(BaseCommand):
    help = "Write due outbox events to a JSONL deliverable file."

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True, type=Path)
        parser.add_argument("--tenant", required=False, default=None)
        parser.add_argument("--limit", required=False, type=int, default=500)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        limit = options["limit"]
        if limit < 1 or limit > 5000:
            raise CommandError("Limit must be within 1..5000.")
        queryset = OutboxEvent.objects.filter(
            published_at__isnull=True,
            available_at__lte=timezone.now(),
        ).order_by("available_at", "id")
        if options["tenant"]:
            queryset = queryset.filter(tenant__slug=options["tenant"])
        events = list(queryset[:limit])

        output = options["output"]
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8") as handle:
            for event in events:
                handle.write(
                    json.dumps(
                        {
                            "idempotency_key": event.idempotency_key,
                            "tenant": event.tenant.slug,
                            "event_type": event.event_type,
                            "aggregate_type": event.aggregate_type,
                            "aggregate_id": event.aggregate_id,
                            "payload": event.payload,
                            "tombstone": event.event_type.endswith(".deleted"),
                            "available_at": event.available_at.isoformat(),
                        }
                    )
                    + "\n"
                )
        if not options["dry_run"]:
            now = timezone.now()
            with transaction.atomic():
                OutboxEvent.objects.filter(pk__in=[e.pk for e in events]).update(
                    published_at=now
                )
        self.stdout.write(
            self.style.SUCCESS(
                f"Published {len(events)} outbox events"
                f"{' (dry run)' if options['dry_run'] else ''}."
            )
        )
