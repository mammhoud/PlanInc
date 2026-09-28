"""``user.*`` procedures.

Mirrors ``server/routerTrpc/user.ts``: same procedure names, same input fields,
same output shapes. Where the TS version leaned on database transactions and
seed side effects, this slice performs the equivalent writes sequentially; the
seed itself belongs to slice S2.
"""

from __future__ import annotations

from typing import Any

from ..auth.jwt import TokenClaims
from ..domain import policies, totp
from ..domain.errors import DomainError
from ..domain.passwords import hash_password, verify_password
from ..domain.users import UserService
from ..transport.trpc import Router

LOW_PERMISSIONS = [
    "notes.upsert",
    "ai.completions",
    "users.list",
    "users.genTokenByUserId",
]


def register_user_router(router: Router, service: UserService) -> None:
    @router.procedure("users.login")
    async def login(input_: dict, _claims: TokenClaims | None) -> dict:
        name = str(input_.get("name", ""))
        password = str(input_.get("password", ""))
        return await service.login(name, password)

    @router.procedure("users.canRegister")
    async def can_register(_input: dict, _claims: TokenClaims | None) -> bool:
        return await service.can_register()

    @router.procedure("users.register")
    async def register(input_: dict, _claims: TokenClaims | None) -> bool:
        name = str(input_.get("name", ""))
        password = str(input_.get("password", ""))
        if not name or not password:
            raise DomainError("BAD_REQUEST", "name and password are required")
        count = await service.count()
        role = "superadmin" if count == 0 else "user"
        if count != 0:
            if not await service.can_register():
                raise DomainError("INTERNAL_SERVER_ERROR", "not allow register")
            if await service.by_name(name):
                raise DomainError("CONFLICT", "Username already exists")
        user = await service.create(name=name, password=password, role=role)
        await service.issue_and_store_api_token(user)
        return True

    @router.procedure("users.publicUserList")
    async def public_user_list(_input: dict, _claims: TokenClaims | None) -> list[dict]:
        users = await service.all()
        return [
            {
                "id": user["id"],
                "nickname": user.get("nickname") or "",
                "image": user.get("image") or None,
                "description": user.get("description") or None,
            }
            for user in users
        ]

    @router.procedure("users.list")
    async def list_users(_input: dict, claims: TokenClaims | None) -> list[dict]:
        policies.require_superadmin(claims)
        return await service.all()

    @router.procedure("users.nativeAccountList")
    async def native_account_list(
        _input: dict, claims: TokenClaims | None
    ) -> list[dict]:
        policies.require_authenticated(claims)
        users = await service.all()
        linked = {u["linkAccountId"] for u in users if u.get("linkAccountId")}
        return [
            {
                "id": u["id"],
                "name": u.get("name") or "",
                "nickname": u.get("nickname") or "",
            }
            for u in users
            if not u.get("loginType") and u["id"] not in linked
        ]

    @router.procedure("users.detail")
    async def detail(input_: dict, claims: TokenClaims | None) -> dict:
        current = policies.require_authenticated(claims)
        me = await service.by_id(int(current.sub))
        if me is None:
            raise DomainError("UNAUTHORIZED", "Current user not found")
        requested = input_.get("id") if isinstance(input_, dict) else None
        requested_id = int(requested) if requested is not None else int(current.sub)
        if requested_id != me["id"] and me.get("role") != "superadmin":
            raise DomainError("UNAUTHORIZED", "You can only view your own information")
        user = await service.by_id(requested_id)
        if user is None:
            raise DomainError("NOT_FOUND", "User not found")
        linked = await service.first_where(linkAccountId=requested_id)
        token = (user.get("apiToken") or "") if requested_id == me["id"] else ""
        return {
            "id": requested_id,
            "name": user.get("name") or "",
            "nickName": user.get("nickname") or "",
            "token": token,
            "loginType": user.get("loginType") or "",
            "isLinked": bool(linked),
            "image": user.get("image") or None,
            "role": user.get("role") or "",
        }

    @router.procedure("users.regenToken")
    async def regen_token(_input: dict, claims: TokenClaims | None) -> bool:
        current = policies.require_authenticated(claims)
        user = await service.by_id(int(current.sub))
        if user is None:
            return False
        await service.issue_and_store_api_token(user)
        return True

    @router.procedure("users.genLowPermToken")
    async def gen_low_perm_token(_input: dict, claims: TokenClaims | None) -> dict:
        current = policies.require_authenticated(claims)
        user = await service.by_id(int(current.sub))
        if user is None:
            raise DomainError("NOT_FOUND", "User not found")
        return {"token": service.api_token(user, LOW_PERMISSIONS)}

    @router.procedure("users.genTokenByUserId")
    async def gen_token_by_user_id(
        input_: dict, claims: TokenClaims | None
    ) -> list[dict]:
        policies.require_superadmin(claims)
        results: list[dict] = []
        for raw_id in input_.get("userIds", []) or []:
            user = await service.by_id(raw_id)
            if user is None:
                results.append(
                    {
                        "userId": raw_id,
                        "token": "",
                        "name": "",
                        "success": False,
                        "error": "User not found",
                    }
                )
                continue
            results.append(
                {
                    "userId": user["id"],
                    "token": service.api_token(user),
                    "name": user.get("name") or "",
                    "success": True,
                }
            )
        return results

    @router.procedure("users.linkAccount")
    async def link_account(input_: dict, claims: TokenClaims | None) -> bool:
        current = policies.require_authenticated(claims)
        target = await service.by_id(input_.get("id"))
        if target is None:
            raise DomainError("NOT_FOUND", "User not found")
        original = input_.get("originalPassword")
        if original and not _verify(original, target):
            raise DomainError("UNAUTHORIZED", "Password is incorrect")
        await service.update(int(current.sub), {"linkAccountId": target["id"]})
        return True

    @router.procedure("users.unlinkAccount")
    async def unlink_account(input_: dict, claims: TokenClaims | None) -> bool:
        policies.require_authenticated(claims)
        await service.update_where(
            {"linkAccountId": input_.get("id")}, {"linkAccountId": None}
        )
        return True

    @router.procedure("users.upsertUser")
    async def upsert_user(input_: dict, claims: TokenClaims | None) -> bool:
        current = policies.require_authenticated(claims)
        me = await service.by_id(int(current.sub))
        if me is None:
            raise DomainError("UNAUTHORIZED", "Current user not found")
        target_id = input_.get("id")
        if target_id is not None:
            target = await service.by_id(target_id)
            if target is None:
                raise DomainError("NOT_FOUND", "User not found")
            if target["id"] != me["id"] and me.get("role") != "superadmin":
                raise DomainError("FORBIDDEN", "You can only update your own account")
            update: dict[str, Any] = {}
            password = input_.get("password")
            if password:
                original = input_.get("originalPassword")
                if not original:
                    raise DomainError(
                        "BAD_REQUEST",
                        "Original password is required when changing password",
                    )
                if not _verify(original, target):
                    raise DomainError("UNAUTHORIZED", "Original password is incorrect")
                update["password"] = hash_password(password)
            for field in ("name", "nickname", "image"):
                if input_.get(field):
                    update[field] = input_[field]
            await service.update(target["id"], update)
            return True
        password = input_.get("password")
        if not password:
            raise DomainError("UNAUTHORIZED", "Password is required")
        user = await service.create(
            name=str(input_.get("name", "")), password=password, role="user"
        )
        await service.issue_and_store_api_token(user)
        return True

    @router.procedure("users.upsertUserByAdmin")
    async def upsert_user_by_admin(
        input_: dict, claims: TokenClaims | None
    ) -> bool:
        policies.require_superadmin(claims)
        target_id = input_.get("id")
        name = input_.get("name")
        if name and (
            target_id is None
            or (await service.by_id(target_id) or {}).get("name") != name
        ):
            if await service.by_name(name):
                raise DomainError("CONFLICT", "Username already exists")
        if target_id is not None:
            update: dict[str, Any] = {}
            if name:
                update["name"] = name
            if input_.get("password"):
                update["password"] = hash_password(input_["password"])
            if input_.get("nickname"):
                update["nickname"] = input_["nickname"]
            await service.update(target_id, update)
            return True
        password = input_.get("password")
        if not password:
            raise DomainError("UNAUTHORIZED", "Password is required")
        user = await service.create(
            name=str(name or ""), password=password, role="user"
        )
        await service.issue_and_store_api_token(user)
        return True

    @router.procedure("users.generate2FASecret")
    async def generate_2fa_secret(input_: dict, claims: TokenClaims | None) -> dict:
        policies.require_authenticated(claims)
        secret = totp.generate_secret()
        return {
            "secret": secret,
            "qrCode": totp.key_uri(str(input_.get("name", "")), secret),
        }

    @router.procedure("users.verify2FAToken")
    async def verify_2fa_token(input_: dict, claims: TokenClaims | None) -> bool:
        policies.require_authenticated(claims)
        if not totp.verify(str(input_.get("token", "")), str(input_.get("secret", ""))):
            raise DomainError("INTERNAL_SERVER_ERROR", "Invalid verification code")
        return True

    @router.procedure("users.deleteUser")
    async def delete_user(input_: dict, claims: TokenClaims | None) -> bool:
        current = policies.require_superadmin(claims)
        user = await service.by_id(input_.get("id"))
        if user is None:
            raise DomainError("NOT_FOUND", "User not found")
        if user.get("role") == "superadmin":
            raise DomainError("FORBIDDEN", "Cannot delete super admin account")
        if user["id"] == int(current.sub):
            raise DomainError("FORBIDDEN", "Cannot delete yourself")
        await service.delete_account_data(user["id"])
        await service.delete(user["id"])
        return True


def _verify(provided: str, target: dict) -> bool:
    return verify_password(provided, target.get("password") or "")
