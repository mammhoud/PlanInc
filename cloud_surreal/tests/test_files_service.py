import asyncio
import io
import zipfile

import pytest

from app.domain.errors import DomainError
from app.domain.files import (
    AttachmentService,
    FileStorage,
    mime_for,
    normalize_archive_folder,
    normalize_folder,
    safe_archive_segment,
    sanitize_upload_filename,
)
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


@pytest.fixture()
def service(tmp_path) -> AttachmentService:
    root = tmp_path / "files"
    root.mkdir()
    return AttachmentService(FakeDb(), FileStorage(root))


def _code(exc_info) -> str:
    error = exc_info.value
    assert isinstance(error, DomainError)
    return error.code


# -- pure helpers ---------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("hello world.png", "hello_world.png"),
        ("tab\tseparated.txt", "tab_separated.txt"),
        ("trailing dots...", "trailing_dots"),
        ("", "unnamed_file"),
        ("...", "unnamed_file"),
        ("a___b.txt", "a_b.txt"),
    ],
)
def test_sanitize_upload_filename_matches_the_ts_rules(raw, expected):
    assert sanitize_upload_filename(raw) == expected


def test_sanitize_upload_filename_strips_separators_and_truncates():
    sanitized = sanitize_upload_filename("../../etc/passwd")
    assert "/" not in sanitized and "\\" not in sanitized
    assert not sanitized.startswith(".")
    assert ".." not in sanitized

    assert len(sanitize_upload_filename("a" * 500 + ".txt")) == 200


def test_normalize_folder_drops_traversal_segments():
    assert normalize_folder("a/b/c") == "a/b/c"
    assert normalize_folder("a\\b") == "a/b"
    assert normalize_folder("../etc") == "etc"
    assert normalize_folder("a/./b/../c") == "a/b/c"
    assert normalize_folder(None) == ""


def test_normalize_archive_folder_rejects_traversal_outright():
    assert normalize_archive_folder("a/b") == "a,b"
    assert normalize_archive_folder("a,b") == "a,b"
    assert normalize_archive_folder("../a") is None
    assert normalize_archive_folder("") is None


def test_safe_archive_segment_neutralises_names():
    for raw in ("../../x", "a/b", "a\\b"):
        segment = safe_archive_segment(raw)
        assert "/" not in segment and "\\" not in segment
        assert ".." not in segment


def test_mime_for_falls_back_to_octet_stream():
    assert mime_for("a.png") == "image/png"
    assert mime_for("a.unknownthing") == "application/octet-stream"


# -- uploads --------------------------------------------------------------


def test_save_upload_writes_bytes_and_registers_a_record(service):
    result = asyncio.run(
        service.save_upload(
            ACCOUNT,
            filename="My Photo.PNG",
            data=b"png-bytes",
            type_="image/png",
            destination_folder="vacation/2024",
        )
    )
    assert result["filePath"].startswith("/api/file/vacation/2024/My_Photo")
    assert result["fileName"].endswith(".PNG")
    assert service.storage.read(result["filePath"].replace("/api/file/", "")) == (
        b"png-bytes"
    )

    rows = asyncio.run(service.list_for_account(ACCOUNT))
    assert len(rows) == 1
    # ``perfixPath`` is the comma form the TS router stores.
    assert rows[0]["perfixPath"] == "vacation,2024"
    assert rows[0]["depth"] == 2
    assert rows[0]["size"] == 9
    assert rows[0]["type"] == "image/png"


def test_save_upload_neutralises_a_traversing_filename(service):
    result = asyncio.run(
        service.save_upload(
            ACCOUNT, filename="../../escape.txt", data=b"x", type_="text/plain"
        )
    )
    stored = service.storage.root / result["fileName"]
    assert stored.parent == service.storage.root
    assert result["filePath"] == f"/api/file/{result['fileName']}"


def test_save_upload_rejects_empty_payloads(service):
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(
            service.save_upload(ACCOUNT, filename="a.txt", data=b"", type_="text/plain")
        )
    assert _code(exc_info) == "BAD_REQUEST"


def test_uploads_are_invisible_across_accounts(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="mine.txt", data=b"x", type_="text/plain")
    )
    assert len(asyncio.run(service.list_for_account(ACCOUNT))) == 1
    assert asyncio.run(service.list_for_account(OTHER)) == []


def test_upload_metadata_is_persisted_when_present(service):
    asyncio.run(
        service.save_upload(
            ACCOUNT,
            filename="note.webm",
            data=b"audio",
            type_="audio/webm",
            metadata={"isUserVoiceRecording": True, "audioDuration": "0:07"},
        )
    )
    rows = asyncio.run(service.list_for_account(ACCOUNT))
    assert rows[0]["metadata"]["isUserVoiceRecording"] is True


