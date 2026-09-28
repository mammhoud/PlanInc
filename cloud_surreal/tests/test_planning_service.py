import asyncio

import pytest

from app.domain.errors import DomainError
from app.domain.planning import (
    PlanningCategoryService,
    PlanningFieldService,
    PlanningLinkService,
    StudyService,
    TaskService,
    TicketService,
    apply_sm2,
    slugify_category,
)
from tests.fakes import FakeDb

ACCOUNT = 1
OTHER = 2


def _run(coro):
    return asyncio.run(coro)


def _tickets() -> tuple[TicketService, FakeDb]:
    db = FakeDb()
    return TicketService(db), db


def test_ticket_category_is_mirrored_as_a_tag():
    service, _ = _tickets()

    async def run():
        return await service.create_ticket(
            ACCOUNT, {"title": "T", "category": "Now", "tags": ["x"]}
        )

    ticket = _run(run())
    assert ticket["tags"] == ["x", "Now"]
    assert ticket["status"] == "open"

    async def update():
        return await service.update_ticket(
            ACCOUNT, {"id": ticket["id"], "category": "Next"}
        )

    updated = _run(update())
    assert updated["tags"] == ["x", "Next"]


def test_ticket_list_filters_and_is_account_scoped():
    service, db = _tickets()
    db.seed("tickets", 99, {"accountId": OTHER, "title": "theirs", "status": "open"})

    async def run():
        await service.create_ticket(ACCOUNT, {"title": "a", "status": "open"})
        await service.create_ticket(ACCOUNT, {"title": "b", "status": "done"})

    _run(run())
    assert [t["title"] for t in _run(service.list_tickets(ACCOUNT))] == ["b", "a"]
    assert [t["title"] for t in _run(service.list_tickets(ACCOUNT, "open"))] == ["a"]


def test_ticket_requires_title_and_cross_account_is_not_found():
    service, _ = _tickets()
    with pytest.raises(DomainError):
        _run(service.create_ticket(ACCOUNT, {"title": "  "}))

    async def run():
        return await service.create_ticket(ACCOUNT, {"title": "mine"})

    ticket = _run(run())
    with pytest.raises(DomainError) as err:
        _run(service.get(ticket["id"], OTHER))
    assert err.value.code == "NOT_FOUND"


def test_study_card_is_due_and_review_advances_the_schedule():
    service = StudyService(FakeDb())

    async def run():
        return await service.create_study(
            ACCOUNT, {"title": "Q", "question": "q", "answer": "a"}
        )

    card = _run(run())
    assert card["srsDueAt"] is not None
    assert len(_run(service.due_list(ACCOUNT))) == 1

    good = _run(service.review(ACCOUNT, card["id"], "good"))
    assert good["srsReps"] == 1
    assert good["srsInterval"] == 1

    again = _run(service.review(ACCOUNT, card["id"], "again"))
    assert again["srsInterval"] == 0
    assert again["srsLapses"] == 1


def test_apply_sm2_transitions():
    start = {"srsEase": 0, "srsInterval": 0, "srsReps": 0, "srsLapses": 0}
    first = apply_sm2(start, "good")
    assert (first["srsEase"], first["srsInterval"], first["srsReps"]) == (2.5, 1, 1)
    second = apply_sm2(first, "good")
    assert second["srsInterval"] == 6
    third = apply_sm2(second, "good")
    assert third["srsInterval"] == 15  # round(6 * 2.5)
    easy = apply_sm2(third, "easy")
    assert easy["srsEase"] == 2.65


def test_planning_link_dedupes_and_rejects_self_and_missing_entities():
    db = FakeDb()
    db.seed("notes", 1, {"accountId": ACCOUNT, "content": "n"})
    db.seed("tickets", 2, {"accountId": ACCOUNT, "title": "t"})
    service = PlanningLinkService(db)

    with pytest.raises(DomainError):
        _run(
            service.create_link(
                ACCOUNT,
                {
                    "sourceType": "note",
                    "sourceId": 1,
                    "targetType": "note",
                    "targetId": 1,
                },
            )
        )

    with pytest.raises(DomainError) as err:
        _run(
            service.create_link(
                ACCOUNT,
                {
                    "sourceType": "note",
                    "sourceId": 1,
                    "targetType": "ticket",
                    "targetId": 999,
                },
            )
        )
    assert err.value.code == "NOT_FOUND"

    pair = {
        "sourceType": "note",
        "sourceId": 1,
        "targetType": "ticket",
        "targetId": 2,
    }
    first = _run(service.create_link(ACCOUNT, pair))
    second = _run(
        service.create_link(
            ACCOUNT,
            {
                "sourceType": "note",
                "sourceId": 1,
                "targetType": "ticket",
                "targetId": 2,
                "label": "renamed",
                "showInGraph": False,
            },
        )
    )
    assert second["id"] == first["id"]
    assert second["label"] == "renamed"
    assert second["showInGraph"] is False
    assert len(_run(service.list_links(ACCOUNT, entity_type="note", entity_id=1))) == 1
    assert _run(service.list_links(ACCOUNT, graph_only=True)) == []


def test_planning_field_key_is_unique_per_kind():
    service = PlanningFieldService(FakeDb())
    _run(
        service.create_field(
            ACCOUNT, {"kind": "ticket", "key": "Sev", "label": "Sev"}
        )
    )
    with pytest.raises(DomainError) as err:
        _run(service.create_field(ACCOUNT, {"kind": "ticket", "key": "sev"}))
    assert err.value.code == "CONFLICT"
    # Same key is fine on the other form.
    _run(service.create_field(ACCOUNT, {"kind": "study", "key": "sev"}))


def test_category_slug_defaults_and_seed():
    assert slugify_category("Now / Next!") == "now-next"
    service = PlanningCategoryService(FakeDb())

    first = _run(service.create_category(ACCOUNT, {"name": "Now"}))
    assert first["slug"] == "now"
    assert first["isDefault"] is True

    with pytest.raises(DomainError):
        _run(service.create_category(ACCOUNT, {"name": "Now"}))

    seeded = _run(service.seed_defaults(ACCOUNT))
    assert [row["name"] for row in seeded] == ["Next", "Later"]


def test_category_assign_mirrors_tags_and_delete_reassigns_notes():
    db = FakeDb()
    db.seed("notes", 1, {"accountId": ACCOUNT, "content": "plan", "tags": ["old"]})
    service = PlanningCategoryService(db)
    category = _run(service.create_category(ACCOUNT, {"name": "Now"}))

    _run(service.assign(ACCOUNT, 1, category["id"]))
    note = db.tables["notes"][1]
    assert note["categoryId"] == category["id"]
    assert note["tags"] == ["old", "Now"]

    result = _run(service.delete_category(ACCOUNT, category["id"], None))
    assert result["reassigned"] == 1
    assert db.tables["notes"][1]["categoryId"] is None


def test_task_upsert_and_list():
    service = TaskService(FakeDb())
    assert _run(service.list_tasks()) == []
    _run(
        service.upsert_task(
            {"task": "db-backup", "type": "start", "time": "0 3 * * *"}
        )
    )
    tasks = _run(service.list_tasks())
    assert tasks[0]["name"] == "db-backup"
    assert tasks[0]["isRunning"] is True
    _run(service.upsert_task({"task": "db-backup", "type": "stop"}))
    assert _run(service.list_tasks())[0]["isRunning"] is False
