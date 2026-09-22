import hashlib
import json
import sqlite3
from datetime import datetime, timezone
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
            "exported_at": datetime.now(timezone.utc).isoformat(),
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
                                        (_safe_value(row[index]) for index in kept_indexes),
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

        (output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (checksums_dir / "sha256sums").write_text(
            "\n".join(checksums) + ("\n" if checksums else ""),
            encoding="utf-8",
        )
        self.stdout.write(self.style.SUCCESS(f"Exported {len(manifest['records'])} tables."))
