"""``attachments.*`` procedures (slice S4)."""

from __future__ import annotations

from ..auth.jwt import TokenClaims
from ..domain import policies
from ..domain.files import AttachmentService
from ..transport.trpc import Router


def register_attachment_router(router: Router, service: AttachmentService) -> None:
    @router.procedure("attachments.list")
    async def list_attachments(input_: dict, claims: TokenClaims | None) -> list[dict]:
        return await service.list_for_account(
            policies.current_account_id(claims), input_.get("noteId")
        )

    @router.procedure("attachments.createFolder")
    async def create_folder(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.create_folder(
            policies.current_account_id(claims),
            str(input_.get("folderName") or ""),
            input_.get("parentFolder"),
        )

    @router.procedure("attachments.rename")
    async def rename(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.rename(policies.current_account_id(claims), input_)

    @router.procedure("attachments.move")
    async def move(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.move(
            policies.current_account_id(claims),
            input_.get("sourceIds") or [],
            str(input_.get("targetFolder") or ""),
        )

    @router.procedure("attachments.delete")
    async def delete(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.delete(
            policies.current_account_id(claims),
            input_.get("id"),
            bool(input_.get("isFolder")),
            input_.get("folderPath"),
        )

    @router.procedure("attachments.deleteMany")
    async def delete_many(input_: dict, claims: TokenClaims | None) -> dict:
        return await service.delete_many(
            policies.current_account_id(claims), input_.get("ids") or []
        )
