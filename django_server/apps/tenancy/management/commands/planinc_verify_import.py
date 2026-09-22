import hashlib
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Verify a PlanInc export manifest and all record checksums."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True, type=Path)
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--report", required=True, type=Path)

    def handle(self, *args, **options):
        root = options["input"]
        manifest_path = root / "manifest.json"
        checksum_path = root / "checksums" / "sha256sums"
        if not manifest_path.is_file() or not checksum_path.is_file():
            raise CommandError("Export is missing manifest.json or checksums/sha256sums.")

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        failures = []
        checked = 0
        for line in checksum_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            expected, relative = line.split("  ", 1)
            path = root / relative
            if not path.is_file():
                failures.append({"path": relative, "error": "missing"})
                continue
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            checked += 1
            if actual != expected:
                failures.append(
                    {"path": relative, "error": "checksum_mismatch", "expected": expected}
                )

        report = {
            "tenant": options["tenant"],
            "format": manifest.get("format"),
            "checked_files": checked,
            "failures": failures,
            "status": "failed" if failures else "verified",
        }
        report_path = options["report"]
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        if failures:
            raise CommandError(f"Export verification failed; see {report_path}")
        self.stdout.write(self.style.SUCCESS(f"Verified export for tenant {options['tenant']}."))
