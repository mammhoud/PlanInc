from typing import Protocol


class EventSink(Protocol):
    def enqueue(
        self,
        *,
        tenant,
        event_type: str,
        aggregate_type: str,
        aggregate_id: str | int,
        payload: dict,
        idempotency_key: str,
    ):
        """Persist an event for post-commit delivery."""

