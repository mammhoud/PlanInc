"""Tag mutations (slice S2b) — enabled by the S2t derivation service."""

import asyncio

from app.domain.collections import TagService
from app.domain.notes import NoteService
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


def _run(coro):
    return asyncio.run(coro)


def _setup():
    db = FakeDb()
    return NoteService(db), TagService(db), db


def _tag(service, account_id, name):
    for row in _run(service.list_for_account(account_id)):
        if row["name"] == name:
            return row
    raise AssertionError(f"tag {name!r} not found")


def test_full_name_walks_the_parent_chain():
    notes, tags, _ = _setup()
    _run(notes.upsert(ACCOUNT, {"content": "body #parent/child"}))

    child = _tag(tags, ACCOUNT, "child")
    assert _run(tags.full_name(child["id"], ACCOUNT)) == "#parent/child"


def test_update_icon_and_order_are_scoped():
    notes, tags, _ = _setup()
    _run(notes.upsert(ACCOUNT, {"content": "body #alpha"}))
    alpha = _tag(tags, ACCOUNT, "alpha")

    updated = _run(tags.update_icon(alpha["id"], ACCOUNT, "star"))
    assert updated["icon"] == "star"
    ordered = _run(tags.update_order(alpha["id"], ACCOUNT, 5))
    assert ordered["sortOrder"] == 5

    # another account cannot reach the tag
    assert _run(tags.by_id(alpha["id"], OTHER)) is None


def test_update_tag_many_appends_and_links():
    notes, tags, _ = _setup()

    async def seed():
        first = await notes.upsert(ACCOUNT, {"content": "one"})
        second = await notes.upsert(ACCOUNT, {"content": "two"})
        return first, second

    first, second = _run(seed())
    _run(tags.update_tag_many(ACCOUNT, [first["id"], second["id"]], "bulk"))

    bulk = _tag(tags, ACCOUNT, "bulk")
    assert bulk is not None
    for note_id in (first["id"], second["id"]):
        note = _run(notes.get(note_id, ACCOUNT))
        assert "#bulk" in note["content"]
    related = _run(notes.related(first["id"], ACCOUNT))
    assert second["id"] in [row["id"] for row in related]


def test_update_tag_name_rewrites_content_without_renaming_the_row():
    notes, tags, _ = _setup()
    note = _run(notes.upsert(ACCOUNT, {"content": "hello #old"}))
    old = _tag(tags, ACCOUNT, "old")

    _run(tags.update_tag_name(old["id"], ACCOUNT, "old", "new"))

    assert _run(notes.get(note["id"], ACCOUNT))["content"] == "hello #new"
    names = {row["name"] for row in _run(tags.list_for_account(ACCOUNT))}
    assert "new" in names
    # upstream quirk: the old row survives, it is only unlinked
    assert "old" in names


def test_delete_only_tag_strips_token_and_gc_the_tag():
    notes, tags, _ = _setup()
    note = _run(notes.upsert(ACCOUNT, {"content": "keep #drop trailing"}))
    drop = _tag(tags, ACCOUNT, "drop")

    _run(tags.delete_only_tag(drop["id"], ACCOUNT))

    content = _run(notes.get(note["id"], ACCOUNT))["content"]
    assert "#drop" not in content
    assert content == "keep trailing"
    assert _run(tags.by_id(drop["id"], ACCOUNT)) is None


def test_delete_only_tag_strips_every_linked_note_then_gc():
    # Upstream `deleteOnlyTag` removes the tag from *every* note that links it
    # (the notes survive), so zero usages then garbage-collects the row.
    notes, tags, _ = _setup()
    first = _run(notes.upsert(ACCOUNT, {"content": "one #shared"}))
    second = _run(notes.upsert(ACCOUNT, {"content": "two #shared"}))
    shared = _tag(tags, ACCOUNT, "shared")

    _run(tags.delete_only_tag(shared["id"], ACCOUNT))

    assert "#shared" not in _run(notes.get(first["id"], ACCOUNT))["content"]
    assert "#shared" not in _run(notes.get(second["id"], ACCOUNT))["content"]
    assert _run(tags.by_id(shared["id"], ACCOUNT)) is None


def test_delete_tag_with_all_notes_trashes_linked_notes():
    notes, tags, _ = _setup()
    note = _run(notes.upsert(ACCOUNT, {"content": "doomed #gone"}))
    gone = _tag(tags, ACCOUNT, "gone")

    _run(tags.delete_tag_with_all_notes(gone["id"], ACCOUNT))

    assert _run(notes.by_id(note["id"]))["isRecycle"] is True


def test_full_name_missing_tag_raises_not_found():
    _, tags, _ = _setup()
    try:
        _run(tags.full_name(999, ACCOUNT))
    except Exception as err:  # DomainError
        assert getattr(err, "code", None) == "NOT_FOUND"
    else:  # pragma: no cover - the call must raise
        raise AssertionError("expected DomainError")
