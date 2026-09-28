"""``tickets.*`` / ``study.*`` / ``task.*`` / ``planning*.*`` procedures (S3)."""

from __future__ import annotations

from ..auth.jwt import TokenClaims
from ..domain import policies
from ..domain.planning import (
    PlanningCategoryService,
    PlanningFieldService,
    PlanningLinkService,
    StudyService,
    TaskService,
    TicketService,
)
from ..transport.trpc import Router


def register_planning_routers(
    router: Router,
    tickets: TicketService,
    study: StudyService,
    links: PlanningLinkService,
    fields: PlanningFieldService,
    categories: PlanningCategoryService,
    tasks: TaskService,
) -> None:
    # -- tickets ----------------------------------------------------------

    @router.procedure("tickets.list")
    async def list_tickets(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await tickets.list_tickets(
            policies.current_account_id(claims), input_.get("status")
        )

    @router.procedure("tickets.get")
    async def get_ticket(input_: dict, claims: TokenClaims | None) -> dict:
        return await tickets.get(input_.get("id"), policies.current_account_id(claims))

    @router.procedure("tickets.create")
    async def create_ticket(input_: dict, claims: TokenClaims | None) -> dict:
        return await tickets.create_ticket(policies.current_account_id(claims), input_)

    @router.procedure("tickets.update")
    async def update_ticket(input_: dict, claims: TokenClaims | None) -> dict:
        return await tickets.update_ticket(policies.current_account_id(claims), input_)

    @router.procedure("tickets.delete")
    async def delete_ticket(input_: dict, claims: TokenClaims | None) -> dict:
        await tickets.delete(input_.get("id"), policies.current_account_id(claims))
        return {"success": True}

    # -- study ------------------------------------------------------------

    @router.procedure("study.list")
    async def list_study(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await study.list_study(
            policies.current_account_id(claims),
            search_text=str(input_.get("searchText") or ""),
            status=input_.get("status"),
            category=input_.get("category"),
            kind=str(input_.get("kind") or "all"),
            due_only=bool(input_.get("dueOnly")),
        )

    @router.procedure("study.get")
    async def get_study(input_: dict, claims: TokenClaims | None) -> dict:
        return await study.get(input_.get("id"), policies.current_account_id(claims))

    @router.procedure("study.dueList")
    async def due_list(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await study.due_list(
            policies.current_account_id(claims), int(input_.get("limit") or 50)
        )

    @router.procedure("study.review")
    async def review(input_: dict, claims: TokenClaims | None) -> dict:
        return await study.review(
            policies.current_account_id(claims), input_.get("id"), input_.get("rating")
        )

    @router.procedure("study.create")
    async def create_study(input_: dict, claims: TokenClaims | None) -> dict:
        return await study.create_study(policies.current_account_id(claims), input_)

    @router.procedure("study.update")
    async def update_study(input_: dict, claims: TokenClaims | None) -> dict:
        return await study.update_study(policies.current_account_id(claims), input_)

    @router.procedure("study.delete")
    async def delete_study(input_: dict, claims: TokenClaims | None) -> dict:
        await study.delete(input_.get("id"), policies.current_account_id(claims))
        return {"success": True}

    # -- planning links ---------------------------------------------------

    @router.procedure("planningLinks.list")
    async def list_links(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await links.list_links(
            policies.current_account_id(claims),
            entity_type=input_.get("entityType"),
            entity_id=input_.get("entityId"),
            graph_only=bool(input_.get("graphOnly")),
        )

    @router.procedure("planningLinks.create")
    async def create_link(input_: dict, claims: TokenClaims | None) -> dict:
        return await links.create_link(policies.current_account_id(claims), input_)

    @router.procedure("planningLinks.update")
    async def update_link(input_: dict, claims: TokenClaims | None) -> dict:
        account_id = policies.current_account_id(claims)
        patch = {
            key: input_[key]
            for key in ("showInGraph", "label")
            if input_.get(key) is not None
        }
        return await links.update(input_.get("id"), account_id, patch)

    @router.procedure("planningLinks.delete")
    async def delete_link(input_: dict, claims: TokenClaims | None) -> dict:
        await links.delete(input_.get("id"), policies.current_account_id(claims))
        return {"success": True}

    # -- planning fields --------------------------------------------------

    @router.procedure("planningFields.list")
    async def list_fields(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await fields.list_fields(
            policies.current_account_id(claims),
            kind=input_.get("kind"),
            include_disabled=bool(input_.get("includeDisabled")),
        )

    @router.procedure("planningFields.create")
    async def create_field(input_: dict, claims: TokenClaims | None) -> dict:
        return await fields.create_field(policies.current_account_id(claims), input_)

    @router.procedure("planningFields.update")
    async def update_field(input_: dict, claims: TokenClaims | None) -> dict:
        return await fields.update_field(policies.current_account_id(claims), input_)

    @router.procedure("planningFields.delete")
    async def delete_field(input_: dict, claims: TokenClaims | None) -> dict:
        await fields.delete(input_.get("id"), policies.current_account_id(claims))
        return {"success": True}

    # -- planning categories ----------------------------------------------

    @router.procedure("planningCategories.list")
    async def list_categories(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await categories.list_categories(
            policies.current_account_id(claims),
            include_disabled=bool(input_.get("includeDisabled")),
        )

    @router.procedure("planningCategories.create")
    async def create_category(input_: dict, claims: TokenClaims | None) -> dict:
        return await categories.create_category(
            policies.current_account_id(claims), input_
        )

    @router.procedure("planningCategories.update")
    async def update_category(input_: dict, claims: TokenClaims | None) -> dict:
        return await categories.update_category(
            policies.current_account_id(claims), input_
        )

    @router.procedure("planningCategories.delete")
    async def delete_category(input_: dict, claims: TokenClaims | None) -> dict:
        return await categories.delete_category(
            policies.current_account_id(claims),
            input_.get("id"),
            input_.get("reassignToId"),
        )

    @router.procedure("planningCategories.reorder")
    async def reorder_categories(
        input_: dict, claims: TokenClaims | None
    ) -> list[dict]:
        return await categories.reorder(
            policies.current_account_id(claims), input_.get("orderedIds") or []
        )

    @router.procedure("planningCategories.assign")
    async def assign_category(input_: dict, claims: TokenClaims | None) -> dict:
        return await categories.assign(
            policies.current_account_id(claims),
            input_.get("noteId"),
            input_.get("categoryId"),
        )

    @router.procedure("planningCategories.seedDefaults")
    async def seed_defaults(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await categories.seed_defaults(
            policies.current_account_id(claims), input_.get("names")
        )

    # -- tasks ------------------------------------------------------------

    @router.procedure("task.list")
    async def list_tasks(_input: dict, claims: TokenClaims | None) -> list[dict]:
        policies.require_superadmin(claims)
        return await tasks.list_tasks()

    @router.procedure("task.upsertTask")
    async def upsert_task(input_: dict, claims: TokenClaims | None) -> dict:
        policies.require_superadmin(claims)
        return await tasks.upsert_task(input_)
