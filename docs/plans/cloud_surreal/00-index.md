# cloud_surreal Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two backend implementations (`server/` Bun/Express/tRPC and `django_server/` Django) with one Python service, `cloud_surreal/`, built on Robyn, using the existing embedded SurrealKV data file as the datastore, preserving the current frontend contracts unchanged, and adding realtime + offline sync for the Tauri desktop app plus SurrealDB-backed AI features.

**Architecture:** A single Robyn process serves a tRPC-compatible transport at `/api/trpc`, the Express-compatible surfaces (`/api/auth`, `/api/file`, `/api/openai`, `/api/mcp`, `/api/sync`, `/api/rss`), the PlanInc AI Hub at `/plan`, and a WebSocket sync channel. A supervised `surreal` binary (file-backed `surrealkv://…planinc.db`, no separate database container) is the datastore; a thin Python `SurrealClient` is the only module that touches it. All tenant scoping, auth, and business rules live in `domain/` services; routers validate transport input and call services.

**Tech Stack:** Python 3.11+, Robyn (HTTP + WebSocket), `surrealdb` Python SDK (client), `python-jose`/`PyJWT` for the existing JWT claim contract, Docker, `pytest`.

## ⚠️ Reconciliation with `django-bolt` — open owner decision (2026-09-28)

<!-- AI-generated: review needed -->
This program and [`../django-bolt/00-index.md`](../django-bolt/00-index.md)
**claim the same target and contradict each other in three ways.** They cannot
both be executed; one must be named the owner of the PlanInc Python cutover.

| | `cloud_surreal` (this plan) | `django-bolt` |
| --- | --- | --- |
| Framework | Robyn only — *"No Django, no django-bolt, no django-fusion, no Django ORM"* | Django ASGI + django-bolt + django-fusion |
| Datastore | embedded SurrealKV `planinc.db` — *"No PostgreSQL"* | PostgreSQL + Redis + Channels |
| Scope of replacement | replaces **both** `server/` and `django_server/` | replaces `server/`, extends `django_server/` |
| Evidence | generated route matrix (90/185), 260 passing tests, Phase 1 complete, S2t/S2 tag surface complete | workstreams A–D implemented; E1/E2 pending, A4/E3–E5 blocked externally, E6 needs approval |

The third contradiction is stated in this repo's own files:
[`05-implementation-task-board.md`](./05-implementation-task-board.md) and
[`06-cutover-parity-and-sync.md`](./06-cutover-parity-and-sync.md) say **"Django
is superseded… an archive candidate"**, while
[`../../../docs/plans/README.md`](../../../docs/plans/README.md) (the structa.cloud
registry) records **`django-bolt` as the authoritative PlanInc plan** and calls
this program's Tauri/Rust phases parked.

**Status: OPEN — requires the owner.** No agent should silently pick one, because
the choice decides the framework, the datastore, and which tree is archived. A
recommendation, not a decision: this plan carries the only executed evidence
today (route matrix + green suite), and its "Robyn only" constraint is the
cheaper path *if* the embedded-SurrealKV single-writer caveat is acceptable;
`django-bolt` is the stronger choice *if* multi-user PostgreSQL/Redis durability
is required. Record the answer here and in the registry, then delete the losing
plan (git history is the archive).

**Spec:** This file is the spec. Phase plans live beside it:
- [`01-foundation-and-runtime.md`](./01-foundation-and-runtime.md)
- [`02-feature-parity.md`](./02-feature-parity.md)
- [`03-desktop-sync.md`](./03-desktop-sync.md)
- [`04-ai-and-surreal.md`](./04-ai-and-surreal.md)
- [`05-implementation-task-board.md`](./05-implementation-task-board.md)

## Global Constraints

- **Framework:** Robyn only. No Django, no django-bolt, no django-fusion, no Django ORM, no Express/tRPC server in the production stack after cutover.
- **Datastore:** SurrealKV file at `/app/data/planinc.db` (`PLANINC_DB_FILE`), same file the source stack uses. No PostgreSQL, no `DATABASE_URL`, no separate SurrealDB container (`verify-surrealdb.sh` rule 2 stays true).
- **Auth:** Reuse the existing JWT claim shape (`sub`, `name`, `role`, `exp`, `iat`) signed with `NEXTAUTH_SECRET`. The frontend `Authorization: Bearer <token>` contract is unchanged.
- **Frontend contract:** `frontend/` must keep working without a rewrite. `frontend/src/lib/trpc.ts` (`/api/trpc`, superjson, batched, `skipBatch`) and `frontend/src/lib/planincEndpoint.ts` (Tauri endpoint override) are the contract of record.
- **i18n:** No new frontend user-facing strings in backend work. Any string a client renders must reuse existing keys (PI-009 locale-parity rule).
- **Port:** `1111` (matches `PLANINC_PORT`).
- **Working rules:** every phase plan is a vertical slice with tests; do not delete the legacy `server/` or `django_server/` until the cutover gate passes.

