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
        parser.add_argument(
            "--uploads-root",
            required=False,
            type=Path,
            default=None,
            help="Optional source uploads directory whose bytes are checked "
            "against uploads/index.jsonl (existence, size, sha256).",
        )

    def handle(self, *args, **options):
        root = options["input"]
        manifest_path = root / "manifest.json"
        checksum_path = root / "checksums" / "sha256sums"
        if not manifest_path.is_file() or not checksum_path.is_file():
            raise CommandError(
                "Export is missing manifest.json or checksums/sha256sums."
            )

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
                    {
                        "path": relative,
                        "error": "checksum_mismatch",
                        "expected": expected,
                    }
                )

        report = {
            "tenant": options["tenant"],
            "format": manifest.get("format"),
            "checked_files": checked,
            "failures": failures,
            "attachments": self._verify_uploads(
                root, manifest, options["uploads_root"], failures
            ),
            "status": "failed" if failures else "verified",
        }
        report_path = options["report"]
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        if failures:
            raise CommandError(f"Export verification failed; see {report_path}")
        self.stdout.write(
            self.style.SUCCESS(
                f"Verified export for tenant {options['tenant']}."
            )
        )

    @staticmethod
    def _verify_uploads(root, manifest, uploads_root, failures):
        """Verify ``uploads/index.jsonl`` and, when given a root, its bytes.

        Returns the ``attachments`` report section with the indexed file
        count, total bytes, how many byte-checks ran, and whether the bytes
        were checked at all. Byte failures reuse the shared ``failures``
        list so the top-level status flips to ``failed``.
        """
        index_path = root / "uploads" / "index.jsonl"
        if not index_path.is_file():
            failures.append(
                {"path": "uploads/index.jsonl", "error": "missing"}
            )
            return {
                "indexed": 0,
                "bytes": 0,
                "checked": 0,
                "bytes_checked": False,
            }

        entries = [
            json.loads(line)
            for line in index_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        summary = {
            "indexed": len(entries),
            "bytes": sum(entry.get("size", 0) for entry in entries),
            "checked": 0,
            "bytes_checked": uploads_root is not None,
        }
        expected = manifest.get("files", {})
        if expected and (
            expected.get("count") != summary["indexed"]
            or expected.get("bytes") != summary["bytes"]
        ):
            failures.append(
                {
                    "path": "uploads/index.jsonl",
                    "error": "manifest_mismatch",
                    "expected": expected,
                    "actual": {
                        "count": summary["indexed"],
                        "bytes": summary["bytes"],
                    },
                }
            )
        if uploads_root is None:
            return summary

        for entry in entries:
            relative = entry.get("path", "")
            # Reject absolute paths and parent escapes: the index must only
            # name files inside the uploads root.
            if (
                not relative
                or relative.startswith("/")
                or ".." in relative.split("/")
            ):
                failures.append({"path": relative, "error": "unsafe_path"})
                continue
            path = uploads_root / relative
            if not path.is_file():
                failures.append({"path": relative, "error": "missing"})
                continue
            data = path.read_bytes()
            summary["checked"] += 1
            if len(data) != entry.get("size"):
                failures.append({"path": relative, "error": "size_mismatch"})
                continue
            if hashlib.sha256(data).hexdigest() != entry.get("sha256"):
                failures.append(
                    {"path": relative, "error": "checksum_mismatch"}
                )
        return summary
