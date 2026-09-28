"""Minimal superjson codec.

The frontend tRPC client is configured with `superjson`, so inputs arrive and
outputs must leave wrapped as `{"json": ..., "meta": ...}`. This codec handles
plain JSON and `datetime` revival, which covers the PlanInc payloads; the
`{json, meta}` envelope is always honoured so the client can deserialize.

Byte-parity with the reference superjson implementation is pinned by the
captured fixtures in `tests/fixtures/trpc` (see Phase 1 Task 6).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

_ROOT = "."


class SuperJson:
    """Encode/decode the `{json, meta}` envelope with date support."""

    @staticmethod
    def is_envelope(value: Any) -> bool:
        return (
            isinstance(value, dict)
            and "json" in value
            and set(value.keys()) <= {"json", "meta"}
        )

    @staticmethod
    def decode(value: Any) -> Any:
        if SuperJson.is_envelope(value):
            return SuperJson._revive(value["json"], value.get("meta") or {})
        return value

    @staticmethod
    def encode(value: Any) -> dict:
        values: dict[str, list[str]] = {}
        plain = SuperJson._plain(value, _ROOT, values)
        if values:
            return {"json": plain, "meta": {"values": values}}
        return {"json": plain}

    # -- encoding ---------------------------------------------------------

    @staticmethod
    def _plain(value: Any, path: str, values: dict[str, list[str]]) -> Any:
        if isinstance(value, datetime):
            values[path] = ["Date"]
            return SuperJson._iso(value)
        if isinstance(value, dict):
            return {
                key: SuperJson._plain(child, SuperJson._join(path, key), values)
                for key, child in value.items()
            }
        if isinstance(value, (list, tuple)):
            return [
                SuperJson._plain(child, SuperJson._join(path, str(index)), values)
                for index, child in enumerate(value)
            ]
        return value

    @staticmethod
    def _iso(value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )

    @staticmethod
    def _join(path: str, key: str) -> str:
        return key if path == _ROOT else f"{path}.{key}"

    # -- decoding ---------------------------------------------------------

    @staticmethod
    def _revive(value: Any, meta: dict) -> Any:
        values = meta.get("values") or {}
        if not values:
            return value
        for path, kinds in values.items():
            if "Date" in kinds:
                if path == _ROOT:
                    return SuperJson._parse(value)
                SuperJson._assign(value, path)
        return value

    @staticmethod
    def _assign(root: Any, path: str) -> None:
        parts = [] if path == _ROOT else path.split(".")
        if not parts:
            # Root replacement is handled by the caller; nothing to mutate.
            return
        target = root
        for part in parts[:-1]:
            target = target[int(part)] if isinstance(target, list) else target[part]
        last = parts[-1]
        if isinstance(target, list):
            target[int(last)] = SuperJson._parse(target[int(last)])
        else:
            target[last] = SuperJson._parse(target[last])

    @staticmethod
    def _parse(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return value
        return value
