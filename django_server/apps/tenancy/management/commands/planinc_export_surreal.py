import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

SENSITIVE_NAMES = ("password", "secret", "token", "api_key", "private_key")


def _safe_value(value):
    if isinstance(value, bytes):
        return value.hex()
    return value


def _is_sensitive(name):
    lowered = name.lower()
    return any(part in lowered for part in SENSITIVE_NAMES)


class Command(BaseCommand):
    help = "Export a SQLite-compatible PlanInc source into checksummed JSONL."

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True, type=Path)
        parser.add_argument("--output", required=True, type=Path)
        parser.add_argument("--checksum", choices=["sha256"], default="sha256")
        parser.add_argument(
            "--uploads-dir",
            required=False,
            type=Path,
            default=None,
            help="Optional source uploads directory to index into "
            "uploads/index.jsonl (relative path, size, sha256 per file).",
        )

    def handle(self, *args, **options):
        source = options["source"]
        output = options["output"]
        if not source.is_file():
            raise CommandError(f"Source database does not exist: {source}")

        records_dir = output / "records"
        checksums_dir = output / "checksums"
        records_dir.mkdir(parents=True, exist_ok=True)
        checksums_dir.mkdir(parents=True, exist_ok=True)

        manifest = {
            "format": "planinc-export-v1",
            "source": str(source),
            "exported_at": datetime.now(UTC).isoformat(),
            "records": {},
            "sensitive_fields_omitted": True,
        }
        checksums = []
        with sqlite3.connect(source) as connection:
            tables = connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%' "
                "ORDER BY name"
            ).fetchall()
            for (table,) in tables:
                all_columns = list(
                    connection.execute(f'PRAGMA table_info("{table}")')
                )
                kept_indexes = [
                    index
                    for index, column in enumerate(all_columns)
                    if not _is_sensitive(column[1])
                ]
                columns = [all_columns[index][1] for index in kept_indexes]
                rows = connection.execute(f'SELECT * FROM "{table}"').fetchall()
                path = records_dir / f"{table}.jsonl"
                with path.open("w", encoding="utf-8") as handle:
                    for row in rows:
                        handle.write(
                            json.dumps(
                                dict(
                                    zip(
                                        columns,
                                        (
                                            _safe_value(row[index])
                                            for index in kept_indexes
                                        ),
                                        strict=False,
                                    )
                                ),
                                sort_keys=True,
                                separators=(",", ":"),
                            )
                            + "\n"
                        )
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                checksums.append(f"{digest}  {path.relative_to(output)}")
                manifest["records"][table] = len(rows)

        manifest["files"] = self._index_uploads(
            output, options["uploads_dir"], checksums
        )

        (output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (checksums_dir / "sha256sums").write_text(
            "\n".join(checksums) + ("\n" if checksums else ""),
            encoding="utf-8",
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Exported {len(manifest['records'])} tables "
                f"and {manifest['files']['count']} files."
            )
        )

    @staticmethod
    def _index_uploads(output, uploads_dir, checksums):
        """Write ``uploads/index.jsonl`` and return the manifest summary.

        Each line records the file's source-relative POSIX path, byte size,
        and SHA-256 digest, so ``planinc_verify_import`` can prove the bytes
        survived the copy. Without ``--uploads-dir`` an empty (0-line) index
        is written so the export keeps the ``planinc-export-v1`` shape.
        """
        uploads_out = output / "uploads"
        uploads_out.mkdir(parents=True, exist_ok=True)
        index_path = uploads_out / "index.jsonl"

        entries = []
        if uploads_dir is not None:
            if not uploads_dir.is_dir():
                raise CommandError(
                    f"Uploads directory does not exist: {uploads_dir}"
                )
            for path in sorted(
                p for p in uploads_dir.rglob("*") if p.is_file()
            ):
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                entries.append(
                    {
                        "path": path.relative_to(uploads_dir).as_posix(),
                        "size": path.stat().st_size,
                        "sha256": digest,
                    }
                )

        with index_path.open("w", encoding="utf-8") as handle:
            for entry in entries:
                handle.write(
                    json.dumps(entry, sort_keys=True, separators=(",", ":"))
                    + "\n"
                )
        digest = hashlib.sha256(index_path.read_bytes()).hexdigest()
        checksums.append(f"{digest}  {index_path.relative_to(output)}")
        return {
            "count": len(entries),
            "bytes": sum(entry["size"] for entry in entries),
        }
