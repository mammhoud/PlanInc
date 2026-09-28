import asyncio

import pytest

from app.domain.errors import DomainError
from app.domain.notes import NoteService
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


def _service() -> tuple[NoteService, FakeDb]:
    db = FakeDb()
    return NoteService(db), db


def _run(coro):
    return asyncio.run(coro)


def test_upsert_allocates_ids_and_scopes_to_the_account():
    service, _ = _service()

    async def run():
        first = await service.upsert(ACCOUNT, {"content": "a"})
        second = await service.upsert(ACCOUNT, {"content": "b"})
        return first, second

    first, second = _run(run())
    assert first["id"] == 1
    assert second["id"] == 2
    assert first["accountId"] == ACCOUNT
    assert first["createdAt"] is not None


def test_upsert_updates_in_place_and_preserves_untouched_fields():
    service, _ = _service()

    async def run():
        created = await service.upsert(ACCOUNT, {"content": "a", "type": "note"})
        updated = await service.upsert(ACCOUNT, {"id": created["id"], "content": "b"})
        return created, updated

    created, updated = _run(run())
    assert updated["id"] == created["id"]
    assert updated["content"] == "b"
    assert updated["type"] == "note"


def test_get_rejects_another_accounts_note():
    service, _ = _service()

    async def run():
        note = await service.upsert(ACCOUNT, {"content": "secret"})
        with pytest.raises(DomainError) as err:
            await service.get(note["id"], OTHER)
        return err

    err = _run(run())
    assert err.value.code == "NOT_FOUND"


def test_list_excludes_other_accounts_and_recycle_by_default():
    service, db = _service()
    db.seed("notes", 9, {"accountId": OTHER, "content": "theirs"})

    async def run():
        mine = await service.upsert(ACCOUNT, {"content": "mine"})
        trashed = await service.upsert(ACCOUNT, {"content": "trashed"})
        await service.trash_many([trashed["id"]], ACCOUNT)
        return mine

    _run(run())
    listed = _run(service.list_for_account(ACCOUNT))
    assert [row["content"] for row in listed] == ["mine"]

    with_recycle = _run(service.list_for_account(ACCOUNT, include_recycle=True))
    assert {row["content"] for row in with_recycle} == {"mine", "trashed"}


def test_search_and_type_filters():
    service, _ = _service()

    async def run():
        await service.upsert(ACCOUNT, {"content": "alpha", "type": "note"})
        await service.upsert(ACCOUNT, {"content": "beta", "type": "ticket"})

    _run(run())
    searched = _run(service.list_for_account(ACCOUNT, search="alph"))
    assert [r["content"] for r in searched] == ["alpha"]

    typed = _run(service.list_for_account(ACCOUNT, type_="ticket"))
    assert [r["content"] for r in typed] == ["beta"]


def test_references_round_trip_in_both_directions():
    service, _ = _service()

    async def run():
        a = await service.upsert(ACCOUNT, {"content": "a"})
        b = await service.upsert(ACCOUNT, {"content": "b"})
        await service.add_reference(a["id"], b["id"], ACCOUNT)
        return a, b

    a, b = _run(run())
    forward = _run(service.reference_list(a["id"], "references", ACCOUNT))
    backward = _run(service.reference_list(b["id"], "referencedBy", ACCOUNT))
    assert [row["id"] for row in forward] == [b["id"]]
    assert [row["id"] for row in backward] == [a["id"]]

    _run(service.remove_reference(a["id"], b["id"], ACCOUNT))
    assert _run(service.reference_list(a["id"], "references", ACCOUNT)) == []


def test_related_notes_share_a_tag():
    service, _ = _service()

    # Links are derived from the body now (S2t), so the overlap is real.
    async def run():
        await service.upsert(ACCOUNT, {"content": "one #topic"})
        await service.upsert(ACCOUNT, {"content": "two #topic"})
        await service.upsert(ACCOUNT, {"content": "three #other"})

    _run(run())
    related = _run(service.related(1, ACCOUNT))
    assert [row["id"] for row in related] == [2]


def test_review_and_stats():
    service, _ = _service()

    async def run():
        await service.upsert(ACCOUNT, {"content": "a"})
        await service.upsert(ACCOUNT, {"content": "b"})
        await service.review(1, ACCOUNT)

    _run(run())
    stats = _run(service.review_stats(ACCOUNT))
    assert stats == {"total": 2, "reviewed": 1, "pending": 1}


def test_clear_recycle_bin_removes_only_my_trashed_notes():
    service, db = _service()
    db.seed("notes", 9, {"accountId": OTHER, "content": "theirs", "isRecycle": True})

    async def run():
        keep = await service.upsert(ACCOUNT, {"content": "keep"})
        gone = await service.upsert(ACCOUNT, {"content": "gone"})
        await service.trash_many([gone["id"]], ACCOUNT)
        return keep

    keep = _run(run())
    removed = _run(service.clear_recycle_bin(ACCOUNT))
    assert removed == 1
    assert _run(service.by_id(keep["id"])) is not None
    assert _run(service.by_id(9)) is not None
