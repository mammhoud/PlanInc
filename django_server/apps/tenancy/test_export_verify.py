"""Tests for uploads indexing (export) and attachment verification."""

import json
import sqlite3

from django.core.management import CommandError, call_command
from django.test import TestCase


def _write_source(path):
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE notes (id TEXT, content TEXT)")
    connection.execute(
        "INSERT INTO notes (id, content) VALUES ('n1', 'hello')"
    )
    connection.commit()
    connection.close()


class ExportUploadsIndexTests(TestCase):
    def test_export_indexes_uploads_and_manifest_counts(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "planinc.db"
            _write_source(source)
            uploads = tmp_path / "uploads"
            (uploads / "docs").mkdir(parents=True)
            (uploads / "a.txt").write_bytes(b"alpha")
            (uploads / "docs" / "b.bin").write_bytes(b"beta-bytes")
            output = tmp_path / "export"

            call_command(
                "planinc_export_surreal",
                source=source,
                output=output,
                uploads_dir=uploads,
            )

            index = output / "uploads" / "index.jsonl"
            self.assertTrue(index.is_file())
            entries = [
                json.loads(line)
                for line in index.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(
                [entry["path"] for entry in entries],
                ["a.txt", "docs/b.bin"],
            )
            self.assertEqual(entries[0]["size"], len(b"alpha"))
            manifest = json.loads(
                (output / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                manifest["files"],
                {"count": 2, "bytes": len(b"alpha") + len(b"beta-bytes")},
            )
            checksums = (output / "checksums" / "sha256sums").read_text(
                encoding="utf-8"
            )
            self.assertIn("uploads/index.jsonl", checksums)

    def test_export_without_uploads_dir_writes_empty_index(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "planinc.db"
            _write_source(source)
            output = tmp_path / "export"

            call_command(
                "planinc_export_surreal", source=source, output=output
            )

            index = output / "uploads" / "index.jsonl"
            self.assertTrue(index.is_file())
            self.assertEqual(index.read_text(encoding="utf-8"), "")
            manifest = json.loads(
                (output / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["files"], {"count": 0, "bytes": 0})


class VerifyUploadsTests(TestCase):
    def _export(self, tmp_path, with_uploads=True):
        import pathlib

        tmp_path = pathlib.Path(tmp_path)
        source = tmp_path / "planinc.db"
        _write_source(source)
        uploads = tmp_path / "uploads"
        (uploads).mkdir()
        (uploads / "a.txt").write_bytes(b"alpha")
        output = tmp_path / "export"
        kwargs = {"source": source, "output": output}
        if with_uploads:
            kwargs["uploads_dir"] = uploads
        call_command("planinc_export_surreal", **kwargs)
        return output, uploads

    def test_verify_passes_with_matching_uploads_root(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            output, uploads = self._export(tmp)
            report_path = Path(tmp) / "report.json"
            call_command(
                "planinc_verify_import",
                input=output,
                tenant="demo",
                report=report_path,
                uploads_root=uploads,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "verified")
            self.assertEqual(report["attachments"]["indexed"], 1)
            self.assertEqual(report["attachments"]["checked"], 1)
            self.assertTrue(report["attachments"]["bytes_checked"])
            self.assertEqual(report["failures"], [])

    def test_verify_without_uploads_root_skips_byte_checks(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            output, _uploads = self._export(tmp)
            report_path = Path(tmp) / "report.json"
            call_command(
                "planinc_verify_import",
                input=output,
                tenant="demo",
                report=report_path,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "verified")
            self.assertFalse(report["attachments"]["bytes_checked"])
            self.assertEqual(report["attachments"]["checked"], 0)

    def test_verify_fails_on_tampered_upload_bytes(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            output, uploads = self._export(tmp)
            (uploads / "a.txt").write_bytes(b"tampered-content")
            report_path = Path(tmp) / "report.json"
            with self.assertRaises(CommandError):
                call_command(
                    "planinc_verify_import",
                    input=output,
                    tenant="demo",
                    report=report_path,
                    uploads_root=uploads,
                )
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "failed")
            errors = {
                failure["path"]: failure["error"]
                for failure in report["failures"]
            }
            self.assertIn("a.txt", errors)
            self.assertIn(
                errors["a.txt"], ("size_mismatch", "checksum_mismatch")
            )

    def test_verify_fails_on_missing_upload_file(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            output, uploads = self._export(tmp)
            (uploads / "a.txt").unlink()
            report_path = Path(tmp) / "report.json"
            with self.assertRaises(CommandError):
                call_command(
                    "planinc_verify_import",
                    input=output,
                    tenant="demo",
                    report=report_path,
                    uploads_root=uploads,
                )
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertEqual(
                [
                    failure
                    for failure in report["failures"]
                    if failure["path"] == "a.txt"
                ][0]["error"],
                "missing",
            )


class ImportDryRunUploadsTests(TestCase):
    def test_dry_run_rejects_export_missing_uploads_index(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "planinc.db"
            _write_source(source)
            output = tmp_path / "export"
            call_command(
                "planinc_export_surreal", source=source, output=output
            )
            (output / "uploads" / "index.jsonl").unlink()
            with self.assertRaises(CommandError):
                call_command(
                    "planinc_import_surreal",
                    input=output,
                    tenant="demo",
                    checkpoint=tmp_path / "checkpoint.json",
                    dry_run=True,
                )

    def test_dry_run_checkpoint_records_indexed_files(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "planinc.db"
            _write_source(source)
            uploads = tmp_path / "uploads"
            uploads.mkdir()
            (uploads / "a.txt").write_bytes(b"alpha")
            output = tmp_path / "export"
            call_command(
                "planinc_export_surreal",
                source=source,
                output=output,
                uploads_dir=uploads,
            )
            checkpoint_path = tmp_path / "checkpoint.json"
            call_command(
                "planinc_import_surreal",
                input=output,
                tenant="demo",
                checkpoint=checkpoint_path,
                dry_run=True,
            )
            checkpoint = json.loads(
                checkpoint_path.read_text(encoding="utf-8")
            )
            self.assertEqual(checkpoint["indexed_files"], 1)
            self.assertEqual(
                checkpoint["files"], {"count": 1, "bytes": len(b"alpha")}
            )
