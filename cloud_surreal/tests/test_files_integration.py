"""Real embedded-SurrealKV integration for the file routes (slice S4).

Drives upload → serve → zip archive → delete through Robyn's ``TestClient``
against the real datastore and a real upload root, then reopens the database in a
second process to prove the attachment rows persisted and the deleted bytes are
gone.

Isolated in a subprocess for the same reason as ``test_surreal_integration.py``:
the SDK's embedded connection can abort during interpreter shutdown (a Rust panic
after the data is committed), so pytest's exit stays clean while the test still
asserts on the subprocess stdout.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BOUNDARY = "----planincIntegration"

_SCRIPT = textwrap.dedent(
    '''
    import io, json, sys, zipfile
    from robyn import TestClient
    from app.auth.jwt import issue_api_token
    from app.config import Settings
    from app.db.surreal import SurrealClient
    from app.main import build_trpc_router, create_app
    from app.services import AppServices

    SECRET = "integration-secret-that-is-long-enough"
    BOUNDARY = "----planincIntegration"

    def upload_body(filename, content, folder=None):
        chunks = []
        if folder is not None:
            chunks.append((
                "--%s\\r\\n"
                'Content-Disposition: form-data; name="destinationFolder"\\r\\n\\r\\n'
                "%s\\r\\n" % (BOUNDARY, folder)
            ).encode())
        chunks.append((
            "--%s\\r\\n"
            'Content-Disposition: form-data; name="file"; filename="%s"\\r\\n'
            "Content-Type: text/plain\\r\\n\\r\\n" % (BOUNDARY, filename)
        ).encode() + content + b"\\r\\n")
        chunks.append(("--%s--\\r\\n" % BOUNDARY).encode())
        return b"".join(chunks)

    def multipart_headers(token):
        return {
            "content-type": "multipart/form-data; boundary=%s" % BOUNDARY,
            "authorization": "Bearer %s" % token,
        }

    def build(db_file, data_dir):
        settings = Settings(
            db_file=db_file, db_ns="planinc", db_name="planinc",
            jwt_secret=SECRET, port=1111, data_dir=data_dir,
        )
        client = SurrealClient(settings)
        services = AppServices.from_client(
            client, SECRET, upload_dir=settings.upload_dir
        )
        app = create_app(
            settings, router=build_trpc_router(services), services=services
        )
        return client, services, TestClient(app), settings

    def main():
        mode, db_file, data_dir = sys.argv[1], sys.argv[2], sys.argv[3]
        client, services, tclient, settings = build(db_file, data_dir)
        token = issue_api_token(SECRET, 1, "root", "superadmin")
        out = {"mode": mode}

        if mode == "write":
            upload = tclient.post(
                "/api/file/upload",
                body=upload_body("Quarterly Report.txt", b"hello world"),
                headers=multipart_headers(token),
            )
            out["upload_status"] = upload.status_code
            payload = json.loads(upload.text)
            out["file_path"] = payload["filePath"]
            out["file_name"] = payload["fileName"]

            served = tclient.get(payload["filePath"], headers={
                "authorization": "Bearer %s" % token
            })
            out["served"] = served.content.decode("utf-8")
            out["etag_present"] = bool(served.headers.get("etag"))

            second = tclient.post(
                "/api/file/upload",
                body=upload_body("b.txt", b"second", folder="docs"),
                headers=multipart_headers(token),
            )
            out["second_status"] = second.status_code
            out["second_path"] = json.loads(second.text)["filePath"]

            archive = tclient.post(
                "/api/file/archive",
                json_data={"attachmentIds": [], "folderPaths": ["docs"]},
                headers={"authorization": "Bearer %s" % token},
            )
            out["archive_status"] = archive.status_code
            with zipfile.ZipFile(io.BytesIO(archive.content)) as zf:
                out["archive_names"] = zf.namelist()
                out["archive_body"] = zf.read("docs/b.txt").decode()

            delete = tclient.post(
                "/api/file/delete",
                json_data={"attachment_path": payload["filePath"]},
                headers={"authorization": "Bearer %s" % token},
            )
            out["delete_status"] = delete.status_code

            loop = tclient._loop
            rows = loop.run_until_complete(services.attachments.list_for_account(1))
            out["rows"] = sorted(row["name"] for row in rows)
        else:
            loop = tclient._loop
            rows = loop.run_until_complete(services.attachments.list_for_account(1))
            out["rows"] = sorted(row["name"] for row in rows)
            out["every_attachment_has_an_id"] = all(
                isinstance(row["id"], int) and not isinstance(row["id"], bool)
                for row in rows
            )

        print(json.dumps(out), flush=True)

    main()
    '''
)


def _run(db_file: Path, data_dir: Path, mode: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", _SCRIPT, mode, str(db_file), str(data_dir)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )


def _last_json(stdout: str) -> dict:
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    raise AssertionError(f"no JSON payload in subprocess stdout:\n{stdout}")


def test_file_round_trip_against_embedded_surrealkv(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTHONPATH", str(PROJECT_ROOT))
    db_file = tmp_path / "files.db"
    data_dir = tmp_path / ".planinc"
    uploads = data_dir / "files"

    write = _run(db_file, data_dir, "write")
    payload = _last_json(write.stdout)

    assert payload["upload_status"] == 200
    assert payload["file_name"].endswith(".txt")
    assert payload["served"] == "hello world"
    assert payload["etag_present"] is True

    assert payload["second_status"] == 200
    assert payload["second_path"].startswith("/api/file/docs/")
    assert payload["archive_status"] == 200
    assert payload["archive_names"] == ["docs/b.txt"]
    assert payload["archive_body"] == "second"

    assert payload["delete_status"] == 200
    assert payload["rows"] == ["b.txt"]

    # The deleted file is gone from disk; the surviving one is still there.
    assert not list(uploads.glob("*.txt"))
    assert list((uploads / "docs").glob("*.txt"))

    read = _run(db_file, data_dir, "read")
    persisted = _last_json(read.stdout)
    assert persisted["rows"] == ["b.txt"]
    assert persisted["every_attachment_has_an_id"] is True
    assert db_file.exists()
