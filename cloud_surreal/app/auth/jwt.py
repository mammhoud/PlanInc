"""JWT verification for the existing PlanInc token contract.

Claims match `server/lib/helper.ts` `generateToken`: sub, name, role, exp, iat,
HS256, signed with NEXTAUTH_SECRET.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import jwt


class AuthError(Exception):
    """Raised when a token is missing, malformed, expired, or lacks claims."""


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    name: str
    role: str
    exp: int
    iat: int


def verify_token(token: str, secret: str) -> TokenClaims:
    if not token:
        raise AuthError("missing token")
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc
    try:
        return TokenClaims(
            sub=str(payload["sub"]),
            name=str(payload.get("name", "")),
            role=str(payload["role"]),
            exp=int(payload["exp"]),
            iat=int(payload["iat"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthError("token is missing required claims") from exc


def issue_token(claims: TokenClaims, secret: str) -> str:
    return jwt.encode(
        {
            "sub": claims.sub,
            "name": claims.name,
            "role": claims.role,
            "exp": claims.exp,
            "iat": claims.iat,
        },
        secret,
        algorithm="HS256",
    )


def issue_api_token(
    secret: str,
    user_id: int | str,
    name: str,
    role: str,
    permissions: list[str] | None = None,
) -> str:
    """Mint an API token with the exact claim shape of ``generateApiToken``.

    That function signs ``role/name/sub/exp/iat`` (plus optional
    ``permissions``) with a ~100-year expiry and no explicit algorithm, which
    defaults to HS256. ``issue_session_token`` stays separate because login
    tokens carry ``twoFactorVerified`` and a 30-day expiry instead.
    """
    now = int(time.time())
    payload: dict = {
        "role": role,
        "name": name,
        "sub": str(user_id),
        "exp": now + (60 * 60 * 24 * 365 * 100),
        "iat": now,
    }
    if permissions is not None:
        payload["permissions"] = permissions
    return jwt.encode(payload, secret, algorithm="HS256")


def issue_session_token(
    secret: str,
    user_id: int | str,
    name: str,
    role: str,
    two_factor_verified: bool = False,
) -> str:
    """Mint a login token matching ``generateToken`` (30-day expiry)."""
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user_id),
            "name": name,
            "role": role or "user",
            "twoFactorVerified": two_factor_verified,
            "exp": now + (60 * 60 * 24 * 30),
            "iat": now,
        },
        secret,
        algorithm="HS256",
    )
