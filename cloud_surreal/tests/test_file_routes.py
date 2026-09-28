import asyncio
import io
import json
import zipfile

import pytest
from robyn import TestClient as RobynTestClient

from app.auth.jwt import issue_api_token
from app.config import Settings
from app.main import build_trpc_router, create_app
from app.services import AppServices
from tests.fakes import FakeDb

SECRET = "auth-secret-that-is-long-enough!!"
BOUNDARY = "----planincTestBoundary"


@pytest.fixture()
def app_env(tmp_path):
    root = tmp_path / ".planinc"
    uploads = root / "files"
    uploads.mkdir(parents=True)
    (root / "plugins").mkdir(parents=True)
    settings = Settings(
        db_file=str(tmp_path / "planinc.db"),
        db_ns="planinc",
        db_name="planinc",
        jwt_secret=SECRET,
        port=1111,
        data_dir=str(root),
    )
    db = FakeDb()
    services = AppServices.from_client(db, SECRET, upload_dir=str(uploads))
    app = create_app(settings, router=build_trpc_router(services), services=services)
    return RobynTestClient(app), services, db, uploads, settings


def _token(account_id=1, role="user") -> str:
    return issue_api_token(SECRET, account_id, f"user{account_id}", role)


def _auth(account_id=1, role="user") -> dict[str, str]:
    return {"authorization": f"Bearer {_token(account_id, role)}"}


def multipart_body(
    filename: str | None = "hello world.txt",
    content: bytes = b"file-contents",
    fields: dict[str, str] | None = None,
) -> bytes:
    chunks: list[bytes] = []
    for name, value in (fields or {}).items():
        chunks.append(
            (
                f"--{BOUNDARY}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()
        )
    if filename is not None:
        chunks.append(
            (
                f"--{BOUNDARY}\r\n"
                f'Content-Disposition: form-data; name="file"; '
                f'filename="{filename}"\r\n'
                f"Content-Type: text/plain\r\n\r\n"
            ).encode()
            + content
            + b"\r\n"
        )
    chunks.append(f"--{BOUNDARY}--\r\n".encode())
    return b"".join(chunks)


def _upload_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"content-type": f"multipart/form-data; boundary={BOUNDARY}"}
    headers.update(extra or {})
    return headers


# -- upload ---------------------------------------------------------------


def test_upload_stores_the_file_and_returns_the_express_payload(app_env):
    client, services, _, uploads, _ = app_env
    response = client.post(
        "/api/file/upload",
        body=multipart_body(),
        headers=_upload_headers(_auth()),
    )
    assert response.status_code == 200
    payload = json.loads(response.text)
    assert payload["Message"] == "Success"
    assert payload["status"] == 200
    assert payload["size"] == len(b"file-contents")
    assert payload["type"] == "text/plain"
    assert payload["filePath"].endswith(".txt")

    stored = uploads / payload["fileName"]
    assert stored.exists()
    assert stored.read_bytes() == b"file-contents"

    rows = asyncio.run(services.attachments.list_for_account(1))
    assert [row["name"] for row in rows] == [payload["fileName"]]


def test_upload_places_the_file_in_the_destination_folder(app_env):
    client, _, _, uploads, _ = app_env
    response = client.post(
        "/api/file/upload",
        body=multipart_body(fields={"destinationFolder": "trips/2024"}),
        headers=_upload_headers(_auth()),
    )
    payload = json.loads(response.text)
    assert payload["filePath"].startswith("/api/file/trips/2024/")
    assert (uploads / "trips" / "2024" / payload["fileName"]).exists()


def test_upload_ignores_traversal_in_the_destination_folder(app_env):
    client, _, _, uploads, _ = app_env
    response = client.post(
        "/api/file/upload",
        body=multipart_body(fields={"destinationFolder": "../../escape"}),
        headers=_upload_headers(_auth()),
    )
    payload = json.loads(response.text)
    assert ".." not in payload["filePath"]
    stored = uploads / payload["filePath"].replace("/api/file/", "")
    assert stored.exists()
    assert uploads in stored.parents


def test_upload_neutralises_a_traversing_filename(app_env):
    client, _, _, uploads, _ = app_env
    response = client.post(
        "/api/file/upload",
        body=multipart_body(filename="../../etc/passwd"),
        headers=_upload_headers(_auth()),
    )
    payload = json.loads(response.text)
    assert "/" not in payload["fileName"]
    assert (uploads / payload["fileName"]).exists()


def test_upload_requires_authentication(app_env):
    client, _, _, _, _ = app_env
    response = client.post(
        "/api/file/upload", body=multipart_body(), headers=_upload_headers()
    )
    assert response.status_code == 401


def test_upload_without_a_file_part_is_400(app_env):
    client, _, _, _, _ = app_env
    response = client.post(
        "/api/file/upload",
        body=multipart_body(filename=None, fields={"destinationFolder": "x"}),
        headers=_upload_headers(_auth()),
    )
    assert response.status_code == 400


