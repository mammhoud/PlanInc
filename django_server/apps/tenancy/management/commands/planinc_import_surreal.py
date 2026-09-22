import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Validate an export and prepare a resumable tenant import checkpoint."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True, type=Path)
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--checkpoint", required=True, type=Path)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        if not options["dry_run"]:
            raise CommandError(
                "Native SurrealKV-to-Django mapping is not enabled yet. "
                "Use --dry-run to validate and checkpoint an export."
            )
        root = options["input"]
        manifest_path = root / "manifest.json"
        if not manifest_path.is_file():
            raise CommandError(f"Missing export manifest: {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("format") != "planinc-export-v1":
            raise CommandError("Unsupported PlanInc export format.")
        tables = manifest.get("records", {})
        checkpoint = {
            "tenant": options["tenant"],
            "format": manifest["format"],
            "dry_run": True,
            "completed_tables": sorted(tables),
            "record_counts": tables,
        }
        destination = options["checkpoint"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8")
        self.stdout.write(
            self.style.SUCCESS(
                f"Validated {len(tables)} tables for tenant {options['tenant']}."
            )
        )
