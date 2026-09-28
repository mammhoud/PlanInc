"""Domain errors.

Carry the tRPC error code the transport must emit, so services raise intent and
the transport stays a thin translator. Codes match ``@trpc/server``.
"""

from __future__ import annotations

# TRPCError code -> HTTP status, mirroring the TS server's usage.
_STATUS_BY_CODE = {
    "BAD_REQUEST": 400,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "CONFLICT": 409,
    "INTERNAL_SERVER_ERROR": 500,
}


class DomainError(Exception):
    """A rule violation with a tRPC code and human-readable message."""

    def __init__(
        self,
        code: str,
        message: str,
        status: int | None = None,
        user_id: int | str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status if status is not None else _STATUS_BY_CODE.get(code, 400)
        self.user_id = user_id
