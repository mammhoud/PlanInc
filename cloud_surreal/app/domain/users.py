"""Account (identity) domain service.

Ports the business rules of ``server/routerTrpc/user.ts`` and the local login
path of ``server/routerExpress/auth``. The service owns every read and write on
the ``accounts`` table and mints API/session tokens; routers only translate
procedure names and inputs.

Reads load the account table and filter in Python. Accounts are small and
bounded per instance, and filtering here keeps the id normalisation (numeric,
never ``accounts:5``) in one place until a later slice pushes predicates into
query parameters.
"""

from __future__ import annotations

from typing import Any

from ..auth.jwt import issue_api_token, issue_session_token
from ..db.ids import next_id
from .errors import DomainError
from .passwords import hash_password, verify_password

ACCOUNTS = "accounts"
API_TOKEN_FIELDS = ("id", "name", "nickname", "role", "image", "loginType")


def normalize_id(value: Any) -> int | None:
    """Turn ``accounts:5`` / ``5`` / record objects into the numeric id."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value)
    if ":" in text:
        text = text.rsplit(":", 1)[1]
    try:
        return int(text)
    except ValueError:
        return None


def normalize_account(row: dict) -> dict:
    record = dict(row)
    record["id"] = normalize_id(record.get("id"))
    return record


class UserService:
    def __init__(self, client: Any, jwt_secret: str) -> None:
        self._client = client
        self._secret = jwt_secret

    # -- reads ------------------------------------------------------------

    async def all(self) -> list[dict]:
        rows = await self._client.select(ACCOUNTS)
        return [normalize_account(row) for row in rows]

    async def count(self) -> int:
        return len(await self.all())

    async def by_id(self, account_id: Any) -> dict | None:
        target = normalize_id(account_id)
        if target is None:
            return None
        for row in await self.all():
            if row["id"] == target:
                return row
        return None

    async def by_name(self, name: str) -> dict | None:
        for row in await self.all():
            if row.get("name") == name:
                return row
        return None

    async def first_where(self, **equals: Any) -> dict | None:
        for row in await self.all():
            if all(row.get(key) == value for key, value in equals.items()):
                return row
        return None

    async def config_value(self, key: str) -> Any:
        """Best-effort global config read.

        Config is owned by slice S5; identity only needs the few keys that
        decide registration and 2FA. S5 replaces this with its own service.
        """
        rows = await self._client.select("config")
        for row in rows:
            if row.get("key") == key:
                config = row.get("config") or {}
                if isinstance(config, dict):
                    return config.get("value")
                return config
        return None

    # -- writes -----------------------------------------------------------

    async def create(
        self,
        *,
        name: str,
        password: str | None = None,
        role: str = "user",
        nickname: str | None = None,
        login_type: str = "",
        image: str | None = None,
    ) -> dict:
        account_id = await next_id(self._client, ACCOUNTS)
        record: dict[str, Any] = {
            "name": name,
            "nickname": nickname if nickname is not None else name,
            "role": role,
            "loginType": login_type,
        }
        # OAuth accounts have no password; the TS server leaves the field unset.
        if password is not None:
            record["password"] = hash_password(password)
        if image is not None:
            record["image"] = image
        created = await self._client.create(f"{ACCOUNTS}:{account_id}", record)
        if isinstance(created, list):
            created = created[0] if created else record
        return normalize_account({**record, **(created or {})})

    async def update(self, account_id: Any, data: dict) -> dict:
        record = await self.by_id(account_id)
        if record is None:
            raise DomainError("NOT_FOUND", "User not found")
        await self._client.update(f"{ACCOUNTS}:{record['id']}", data)
        return normalize_account({**record, **data})

    async def update_where(self, match: dict, data: dict) -> int:
        changed = 0
        for row in await self.all():
            if all(row.get(key) == value for key, value in match.items()):
                await self._client.update(f"{ACCOUNTS}:{row['id']}", data)
                changed += 1
        return changed

    async def delete(self, account_id: Any) -> None:
        target = normalize_id(account_id)
        if target is None:
            raise DomainError("NOT_FOUND", "User not found")
        await self._client.delete(f"{ACCOUNTS}:{target}")

    async def delete_where(self, table: str, match: dict) -> int:
        removed = 0
        rows = await self._client.select(table)
        for raw in rows:
            row = normalize_account(raw)
            if all(row.get(key) == value for key, value in match.items()):
                await self._client.delete(f"{table}:{row['id']}")
                removed += 1
        return removed

    async def delete_account_data(self, account_id: Any) -> None:
        """Purge rows owned by an account across the identity-adjacent tables.

        Notes are owned by slice S2 and are removed by its delete routine; this
        clears the tables identity itself writes so a deleted account leaves no
        dangling rows behind.
        """
        for table, field in (
            ("config", "userId"),
            ("noteInternalShare", "accountId"),
            ("follows", "accountId"),
            ("notifications", "accountId"),
            ("conversation", "accountId"),
        ):
            await self.delete_where(table, {field: account_id})

    # -- tokens -----------------------------------------------------------

    def session_token(self, user: dict, two_factor_verified: bool = False) -> str:
        return issue_session_token(
            self._secret,
            user_id=user["id"],
            name=user.get("name") or "",
            role=user.get("role") or "user",
            two_factor_verified=two_factor_verified,
        )

    def api_token(self, user: dict, permissions: list[str] | None = None) -> str:
        return issue_api_token(
            self._secret,
            user_id=user["id"],
            name=user.get("name") or "",
            role=user.get("role") or "user",
            permissions=permissions,
        )

    async def issue_and_store_api_token(self, user: dict) -> str:
        token = self.api_token(user)
        await self.update(user["id"], {"apiToken": token})
        return token

    # -- rules ------------------------------------------------------------

    async def can_register(self) -> bool:
        if await self.count() == 0:
            return True
        return await self.config_value("isAllowRegister") is True

    async def two_factor_enabled(self) -> bool:
        return await self.config_value("twoFactorEnabled") is True

    async def two_factor_secret(self) -> str:
        return str(await self.config_value("twoFactorSecret") or "")

    async def find_or_create_oauth_user(self, profile: dict) -> dict:
        """Find the OAuth account for a profile, creating it on first sign-in.

        Mirrors ``handleOAuthCallback``: existing accounts get their avatar
        refreshed, a linked account resolves to the real user, and a new
        ``loginType: 'oauth'`` account is created otherwise.
        """
        username = str(profile.get("username") or profile.get("externalId") or "")
        user = await self.first_where(name=username, loginType="oauth")
        if user is None:
            return await self.create(
                name=username,
                role="user",
                nickname=username,
                login_type="oauth",
                image=profile.get("image") or "",
            )
        if profile.get("image") and profile["image"] != user.get("image"):
            user = await self.update(user["id"], {"image": profile["image"]})
        if user.get("linkAccountId"):
            linked = await self.by_id(user["linkAccountId"])
            if linked is not None:
                user = linked
        return user

    async def authenticate(self, name: str, password: str) -> dict:
        """Verify name+password; raise the same errors the TS login path does."""
        user = await self.by_name(name)
        if user is None:
            raise DomainError("NOT_FOUND", "user not found")
        if not verify_password(password, user.get("password") or ""):
            raise DomainError("UNAUTHORIZED", "password is incorrect")
        if await self.two_factor_enabled():
            raise DomainError(
                "PRECONDITION_FAILED",
                "two factor required",
                200,
                user_id=user["id"],
            )
        return user

    async def login(self, name: str, password: str) -> dict:
        """Authenticate and return the public login payload with a token."""
        user = await self.authenticate(name, password)
        token = await self.issue_and_store_api_token(user)
        return {
            "id": user["id"],
            "name": user.get("name") or "",
            "nickname": user.get("nickname") or "",
            "role": user.get("role") or "user",
            "token": token,
            "image": user.get("image"),
            "loginType": user.get("loginType") or "",
        }
