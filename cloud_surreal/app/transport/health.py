"""Liveness endpoint."""

from __future__ import annotations

from typing import Any


async def health(_request: Any) -> dict:
    return {"status": "ok"}
