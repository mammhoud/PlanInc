"""Session JWT authority shared with the TypeScript server.

Claims shape matches ``server/lib/helper.ts`` generateToken exactly
(``sub/name/role/exp/iat``, HS256) so TS ``verifyToken()`` accepts
Django-issued tokens with zero TS changes. The secret MUST equal the TS
secret: it reads ``process.env.JWT_SECRET`` first, else the Surreal config
``JWT_SECRET``. Copy that same value into ``JWT_SECRET`` here.
"""

import time

import jwt
from django.conf import settings


def get_jwt_secret() -> str:
    secret = (settings.PLANINC_JWT_SECRET or "").strip()
    if not secret:
        raise ValueError(
            "PLANINC_JWT_SECRET/JWT_SECRET is not set; "
            "refusing to issue tokens that nobody can verify."
        )
    return secret


def role_for_user(user) -> str:
    if getattr(user, "is_superuser", False):
        return "superadmin"
    return "user"


def issue_session_token(user, role: str | None = None) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "sub": str(user.pk),
            "name": getattr(user, "username", "") or "",
            "role": role or role_for_user(user),
            "exp": now + int(settings.PLANINC_JWT_TTL_SECONDS),
            "iat": now,
        },
        get_jwt_secret(),
        algorithm="HS256",
    )


def verify_session_token(token: str):
    return jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