def test_notes_that_the_account_owns_expose_their_attachments(service):
    service._client.seed("notes", 10, {"accountId": OTHER, "title": "theirs"})
    service._client.seed("notes", 11, {"accountId": ACCOUNT, "title": "mine"})
    asyncio.run(
        service.record_upload(ACCOUNT, "a.txt", "a.txt", 1, "text/plain", note_id=10)
    )
    asyncio.run(
        service.record_upload(OTHER, "b.txt", "b.txt", 1, "text/plain", note_id=11)
    )
    # Visibility follows both ownership paths: each account sees its own row and
    # the row the other attached to a note it owns.
    for account in (ACCOUNT, OTHER):
        visible = asyncio.run(service.list_for_account(account))
        assert sorted(row["name"] for row in visible) == ["a.txt", "b.txt"]

    # A third account that owns neither note sees nothing.
    assert asyncio.run(service.list_for_account(3)) == []


# -- serving policy -------------------------------------------------------


def test_can_read_requires_ownership_a_public_share_or_superadmin(service):
    attachment = {"id": 1, "accountId": ACCOUNT, "path": "/api/file/a.txt"}

    assert asyncio.run(service.can_read(attachment, None, ACCOUNT)) is True
    assert asyncio.run(service.can_read(attachment, None, OTHER)) is False
    assert asyncio.run(service.can_read(attachment, None, None)) is False
    assert asyncio.run(service.can_read(attachment, None, OTHER, True)) is True

    shared = {"id": 9, "accountId": OTHER, "isShare": True}
    assert asyncio.run(service.can_read(attachment, shared, None)) is True

    owned_note = {"id": 9, "accountId": ACCOUNT, "isShare": False}
    assert asyncio.run(service.can_read(attachment, owned_note, ACCOUNT)) is True


def test_find_by_path_exposes_the_owning_note(service):
    service._client.seed("notes", 5, {"accountId": ACCOUNT, "isShare": True})
    asyncio.run(
        service.record_upload(ACCOUNT, "x/y.txt", "y.txt", 1, "text/plain", note_id=5)
    )
    attachment, note = asyncio.run(service.find_by_path("/api/file/x/y.txt"))
    assert attachment["name"] == "y.txt"
    assert note is not None and note["isShare"] is True

    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.find_by_path("/api/file/missing.txt"))
    assert _code(exc_info) == "NOT_FOUND"


# -- folders and renames --------------------------------------------------


def test_create_folder_records_a_dotfolder(service):
    result = asyncio.run(service.create_folder(ACCOUNT, "reports", "docs"))
    assert result == {
        "success": True,
        "folderName": "reports",
        "folderPath": "docs,reports",
    }
    rows = asyncio.run(service.list_for_account(ACCOUNT))
    assert rows[0]["name"] == ".folder"
    assert rows[0]["type"] == "folder"


@pytest.mark.parametrize("bad", ["", "a/b", "..", "   "])
def test_create_folder_rejects_bad_names(service, bad):
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.create_folder(ACCOUNT, bad))
    assert _code(exc_info) == "BAD_REQUEST"


def test_rename_moves_the_bytes_and_updates_the_record(service):
    saved = asyncio.run(
        service.save_upload(
            ACCOUNT, filename="old.txt", data=b"x", type_="text/plain"
        )
    )
    attachment_id = asyncio.run(service.list_for_account(ACCOUNT))[0]["id"]
    asyncio.run(service.rename(ACCOUNT, {"id": attachment_id, "newName": "new.txt"}))

    assert service.storage.exists("new.txt") is True
    assert service.storage.exists("old.txt") is False
    row = asyncio.run(service.list_for_account(ACCOUNT))[0]
    assert row["name"] == "new.txt"
    assert row["path"].endswith("new.txt")
    assert saved["filePath"].endswith("old.txt")


def _upload_one(service, account=ACCOUNT, name="a.txt") -> int:
    asyncio.run(
        service.save_upload(account, filename=name, data=b"x", type_="text/plain")
    )
    return asyncio.run(service.list_for_account(account))[0]["id"]


def test_rename_refuses_separators_in_file_names(service):
    attachment_id = _upload_one(service)
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(
            service.rename(ACCOUNT, {"id": attachment_id, "newName": "../escape.txt"})
        )
    assert _code(exc_info) == "BAD_REQUEST"


def test_rename_works_across_accounts_only_for_the_owner(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="a.txt", data=b"x", type_="text/plain")
    )
    attachment_id = asyncio.run(service.list_for_account(ACCOUNT))[0]["id"]
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(
            service.rename(OTHER, {"id": attachment_id, "newName": "stolen.txt"})
        )
    assert _code(exc_info) == "NOT_FOUND"


