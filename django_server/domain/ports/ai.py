"""AI chat transport boundary.

Provider credential encryption lives in ``domain.ports.secrets``; this module
only turns a resolved provider + plaintext secret into a completion so the
network dependency stays in one swappable place.
"""

from __future__ import annotations

from domain.errors import ConfigurationError, ErrorCode, ServiceError


class ProviderTransportError(ServiceError):
    """Raised when a provider call cannot be completed."""

    code = ErrorCode.INTERNAL
    status = 502
    default_message = "The AI provider call failed."


def complete(
    *,
    provider,
    secret: str,
    model: str = "",
    messages: list | None = None,
    timeout: int = 30,
) -> dict:
    """Run a chat completion through the provider transport.

    Only the ``local`` kind is executable in-process; every external kind
    requires a configured transport (added in the runtime integration slice)
    and otherwise fails loudly instead of silently succeeding.
    """
    messages = messages or []
    if provider.kind == "local":
        last = next(
            (
                message.get("content", "")
                for message in reversed(messages)
                if message.get("role") == "user"
            ),
            "",
        )
        content = f"[local:{model or 'default'}] {last}".strip()
        return {
            "content": content,
            "model": model,
            "usage": {
                "prompt_tokens": sum(
                    len(str(message.get("content", ""))) // 4 for message in messages
                ),
                "completion_tokens": len(content) // 4,
            },
        }
    raise ConfigurationError(
        f"No chat transport is configured for provider kind '{provider.kind}'."
    )