## Datastore Decision (verified in Phase 1)

`surrealdb` 2.0's Python SDK exposes `AsyncEmbeddedSurrealConnection`, so
cloud_surreal embeds SurrealKV **in-process** against the same `planinc.db` file:
no `surreal` binary, no child process, no database container. This satisfies both
the "Robyn" and "keep embedded SurrealKV" decisions directly. Verified during
Phase 1 execution: writes persist across separate process opens.

**Caveat:** the embedded connection can abort at interpreter shutdown (a Rust
panic after the data is committed). Data is unaffected; `cloud_surreal` isolates
its integration test in a subprocess and does not call `close()` on request paths.
Re-check on every SDK upgrade.

## PlanInc AI Hub (`/plan`) — defined

`/plan` is the **single AI entry point** for PlanInc: one versioned
Robyn router mounted at `/plan`, backed entirely by SurrealDB, that the web and
Tauri clients call for every AI feature. This is the integration target named in
the original request ("check features of ai at surreal db to be integrated with
/plan").

- **Module:** `cloud_surreal/app/plan/`; router assembled in `app/routers/plan.py`.
- **Auth:** the same bearer JWT + tenant scope as `/api/trpc`; no anonymous access.
- **Data:** the Phase 4 AI tables (`ai_provider`, `ai_model`, `agent`,
  `ai_conversation`, `ai_message`, `ai_run`, `ai_usage`, `embedding`).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/plan/health` | AI subsystem readiness (providers configured, tables present) |
| POST | `/plan/chat` | One agent turn: creates conversation/message/run, returns the reply |
| GET | `/plan/conversations` | List the caller's conversations (tenant-scoped) |
| POST | `/plan/runs` | Start a named run against a selected model |
| POST | `/plan/search` | Permission-filtered embedding search over notes/resources |
| GET/PUT | `/plan/providers` | Read/update provider config (admin only; never returns secrets) |
| WS | `/plan/stream` | Streaming-token channel; same auth handshake as `/api/sync` |

Rationale: the request paired AI features with `/plan`, and a single AI surface is
the only reading that makes "integrated with `/plan`" a concrete deliverable rather
than a synonym for the existing `ai` tRPC router. The decision is reversible: the
router can be re-pointed or renamed without touching the AI services, which stay in
`app/ai/`.

## Open Decisions

1. Whether the tRPC wire transport is implemented in Robyn (keeps the frontend unchanged) or the client gains a REST adapter. This plan assumes the former; Phase 1 Task 6 pins the wire format with captured fixtures.
2. Retention window for the legacy `server/` deployment after cutover.

## Phase Overview

| Phase | Plan | Delivers | Gate |
| --- | --- | --- | --- |
| 1 | 01 Foundation and runtime | Robyn app, SurrealClient, JWT verify, tRPC transport, health, Docker | `pytest` green; a batched superjson call to a stub router round-trips |
| 2 | 02 Feature parity | All 28 tRPC routers, `auth`/`file`/`openai`/`mcp`/`sync`/`rss` routes, AI server | Route matrix has no unowned frontend call; contract tests for each router |
| 3 | 03 Desktop sync | WebSocket channel + offline outbox replay | Two clients see a write; an offline queue replays idempotently |
| 4 | 04 AI and SurrealDB | Provider config, agents, conversations, runs, embeddings, usage; `/plan` hub | Secrets never returned; embeddings tenant-scoped; `/plan` auth + streaming work |
| 5 | 05 Task board | Executable task/evidence board | Cutover checklist signed |

## Review Focus

What the vision implies but no task's tests exercise, most likely to bite a user first:

1. **Batched superjson edge cases** — an empty batch, a `skipBatch` single call, and a batch where one call errors while another succeeds must each round-trip to the same shape the current tRPC client expects.
2. **Token edge cases** — expired, malformed, and `role`-less tokens must fail closed on `/api/trpc` and on the WebSocket handshake.
3. **SurrealKV single-writer contention** — two concurrent writes plus the supervised process restarting must not corrupt the file or silently drop an outbox event.
4. **File path traversal** — uploads/downloads with `..`, absolute paths, or tenant-prefixed keys must be rejected.
5. **Offline replay duplicates** — a queued mutation replayed twice after reconnect must be idempotent (no duplicate note).
6. **`/plan` auth and streaming** — an unauthenticated or expired-token client must be rejected on `/plan/chat` and on the `/plan/stream` handshake, and a stream must carry only the caller's tenant data.

Each line has a test pinned to its owning task in the phase plan that introduces the code.