# -- serving --------------------------------------------------------------


def _upload(services, name="doc.txt", data=b"payload", account=1) -> str:
    result = asyncio.run(
        services.attachments.save_upload(
            account, filename=name, data=data, type_="text/plain"
        )
    )
    return result["filePath"]


def test_get_file_serves_bytes_with_etag_and_range(app_env):
    client, services, _, _, _ = app_env
    path = _upload(services)

    served = client.get(path, headers=_auth())
    assert served.status_code == 200
    assert served.content == b"payload"
    assert served.headers["content-type"] == "text/plain"
    etag = served.headers["etag"]

    cached = client.get(path, headers={**_auth(), "if-none-match": etag})
    assert cached.status_code == 304

    ranged = client.get(path, headers={**_auth(), "range": "bytes=1-3"})
    assert ranged.status_code == 206
    assert ranged.content == b"ayl"
    assert ranged.headers["content-range"] == "bytes 1-3/7"


def test_get_file_supports_download_and_thumbnail_flags(app_env):
    client, services, _, _, _ = app_env
    path = _upload(services, name="pic.png", data=b"pngdata")

    download = client.get(path, query_params={"download": "true"}, headers=_auth())
    assert "attachment" in download.headers["content-disposition"]

    thumbnail = client.get(path, query_params={"thumbnail": "true"}, headers=_auth())
    assert thumbnail.status_code == 200
    # No image pipeline yet; the original bytes are returned and flagged.
    assert thumbnail.content == b"pngdata"
    assert thumbnail.headers["x-planinc-thumbnail"] == "unsupported"


def test_get_file_reads_the_query_string_from_the_path(app_env):
    client, services, _, _, _ = app_env
    path = _upload(services, name="pic.png", data=b"pngdata")
    response = client.get(f"{path}?download=true", headers=_auth())
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]


def test_get_file_requires_the_owner_or_a_share(app_env):
    client, services, _, _, _ = app_env
    path = _upload(services, account=1, data=b"secret")

    anonymous = client.get(path)
    assert anonymous.status_code == 401

    stranger = client.get(path, headers=_auth(account_id=2))
    assert stranger.status_code == 403

    admin = client.get(path, headers=_auth(account_id=2, role="superadmin"))
    assert admin.status_code == 200


def test_get_file_allows_a_publicly_shared_note_attachment(app_env):
    client, services, db, _, _ = app_env
    db.seed("notes", 7, {"accountId": 1, "isShare": True})
    asyncio.run(
        services.attachments.record_upload(
            1, "shared.txt", "shared.txt", 5, "text/plain", note_id=7
        )
    )
    services.attachments.storage.save("shared.txt", b"public")

    response = client.get("/api/file/shared.txt")
    assert response.status_code == 200
    assert response.content == b"public"


def test_get_file_requires_auth_for_the_temp_directory(app_env):
    client, _, _, uploads, _ = app_env
    (uploads / "temp").mkdir()
    (uploads / "temp" / "scratch.txt").write_bytes(b"tmp")

    assert client.get("/api/file/temp/scratch.txt").status_code == 401
    assert (
        client.get("/api/file/temp/scratch.txt", headers=_auth()).status_code == 200
    )


def test_get_file_restricts_bko_backups_to_superadmin(app_env):
    client, services, _, _, _ = app_env
    services.attachments.storage.save("planinc.bko", b"backup")

    assert client.get("/api/file/planinc.bko", headers=_auth()).status_code == 401
    served = client.get(
        "/api/file/planinc.bko", headers=_auth(role="superadmin")
    )
    assert served.status_code == 200
    assert served.content == b"backup"


