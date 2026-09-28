"""``tags.*`` / ``comments.*`` procedures (S2b).

``tags.list`` plus the seven mutations ported from ``server/routerTrpc/tag.ts``;
they depend on the S2t derivation service. Attachments moved to
``routers/attachment.py`` in S4.
"""

from __future__ import annotations

from ..auth.jwt import TokenClaims
from ..domain import policies
from ..domain.collections import CommentService, TagService
from ..transport.trpc import Router


def register_collection_routers(
    router: Router,
    tags: TagService,
    comments: CommentService,
) -> None:
    @router.procedure("tags.list")
    async def list_tags(_input: dict, claims: TokenClaims | None) -> list[dict]:
        return await tags.list_for_account(policies.current_account_id(claims))

    @router.procedure("tags.fullTagNameById")
    async def full_tag_name(input_: dict, claims: TokenClaims | None) -> str:
        return await tags.full_name(
            input_.get("id"), policies.current_account_id(claims)
        )

    @router.procedure("tags.updateTagMany")
    async def update_tag_many(input_: dict, claims: TokenClaims | None) -> bool:
        return await tags.update_tag_many(
            policies.current_account_id(claims),
            input_.get("ids") or [],
            str(input_.get("tag") or ""),
        )

    @router.procedure("tags.updateTagName")
    async def update_tag_name(input_: dict, claims: TokenClaims | None) -> bool:
        return await tags.update_tag_name(
            input_.get("id"),
            policies.current_account_id(claims),
            str(input_.get("oldName") or ""),
            str(input_.get("newName") or ""),
        )

    @router.procedure("tags.updateTagIcon")
    async def update_tag_icon(input_: dict, claims: TokenClaims | None) -> dict:
        return await tags.update_icon(
            input_.get("id"),
            policies.current_account_id(claims),
            str(input_.get("icon") or ""),
        )

    @router.procedure("tags.updateTagOrder")
    async def update_tag_order(input_: dict, claims: TokenClaims | None) -> dict:
        return await tags.update_order(
            input_.get("id"),
            policies.current_account_id(claims),
            int(input_.get("sortOrder") or 0),
        )

    @router.procedure("tags.deleteOnlyTag")
    async def delete_only_tag(input_: dict, claims: TokenClaims | None) -> bool:
        return await tags.delete_only_tag(
            input_.get("id"), policies.current_account_id(claims)
        )

    @router.procedure("tags.deleteTagWithAllNote")
    async def delete_tag_with_all_note(
        input_: dict, claims: TokenClaims | None
    ) -> bool:
        return await tags.delete_tag_with_all_notes(
            input_.get("id"), policies.current_account_id(claims)
        )

    @router.procedure("comments.list")
    async def list_comments(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await comments.list_for_account(
            policies.current_account_id(claims), input_.get("noteId")
        )

    @router.procedure("comments.create")
    async def create_comment(input_: dict, claims: TokenClaims | None) -> bool:
        return await comments.create(policies.current_account_id(claims), input_)

    @router.procedure("comments.delete")
    async def delete_comment(input_: dict, claims: TokenClaims | None) -> dict:
        return await comments.delete(
            input_.get("id"), policies.current_account_id(claims)
        )
