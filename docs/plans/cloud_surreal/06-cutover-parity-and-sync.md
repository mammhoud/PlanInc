# Phase 6: Cutover, Schema Parity, and Data Sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide and execute the replacement/archival of the TypeScript server by the Python one, with a complete gap analysis against the **main app schema**, and a bidirectional data sync so both projects hold the same data during the window. Exploration runs against the live TS server.

**Architecture:** The Python target is **Robyn (`cloud_surreal`)**, not Django — Django (`django_server/`) is superseded and becomes an archive candidate. Parity is proven by diffing the canonical schema emitted from the TS server (`server/db.ts`, `shared/lib/recordSchemas.ts`) against `cloud_surreal`'s tables, and by syncing through the existing JSONL export plus an idempotent outbox.

**Tech Stack:** Robyn + embedded SurrealKV (Phase 1), JSONL export (`planinc_export_surreal`), outbox idempotency keys, `frontend/src/lib/planincEndpoint.ts`.

**Spec:** [`00-index.md`](./00-index.md), [`05-implementation-task-board.md`](./05-implementation-task-board.md)

## Current State (verified)

- Phase 1 is implemented and green in `cloud_surreal/` (23 tests, `ruff` clean): Robyn app, embedded SurrealKV, JWT, tRPC transport, Docker.
- Phase 2 (feature parity) has **no slice started**; the route matrix is the blocker.
- Therefore **replace-and-archive is not yet safe**. The answer to "can it replace now?" is: foundation yes, product no. This plan states the exact gate.

## Constraint: Django is superseded

`django_server/` (Django + boltdb plan) is no longer a target. It stays in the tree, buildable, until the Robyn cutover passes, then moves to `archive/` per Open Decision 2. Nothing in this phase may add new Django features.

## Tasks

### Task 1: Canonical schema extraction (TS → spec)

**Files:** Create `cloud_surreal/scripts/export_schema.ts` (or `.py` reading the export), `docs/plans/cloud_surreal/schema-parity.md`

- [ ] **Step 1:** Enumerate every table and field the TS server reads/writes: walk `server/db.ts` table handling and `shared/lib/recordSchemas.ts` schemas; emit a machine-readable `schema.json`.
- [ ] **Step 2:** Produce `schema-parity.md`: a table with `table | field | TS type | cloud_surreal | status`, where `status ∈ {present, missing, type-mismatch, unmapped}`.
- [ ] **Step 3: Review Focus check** — every `status != present` row names the Phase 2 slice that fixes it, or is explicitly out of scope.

### Task 2: Gap closure against the main app schema

**Files:** Modify `02-feature-parity.md` (add gaps as slice tasks)

- [ ] **Step 1:** Convert each `missing`/`type-mismatch` row into a task with the exact expected shape (from the export).
- [ ] **Step 2:** Add a contract test per gap: write through `cloud_surreal`, read through the same shape the TS `recordSchemas` expects.
- [ ] **Step 3:** Gate: `schema-parity.md` has zero `unmapped` rows for tables the frontend touches.

### Task 3: Bidirectional sync during the window

**Files:** Create `cloud_surreal/app/sync/`, reuse `planinc_export_surreal`

- [ ] **Step 1:** TS → Python: import the JSONL export (idempotent keys, per-record LWW on `updatedAt`).
- [ ] **Step 2:** Python → TS: emit an outbox; the TS server ingests through its existing `routerExpress/sync.ts` route, idempotency-keyed.
- [ ] **Step 3:** Both directions require the same `(aggregate_id, updated_at)` conflict rule and tombstone handling.
- [ ] **Step 4: Test** — write a note on each side, sync, assert both converge to the newer record and a re-run creates no duplicate (mirrors Phase 3 Review Focus 5).

### Task 4: Explore against the live TS server

**Files:** use `frontend/src/lib/planincEndpoint.ts`

- [ ] **Step 1:** Point a client at the running TS server via the stored `planincEndpoint` (Tauri) or same-origin, and capture its tRPC payloads.
- [ ] **Step 2:** Feed those captures into Phase 1 Task 6's `tests/fixtures/trpc` so the transport is pinned to real traffic, not a transcription.
- [ ] **Step 3:** Record the TS server's `/health` and schema version as the parity baseline in `schema-parity.md`.

### Task 5: Replace and archive decision

- [ ] **Step 1:** Confirm the gate: route matrix has zero unowned rows; `schema-parity.md` has zero unmapped rows; both sync directions pass; rollback rehearsed.
- [ ] **Step 2:** Point Traefik at `cloud_surreal`; keep the TS server reachable for the rollback window.
- [ ] **Step 3:** After the window, move `server/` and `django_server/` under `archive/` and record the retention date.
- [ ] **Step 4:** Update `00-index.md` and `05-implementation-task-board.md` with the evidence.

## Exit Gate

- `schema-parity.md` exists with no unexplained gaps.
- Both sync directions converge and are idempotent.
- Transport fixtures come from the live TS server.
- Traefik cutover done with rollback available; `server/` and `django_server/` archived after the window.

## Open Decisions

1. Whether the TS server stays runnable read-only during the window, or is stopped at cutover.
2. Archive location and retention (default: `archive/` with a 30-day retention recorded in `docs/INDEX.md`).
