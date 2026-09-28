# `docs/plans/cloud_surreal`

> Part of **PlanInc** — AI-powered card note-taking and planning

Program plan for `cloud_surreal`: a single Robyn-based Python server that replaces
both the Bun/Express/tRPC `server/` and the `django_server/` Django alternative,
keeps the embedded SurrealKV file as the datastore, preserves the existing JWT and
tRPC client contracts, and adds desktop sync plus SurrealDB-backed AI.

## Contents

- `00-index.md` — master program plan: goal, architecture, constraints, phases, open decisions
- `01-foundation-and-runtime.md` — Robyn app, supervised SurrealKV process, `SurrealClient`, JWT, tRPC transport, Docker
- `02-feature-parity.md` — parity surface and slice order for every router and route
- `03-desktop-sync.md` — WebSocket channel and offline outbox replay
- `04-ai-and-surreal.md` — AI providers, agents, conversations, runs, embeddings, usage
- `05-implementation-task-board.md` — executable task/evidence board across all milestones
- `06-cutover-parity-and-sync.md` — replace/archive decision, schema gap analysis vs the main app schema, bidirectional sync, live-server exploration

## Key decisions

- **Framework:** Robyn (not Django, no ORM).
- **Datastore:** the existing embedded SurrealKV file, served by a supervised
  `surreal` child process — no separate database container.
- **Auth:** reuse the existing JWT claim contract (`NEXTAUTH_SECRET`).
- **Frontend:** no rewrite; the `/api/trpc` superjson + batch contract is preserved.
- **`/plan`:** the PlanInc AI Hub — one versioned router at `/plan` exposing all
  AI features (health, chat, runs, conversations, search, providers, streaming).
  Defined in `00-index.md`; implemented in `04-ai-and-surreal.md`.

## Usage

No executable entry point; read `00-index.md` first, then the phase plan you are
executing.
