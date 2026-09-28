"""``notes.*`` procedures (slice S2a).

Mirrors the account-scoped subset of ``server/routerTrpc/note.ts`` that slice S2
owns: list/detail/upsert/recycle/reference/review. Share-link and history
procedures belong to later slices.
"""

from __future__ import annotations

from ..auth.jwt import TokenClaims
from ..domain import policies
from ..domain.notes import NoteService
from ..transport.trpc import Router


def register_note_router(router: Router, service: NoteService) -> None:
    @router.procedure("notes.list")
    async def list_notes(input_: dict, claims: TokenClaims | None) -> list[dict]:
        account_id = policies.current_account_id(claims)
        return await service.list_for_account(
            account_id,
            include_recycle=bool(input_.get("isRecycle")),
            search=input_.get("searchText") or input_.get("search"),
            type_=input_.get("type"),
            category_id=input_.get("categoryId"),
            tag_id=input_.get("tagId"),
            limit=input_.get("limit"),
        )

    @router.procedure("notes.detail")
    async def detail(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.get(input_.get("id"), policies.current_account_id(claims))

    @router.procedure("notes.publicDetail")
    async def public_detail(input_: dict, _claims: TokenClaims | None) -> dict | None:
        return await service.public_detail(input_.get("id"))

    @router.procedure("notes.listByIds")
    async def list_by_ids(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await service.list_by_ids(
            input_.get("ids") or [], policies.current_account_id(claims)
        )

    @router.procedure("notes.upsert")
    async def upsert(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.upsert(policies.current_account_id(claims), input_)

    @router.procedure("notes.updateMany")
    async def update_many(input_: dict, claims: TokenClaims | None) -> dict:
        changed = await service.update_many(
            input_.get("ids") or [],
            policies.current_account_id(claims),
            input_.get("data") or {},
        )
        return {"count": changed}

    @router.procedure("notes.trashMany")
    async def trash_many(input_: dict, claims: TokenClaims | None) -> dict:
        changed = await service.trash_many(
            input_.get("ids") or [], policies.current_account_id(claims)
        )
        return {"count": changed}

    @router.procedure("notes.deleteMany")
    async def delete_many(input_: dict, claims: TokenClaims | None) -> dict:
        changed = await service.delete_many(
            input_.get("ids") or [], policies.current_account_id(claims)
        )
        return {"count": changed}

    @router.procedure("notes.clearRecycleBin")
    async def clear_recycle_bin(
        _input: dict, claims: TokenClaims | None
    ) -> dict:
        removed = await service.clear_recycle_bin(policies.current_account_id(claims))
        return {"count": removed}

    @router.procedure("notes.noteReferenceList")
    async def note_reference_list(
        input_: dict, claims: TokenClaims | None
    ) -> list[dict]:
        return await service.reference_list(
            input_.get("noteId"),
            str(input_.get("type") or "references"),
            policies.current_account_id(claims),
        )

    @router.procedure("notes.addReference")
    async def add_reference(input_: dict, claims: TokenClaims | None) -> bool:
        return await service.add_reference(
            input_.get("fromNoteId") or input_.get("noteId"),
            input_.get("toNoteId"),
            policies.current_account_id(claims),
        )

    @router.procedure("notes.removeReference")
    async def remove_reference(input_: dict, claims: TokenClaims | None) -> bool:
        return await service.remove_reference(
            input_.get("fromNoteId") or input_.get("noteId"),
            input_.get("toNoteId"),
            policies.current_account_id(claims),
        )

    @router.procedure("notes.relatedNotes")
    async def related_notes(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await service.related(
            input_.get("id"), policies.current_account_id(claims)
        )

    @router.procedure("notes.reviewNote")
    async def review_note(input_: dict, claims: TokenClaims | None) -> dict:
        reviewed = input_.get("reviewed", True)
        return await service.review(
            input_.get("id"), policies.current_account_id(claims), bool(reviewed)
        )

    @router.procedure("notes.reviewStats")
    async def review_stats(_input: dict, claims: TokenClaims | None) -> dict:
        return await service.review_stats(policies.current_account_id(claims))

    @router.procedure("notes.dailyReviewNoteList")
    async def daily_review_note_list(
        _input: dict, claims: TokenClaims | None
    ) -> list[dict]:
        return await service.daily_review_list(policies.current_account_id(claims))

    @router.procedure("notes.randomNoteList")
    async def random_note_list(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await service.random_list(
            policies.current_account_id(claims), int(input_.get("limit") or 30)
        )

    @router.procedure("notes.publicList")
    async def public_list(input_: dict, _claims: TokenClaims | None) -> list[dict]:
        return await service.public_list(
            page=int(input_.get("page") or 1),
            size=int(input_.get("size") or 30),
            search=str(input_.get("searchText") or "") or None,
        )

    @router.procedure("notes.getNoteHistory")
    async def get_note_history(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await service.history(
            input_.get("noteId") or input_.get("id"),
            policies.current_account_id(claims),
        )

    @router.procedure("notes.shareNote")
    async def share_note(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.share_note(
            input_.get("id"),
            policies.current_account_id(claims),
            is_cancel=bool(input_.get("isCancel")),
            password=input_.get("password"),
            expire_at=input_.get("expireAt"),
        )

    @router.procedure("notes.internalShareNote")
    async def internal_share_note(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.internal_share_note(
            input_.get("id"),
            policies.current_account_id(claims),
            input_.get("accountIds") or [],
            is_cancel=bool(input_.get("isCancel")),
        )

    @router.procedure("notes.getInternalSharedUsers")
    async def get_internal_shared_users(
        input_: dict, claims: TokenClaims | None
    ) -> list[dict]:
        return await service.internal_shared_users(
            input_.get("id"), policies.current_account_id(claims)
        )

    @router.procedure("notes.updateNotesOrder")
    async def update_notes_order(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.update_notes_order(
            policies.current_account_id(claims), input_.get("updates") or []
        )

    @router.procedure("notes.updateAttachmentsOrder")
    async def update_attachments_order(
        input_: dict, claims: TokenClaims | None
    ) -> dict:
        return await service.update_attachments_order(
            policies.current_account_id(claims), input_.get("attachments") or []
        )