@pytest.mark.parametrize(
    "path",
    [
        "/api/file/..%2F..%2Fetc%2Fpasswd",
        "/api/file/a/..%2F..%2F..%2Fetc%2Fpasswd",
        "/api/file/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    ],
)
def test_get_file_blocks_traversal(app_env, path):
    client, _, _, _, _ = app_env
    response = client.get(path)
    assert response.status_code in (400, 403)
    assert "passwd" not in response.text


def test_get_s3_file_reports_not_implemented(app_env):
    client, _, _, _, _ = app_env
    response = client.get("/api/s3file/anything.txt", headers=_auth())
    assert response.status_code == 501
    assert "S3" in json.loads(response.text)["error"]


# -- plugin bundles -------------------------------------------------------


def test_plugin_routes_serve_javascript_from_the_plugin_directory(app_env):
    client, _, _, _, settings = app_env
    from pathlib import Path

    plugins = Path(settings.plugin_dir)
    (plugins / "demo").mkdir()
    (plugins / "demo" / "index.js").write_bytes(b"export default {}")

    response = client.get("/plugins/demo/index.js")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/javascript"
    assert response.content == b"export default {}"


@pytest.mark.parametrize(
    "path",
    [
        "/plugins/../secrets.txt",
        "/plugins/demo/%2e%2e/secrets.txt",
        "/plugins/..%2f..%2fetc%2fpasswd",
    ],
)
def test_plugin_routes_block_traversal(app_env, path):
    client, _, _, _, _ = app_env
    assert client.get(path).status_code in (400, 403, 404)


# -- delete ---------------------------------------------------------------


def test_delete_removes_an_owned_file(app_env):
    client, services, _, uploads, _ = app_env
    path = _upload(services, name="gone.txt")
    assert (uploads / "gone.txt").exists()

    response = client.post(
        "/api/file/delete", json_data={"attachment_path": path}, headers=_auth()
    )
    assert response.status_code == 200
    assert json.loads(response.text) == {"Message": "Success", "status": 200}
    assert not (uploads / "gone.txt").exists()
    assert asyncio.run(services.attachments.list_for_account(1)) == []


def test_delete_rejects_other_accounts_and_missing_input(app_env):
    client, services, _, _, _ = app_env
    path = _upload(services, name="mine.txt")

    forbidden = client.post(
        "/api/file/delete",
        json_data={"attachment_path": path},
        headers=_auth(account_id=2),
    )
    assert forbidden.status_code == 403

    missing = client.post("/api/file/delete", json_data={}, headers=_auth())
    assert missing.status_code == 400

    unknown = client.post(
        "/api/file/delete",
        json_data={"attachment_path": "/api/file/nope.txt"},
        headers=_auth(),
    )
    assert unknown.status_code == 404


# -- archive --------------------------------------------------------------


def test_archive_streams_a_zip_of_the_selected_files(app_env):
    client, services, _, _, _ = app_env
    asyncio.run(
        services.attachments.save_upload(
            1,
            filename="a.txt",
            data=b"first",
            type_="text/plain",
            destination_folder="docs",
        )
    )
    asyncio.run(
        services.attachments.save_upload(
            1, filename="b.txt", data=b"second", type_="text/plain"
        )
    )

    response = client.post(
        "/api/file/archive",
        json_data={"attachmentIds": [], "folderPaths": ["docs"]},
        headers=_auth(),
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "planinc-resources.zip" in response.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.namelist() == ["docs/a.txt"]
        assert archive.read("docs/a.txt") == b"first"


def test_archive_accepts_explicit_ids(app_env):
    client, services, _, _, _ = app_env
    _upload(services, name="only.txt", data=b"payload")
    attachment_id = asyncio.run(services.attachments.list_for_account(1))[0]["id"]

    response = client.post(
        "/api/file/archive",
        json_data={"attachmentIds": [attachment_id], "folderPaths": []},
        headers=_auth(),
    )
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.read("only.txt") == b"payload"


def test_archive_validates_input(app_env):
    client, services, _, _, _ = app_env
    _upload(services)

    empty = client.post(
        "/api/file/archive",
        json_data={"attachmentIds": [], "folderPaths": []},
        headers=_auth(),
    )
    assert empty.status_code == 400

    traversing = client.post(
        "/api/file/archive",
        json_data={"attachmentIds": [], "folderPaths": ["../../etc"]},
        headers=_auth(),
    )
    assert traversing.status_code == 400

    nothing = client.post(
        "/api/file/archive",
        json_data={"attachmentIds": [999], "folderPaths": []},
        headers=_auth(),
    )
    assert nothing.status_code == 404

    unauthenticated = client.post(
        "/api/file/archive", json_data={"attachmentIds": [1], "folderPaths": []}
    )
    assert unauthenticated.status_code == 401


# -- upload by URL --------------------------------------------------------


def test_upload_by_url_requires_a_url_and_auth(app_env):
    client, _, _, _, _ = app_env
    assert client.post("/api/file/upload-by-url", json_data={}).status_code == 401
    assert (
        client.post(
            "/api/file/upload-by-url", json_data={}, headers=_auth()
        ).status_code
        == 400
    )


def test_upload_by_url_rejects_non_http_schemes(app_env):
    client, _, _, _, _ = app_env
    response = client.post(
        "/api/file/upload-by-url",
        json_data={"url": "file:///etc/passwd"},
        headers=_auth(),
    )
    assert response.status_code == 400


def test_upload_by_url_reports_demo_mode(app_env):
    client, _, _, _, settings = app_env
    import dataclasses

    from app.main import create_app
    from app.services import AppServices as _Services

    demo_settings = dataclasses.replace(settings, is_demo=True)
    demo_app = create_app(
        demo_settings,
        router=build_trpc_router(app_env[1]),
        services=_Services.from_client(
            app_env[2], SECRET, upload_dir=str(app_env[3])
        ),
    )
    demo_client = RobynTestClient(demo_app)
    response = demo_client.post(
        "/api/file/upload-by-url",
        json_data={"url": "https://example.com/a.txt"},
        headers=_auth(),
    )
    assert response.status_code == 401
    assert "Demo" in json.loads(response.text)["error"]