def test_move_relocates_attachments_and_reports_missing_ids(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="a.txt", data=b"x", type_="text/plain")
    )
    attachment_id = asyncio.run(service.list_for_account(ACCOUNT))[0]["id"]
    asyncio.run(service.move(ACCOUNT, [attachment_id], "archive/2024"))

    assert service.storage.exists("archive/2024/a.txt") is True
    row = asyncio.run(service.list_for_account(ACCOUNT))[0]
    assert row["perfixPath"] == "archive,2024"
    assert row["depth"] == 2

    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.move(ACCOUNT, [9999], "archive"))
    assert _code(exc_info) == "NOT_FOUND"


def test_delete_removes_the_record_and_the_bytes(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="a.txt", data=b"x", type_="text/plain")
    )
    attachment_id = asyncio.run(service.list_for_account(ACCOUNT))[0]["id"]
    result = asyncio.run(service.delete(ACCOUNT, attachment_id))
    assert result["success"] is True
    assert asyncio.run(service.list_for_account(ACCOUNT)) == []
    assert service.storage.exists("a.txt") is False


def test_delete_folder_removes_every_descendant(service):
    asyncio.run(service.create_folder(ACCOUNT, "reports", "docs"))
    asyncio.run(
        service.save_upload(
            ACCOUNT,
            filename="q1.txt",
            data=b"x",
            type_="text/plain",
            destination_folder="docs/reports",
        )
    )
    asyncio.run(
        service.save_upload(
            ACCOUNT,
            filename="keep.txt",
            data=b"x",
            type_="text/plain",
            destination_folder="docs/other",
        )
    )
    asyncio.run(
        service.delete(ACCOUNT, is_folder=True, folder_path="docs/reports")
    )
    remaining = asyncio.run(service.list_for_account(ACCOUNT))
    assert [row["name"] for row in remaining] == ["keep.txt"]


def test_delete_by_path_requires_ownership(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="a.txt", data=b"x", type_="text/plain")
    )
    with pytest.raises(DomainError) as exc_info:
        asyncio.run(service.delete_by_path(OTHER, "/api/file/a.txt"))
    assert _code(exc_info) == "FORBIDDEN"

    result = asyncio.run(service.delete_by_path(ACCOUNT, "/api/file/a.txt"))
    assert result == {"Message": "Success", "status": 200}
    assert service.storage.exists("a.txt") is False


def test_delete_many_skips_ids_the_account_cannot_see(service):
    asyncio.run(
        service.save_upload(ACCOUNT, filename="a.txt", data=b"x", type_="text/plain")
    )
    asyncio.run(
        service.save_upload(OTHER, filename="b.txt", data=b"x", type_="text/plain")
    )
    mine = asyncio.run(service.list_for_account(ACCOUNT))[0]["id"]
    theirs = asyncio.run(service.list_for_account(OTHER))[0]["id"]

    asyncio.run(service.delete_many(ACCOUNT, [mine, theirs, 9999]))
    assert asyncio.run(service.list_for_account(ACCOUNT)) == []
    assert len(asyncio.run(service.list_for_account(OTHER))) == 1


# -- archives -------------------------------------------------------------


def test_build_archive_preserves_folders_and_never_traverses(service):
    asyncio.run(
        service.save_upload(
            ACCOUNT,
            filename="a.txt",
            data=b"first",
            type_="text/plain",
            destination_folder="docs/reports",
        )
    )
    asyncio.run(
        service.save_upload(
            ACCOUNT, filename="b.txt", data=b"second", type_="text/plain"
        )
    )
    rows = asyncio.run(service.list_for_account(ACCOUNT))
    selected = asyncio.run(
        service.select_for_archive(ACCOUNT, [], ["docs,reports"])
    )
    assert [row["name"] for row in selected] == ["a.txt"]

    payload = service.build_archive(rows)
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = archive.namelist()
        assert "docs/reports/a.txt" in names
        assert "b.txt" in names
        assert archive.read("docs/reports/a.txt") == b"first"


def test_select_for_archive_scopes_to_the_account(service):
    asyncio.run(
        service.save_upload(OTHER, filename="theirs.txt", data=b"x", type_="text/plain")
    )
    other_id = asyncio.run(service.list_for_account(OTHER))[0]["id"]
    assert asyncio.run(service.select_for_archive(ACCOUNT, [other_id], [])) == []


def test_select_for_archive_skips_folder_markers(service):
    asyncio.run(service.create_folder(ACCOUNT, "reports"))
    assert asyncio.run(service.select_for_archive(ACCOUNT, [], ["reports"])) == []
