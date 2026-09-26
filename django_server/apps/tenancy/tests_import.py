"""Tests for the Surreal→workspace importer (idempotent, LWW, reported)."""

import json

from django.core.management import call_command
from django.test import TestCase

from apps.notes.models import Note
from apps.workspaces.models import Workspace, WorkspaceMember

from .models import Membership, Tenant


def _write_export(root, accounts, notes):
    records = root / "records"
    records.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(
        json.dumps(
            {
                "format": "planinc-export-v1",
                "records": {"accounts": len(accounts), "notes": len(notes)},
            }
        ),
        encoding="utf-8",
    )
    with (records / "accounts.jsonl").open("w", encoding="utf-8") as handle:
        for row in accounts:
            handle.write(json.dumps(row) + "\n")
    with (records / "notes.jsonl").open("w", encoding="utf-8") as handle:
        for row in notes:
            handle.write(json.dumps(row) + "\n")


class ImportSurrealWorkspaceTests(TestCase):
    def setUp(self):
        call_command("provision_tenant", "demo", name="Demo")

    def test_import_creates_users_memberships_notes_and_report(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_export(
                root,
                accounts=[
                    {"id": 1, "name": "ada"},
                    {"id": 2, "name": ""},
                ],
                notes=[
                    {
                        "id": 10,
                        "accountId": 1,
                        "content": "# Shopping\n- milk",
                        "updatedAt": "2026-01-02T00:00:00Z",
                    },
                ],
            )
            report = root / "report.json"
            call_command(
                "import_surreal_workspace",
                input=root,
                tenant="demo",
                workspace="personal",
                report=report,
            )
            payload = json.loads(report.read_text(encoding="utf-8"))

        tenant = Tenant.objects.get(slug="demo")
        self.assertEqual(
            Membership.objects.filter(tenant=tenant).count(), 1
        )
        workspace = Workspace.objects.get(tenant=tenant, slug="personal")
        self.assertEqual(
            WorkspaceMember.objects.filter(workspace=workspace).count(), 1
        )
        note = Note.objects.get(tenant=tenant, external_id="surreal:notes:10")
        self.assertEqual(note.title, "Shopping")
        # Surreal accountId 1 (ada) maps to the Django author.
        self.assertEqual(note.author.username, "ada")
        self.assertEqual(payload["notes"]["created"], 1)
        self.assertEqual(len(payload["users"]["rejected"]), 1)

    def test_rerun_is_idempotent_and_respects_last_writer_wins(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_export(
                root,
                accounts=[{"id": 1, "name": "ada"}],
                notes=[
                    {
                        "id": 10,
                        "content": "v1",
                        "updatedAt": "2026-01-02T00:00:00Z",
                    },
                ],
            )
            call_command(
                "import_surreal_workspace",
                input=root,
                tenant="demo",
                workspace="personal",
            )
            # Same export again: everything stale, nothing duplicated.
            call_command(
                "import_surreal_workspace",
                input=root,
                tenant="demo",
                workspace="personal",
            )
            tenant = Tenant.objects.get(slug="demo")
            self.assertEqual(
                Note.objects.filter(tenant=tenant).count(), 1
            )
            # Newer export wins.
            _write_export(
                root,
                accounts=[{"id": 1, "name": "ada"}],
                notes=[
                    {
                        "id": 10,
                        "content": "v2",
                        "updatedAt": "2026-02-02T00:00:00Z",
                    },
                ],
            )
            call_command(
                "import_surreal_workspace",
                input=root,
                tenant="demo",
                workspace="personal",
            )
            note = Note.objects.get(
                tenant=tenant, external_id="surreal:notes:10"
            )
            self.assertEqual(note.body, "v2")

    def test_dry_run_writes_nothing(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_export(
                root,
                accounts=[{"id": 1, "name": "ada"}],
                notes=[{"id": 10, "content": "v1"}],
            )
            call_command(
                "import_surreal_workspace",
                input=root,
                tenant="demo",
                workspace="personal",
                dry_run=True,
            )
        tenant = Tenant.objects.get(slug="demo")
        self.assertEqual(Note.objects.filter(tenant=tenant).count(), 0)
        self.assertFalse(
            Workspace.objects.filter(tenant=tenant).exists()
        )
