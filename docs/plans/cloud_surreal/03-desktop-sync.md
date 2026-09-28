# Phase 3: cloud_surreal Desktop Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Tauri desktop client live server→client updates plus idempotent replay of offline mutations, so a device that was offline converges without duplicates.

**Architecture:** Server commits a durable outbox row with each write; a broadcaster pushes tenant/workspace-scoped events over a Robyn WebSocket at `/api/sync`; the client's existing offline queue (`frontend/src/store/planincStore.tsx`) replays through the normal tRPC procedures, each carrying an idempotency key the server dedupes.

**Tech Stack:** Robyn WebSocket, `surrealdb`, `pytest`.

**Spec:** [`00-index.md`](./00-index.md), [`02-feature-parity.md`](./02-feature-parity.md)

## Global Constraints

- WebSocket handshake authenticates with the same bearer JWT before joining any group.
- Groups are tenant/workspace scoped: `tenant_<schema>:workspace_<id>`.
- No global default tenant anywhere.
- Offline replay must be idempotent per key (Review Focus 5).

## Interfaces

```python
# app/sync/outbox.py
@dataclass(frozen=True)
class OutboxEvent:
    id: int
    tenant: str
    workspace_id: int
    event_type: str
    payload: dict
    published_at: datetime | None
async def emit(event_type: str, tenant: str, workspace_id: int, payload: dict, idempotency_key: str) -> None: ...
async def fetch_undelivered(tenant: str, limit: int = 100) -> list[OutboxEvent]: ...
async def mark_delivered(ids: list[int]) -> None: ...

# app/sync/channel.py
class SyncChannel:
    async def on_connect(self, request) -> None: ...        # verify JWT, read tenant/workspace
    async def on_message(self, ws, msg) -> None: ...
    async def broadcast(self, group: str, event: OutboxEvent) -> None: ...

# app/sync/idempotency.py
async def claim(key: str) -> bool: ...   # True if first time, False if duplicate
```

## Task Board

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| P3-1 | Outbox table + `emit`/`fetch_undelivered`/`mark_delivered`; committed with each domain write | Phase 2 S2 | Pending |
| P3-2 | `/api/sync` WebSocket: handshake JWT, group join, workspace membership check | P3-1 | Pending |
| P3-3 | Broadcaster loop: undelivered outbox → group push → `mark_delivered` | P3-2 | Pending |
| P3-4 | `claim(key)` idempotency store keyed per tenant; wrap mutations that replay | P3-1 | Pending |
| P3-5 | Client: reconnect/backoff + replay wiring in `frontend/src/store/planincStore.tsx` | P3-4 | Pending |
| P3-6 | Tests: two clients see one write; offline queue replays twice → one note | P3-5 | Pending |

## Required Tests

- Handshake authentication: missing/expired token rejected before group join.
- Tenant group isolation: tenant A's event never reaches tenant B.
- Membership filtering: a client requesting a non-member workspace is rejected.
- **Review Focus 5:** replaying the same queued mutation twice yields one persisted note and one outbox event.
- Reconnect after a server restart resumes delivery.

## Exit Gate

Two clients see a write within the same session; an offline queue replays idempotently; tenant isolation tests pass; reconnect works after a restart.
