"""Remaining S2 surface: history, sharing, ordering, lists, comments."""

import asyncio

import pytest

from app.domain.collections import CommentService
from app.domain.errors import DomainError
from app.domain.notes import NOTE_HISTORY_RETENTION, NoteService
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


def _run(coro):
    return asyncio.run(coro)


def _setup():
    db = FakeDb()
    return NoteService(db), db


def test_history_records_previous_content_on_change():
    service, _ = _setup()
    note = _run(service.upsert(ACCOUNT, {"content": "v1"}))
    _run(service.upsert(ACCOUNT, {"id": note["id"], "content": "v2"}))
    _run(service.upsert(ACCOUNT, {"id": note["id"], "content": "v3"}))

    rows = _run(service.history(note["id"], ACCOUNT))
    assert [row["version"] for row in rows] == [2, 1]
    assert [row["content"] for row in rows] == ["v2", "v1"]


def test_history_is_capped_and_scoped():
    service, _ = _setup()
    note = _run(service.upsert(ACCOUNT, {"content": "v0"}))
    for index in range(1, NOTE_HISTORY_RETENTION + 8):
        _run(service.upsert(ACCOUNT, {"id": note["id"], "content": f"v{index}"}))

    rows = _run(service.history(note["id"], ACCOUNT))
    assert len(rows) == NOTE_HISTORY_RETENTION

    with pytest.raises(DomainError):
        _run(service.history(note["id"], OTHER))


def test_share_note_round_trip_and_cancel():
    service, _ = _setup()
    note = _run(service.upsert(ACCOUNT, {"content": "shareable"}))

    shared = _run(service.share_note(note["id"], ACCOUNT, password="pw"))
    assert shared["isShare"] is True
    assert shared["shareEncryptedUrl"]
    assert shared["sharePassword"] == "pw"

    # re-sharing keeps the existing url
    again = _run(service.share_note(note["id"], ACCOUNT))
    assert again["shareEncryptedUrl"] == shared["shareEncryptedUrl"]

    cancelled = _run(service.share_note(note["id"], ACCOUNT, is_cancel=True))
    assert cancelled["isShare"] is False
    assert cancelled["shareEncryptedUrl"] is None


def test_internal_share_adds_and_removes_recipients():
    service, db = _setup()
    note = _run(service.upsert(ACCOUNT, {"content": "note"}))
    db.seed("accounts", 2, {"name": "bob"})
    db.seed("accounts", 3, {"name": "carol"})

    result = _run(service.internal_share_note(note["id"], ACCOUNT, [2, 3, ACCOUNT]))
    assert result["success"] is True
    users = _run(service.internal_shared_users(note["id"], ACCOUNT))
    assert {user["id"] for user in users} == {2, 3}

    _run(service.internal_share_note(note["id"], ACCOUNT, [2, 3], is_cancel=True))
    assert _run(service.internal_shared_users(note["id"], ACCOUNT)) == []


def test_internal_share_rejects_someone_elses_note():
    service, _ = _setup()
    note = _run(service.upsert(OTHER, {"content": "theirs"}))
    result = _run(service.internal_share_note(note["id"], ACCOUNT, [ACCOUNT]))
    assert result == {"success": False, "message": "Note not found"}


def test_update_notes_order_and_public_list():
    service, _ = _setup()
    first = _run(service.upsert(ACCOUNT, {"content": "one"}))
    second = _run(service.upsert(ACCOUNT, {"content": "two"}))

    _run(service.update_notes_order(ACCOUNT, [{"id": first["id"], "sortOrder": 9}]))
    assert _run(service.by_id(first["id"]))["sortOrder"] == 9

    _run(service.share_note(second["id"], ACCOUNT))
    public = _run(service.public_list())
    assert [row["id"] for row in public] == [second["id"]]


def test_update_attachments_order_is_scoped_to_owned_notes():
    service, db = _setup()
    mine = _run(service.upsert(ACCOUNT, {"content": "mine"}))
    theirs = _run(service.upsert(OTHER, {"content": "theirs"}))
    db.seed("attachments", 1, {"name": "a.png", "note": mine["id"]})
    db.seed("attachments", 2, {"name": "a.png", "note": theirs["id"]})

    _run(service.update_attachments_order(ACCOUNT, [{"name": "a.png", "sortOrder": 4}]))

    assert db.tables["attachments"][1]["sortOrder"] == 4
    assert "sortOrder" not in db.tables["attachments"][2]


def test_random_and_daily_review_lists_filter_state():
    service, _ = _setup()
    keep = _run(service.upsert(ACCOUNT, {"content": "keep"}))
    archived = _run(service.upsert(ACCOUNT, {"content": "archived"}))
    _run(service.update_many([archived["id"]], ACCOUNT, {"isArchived": True}))
    trashed = _run(service.upsert(ACCOUNT, {"content": "trashed"}))
    _run(service.trash_many([trashed["id"]], ACCOUNT))

    random_ids = {row["id"] for row in _run(service.random_list(ACCOUNT, limit=10))}
    assert random_ids == {keep["id"]}

    daily = _run(service.daily_review_list(ACCOUNT))
    assert {row["id"] for row in daily} == {keep["id"]}


def test_comments_create_then_delete():
    notes, db = _setup()
    comments = CommentService(db)
    note = _run(notes.upsert(ACCOUNT, {"content": "discuss"}))

    created = _run(comments.create(ACCOUNT, {"content": "hi", "noteId": note["id"]}))
    assert created is True
    listed = _run(comments.list_for_account(ACCOUNT, note["id"]))
    assert [row["content"] for row in listed] == ["hi"]

    assert _run(comments.delete(listed[0]["id"], ACCOUNT)) == {"success": True}
    assert _run(comments.list_for_account(ACCOUNT, note["id"])) == []


def test_comment_on_another_accounts_note_is_forbidden():
    notes, db = _setup()
    comments = CommentService(db)
    note = _run(notes.upsert(OTHER, {"content": "theirs"}))

    with pytest.raises(DomainError) as err:
        _run(comments.create(ACCOUNT, {"content": "spam", "noteId": note["id"]}))
    assert err.value.code == "FORBIDDEN"

    note = _run(notes.upsert(ACCOUNT, {"content": "mine"}))
    _run(comments.create(ACCOUNT, {"content": "hello", "noteId": note["id"]}))
    with pytest.raises(DomainError) as err:
        _run(comments.delete(1, OTHER))
    assert err.value.code == "NOT_FOUND"
