"""Import a Surreal export (planinc-export-v1) into one tenant workspace.

Surreal rows carry no tenant: every imported account becomes a Django user
with a Membership in the tenant, and every imported note lands in the target
workspace scope with a stable ``external_id`` (``surreal:<table>:<id>``).

Conflict rule (last-writer-wins): when ``external_id`` already exists, the
export row wins only if its ``updated_at`` is newer; otherwise it is counted
as stale and skipped. Re-runs are idempotent. Password hashes are never
imported — the export omits sensitive columns, and newcomers sign in via
OAuth (allauth) or a local reset.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.notes.models import Note
from apps.tenancy.models import Membership, Tenant
from apps.workspaces.models import Workspace, WorkspaceMember


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _title_of(content: str) -> str:
    for line in (content or "").splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:240]
    return "Untitled"


class Command(BaseCommand):
    help = "Import planinc-export-v1 records into a tenant workspace (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--input", required=True, type=Path)
        parser.add_argument("--tenant", required=True)
        parser.add_argument("--workspace", required=True)
        parser.add_argument("--report", required=False, type=Path, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        root = options["input"]
        manifest_path = root / "manifest.json"
        if not manifest_path.is_file():
            raise CommandError(f"Missing export manifest: {manifest_path}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("format") != "planinc-export-v1":
            raise CommandError("Unsupported PlanInc export format.")
        try:
            tenant = Tenant.objects.get(slug=options["tenant"], is_active=True)
        except Tenant.DoesNotExist:
            raise CommandError(f"Unknown or inactive tenant: {options['tenant']}")

        report = {
            "tenant": tenant.slug,
            "workspace": options["workspace"],
            "dry_run": bool(options["dry_run"]),
            "users": {"created": 0, "linked": 0, "rejected": []},
            "notes": {"created": 0, "updated": 0, "stale": 0, "rejected": []},
        }

        def load(table):
            path = root / "records" / f"{table}.jsonl"
            if not path.is_file():
                return []
            rows = []
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
            return rows

        accounts = load("accounts")
        notes = load("notes")

        user_by_key = {}
        for row in accounts:
            name = str(row.get("name") or "").strip()
            if not name:
                report["users"]["rejected"].append(
                    {"id": row.get("id"), "reason": "missing name"}
                )
                continue
            user_by_key[str(row.get("id"))] = name

        if options["dry_run"]:
            report["users"]["linked"] = len(user_by_key)
            report["notes"]["created"] = len(notes)
            self._write_report(options["report"], report)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Dry run: {len(user_by_key)} users, {len(notes)} notes "
                    f"would import into {tenant.slug}/{options['workspace']}."
                )
            )
            return

        with transaction.atomic():
            workspace, _ = Workspace.objects.get_or_create(
                tenant=tenant,
                slug=options["workspace"],
                defaults={"name": options["workspace"]},
            )
            user_model = get_user_model()
            users_by_name = {}
            for key, name in user_by_key.items():
                username = name[:150]
                user, created = user_model.objects.get_or_create(username=username)
                users_by_name[username] = user
                report["users"]["created" if created else "linked"] += 1
                Membership.objects.get_or_create(
                    tenant=tenant, user=user, defaults={"role": "member"}
                )
                WorkspaceMember.objects.get_or_create(
                    workspace=workspace, user=user, defaults={"role": "editor"}
                )

            for row in notes:
                content = row.get("content") or ""
                external_id = f"surreal:notes:{row.get('id')}"
                title = _title_of(content)[:240] or "Untitled"
                row_ts = _parse_dt(row.get("updatedAt") or row.get("updated_at"))
                author = users_by_name.get(
                    (user_by_key.get(str(row.get("accountId"))) or "")[:150]
                )
                existing = Note.objects.filter(
                    tenant=tenant, external_id=external_id
                ).first()
                if existing is None:
                    note = Note.objects.create(
                        tenant=tenant,
                        title=title,
                        body=content,
                        external_id=external_id,
                        author=author,
                    )
                    stamp = row_ts or note.updated_at
                    Note.objects.filter(pk=note.pk).update(updated_at=stamp)
                    report["notes"]["created"] += 1
                    continue
                if row_ts is not None and row_ts <= existing.updated_at:
                    report["notes"]["stale"] += 1
                    continue
                Note.objects.filter(pk=existing.pk).update(
                    title=title,
                    body=content,
                    updated_at=row_ts or existing.updated_at,
                )
                report["notes"]["updated"] += 1

        self._write_report(options["report"], report)
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported into {tenant.slug}/{workspace.slug}: "
                f"{report['users']['created']} users created, "
                f"{report['notes']['created']} notes created, "
                f"{report['notes']['updated']} updated, "
                f"{report['notes']['stale']} stale."
            )
        )

    def _write_report(self, path, report):
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
