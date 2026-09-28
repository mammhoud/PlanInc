# cloud_surreal Master Implementation Task Board

**Status:** Active execution board
**Source architecture:** [`00-index.md`](./00-index.md)
**Rule:** Completed repository work is recorded as evidence, not repeated as open work. A task is complete only when its code, migration, contract test, and documentation are updated together.

## Milestone 0 — Baseline (read-only)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| M0-1 | Record the current source-stack topology and SurrealKV file location | - | Done (see `04-realtime-operations-and-verification.md` in django-bolt) |
| M0-2 | Capture tRPC wire fixtures from the running TS server | - | Pending |

## Milestone 1 — Foundation (Phase 1)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| F1 | Scaffold + `Settings` | - | Done (`cloud_surreal/app/config.py`) |
| F2 | Robyn app + `/health` | F1 | Done (`cloud_surreal/app/main.py`) |
| F3 | Embedded SurrealKV connection (no child process; see 00-index Datastore Decision) | F1 | Done (`app/db/surreal.py`) |
| F4 | `SurrealClient` | F3 | Done — `update` uses the SDK's `merge` (its `update` replaces the record and drops fields; see `02-feature-parity.md`) |
| F5 | JWT verify/issue | F1 | Done (`app/auth/jwt.py`) |
| F6 | tRPC-compatible transport (superjson + batching + fail-closed auth) | F2, F5 | Done (`app/transport/trpc.py`); live fixture capture still outstanding |
| F7 | Docker + compose (embedded-file constraint) | F4, F6 | Done |

## Milestone 2 — Feature parity (Phase 2)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| S1 | Identity: policies + `user` + `/api/auth/*` | F6 | Done — `app/domain/{policies,users,passwords,errors,totp,oauth}.py`, `app/db/ids.py`, `app/routers/user.py`, `app/routes/auth.py` (2FA + OAuth included); real-fixture capture still X4 |
| S2 | Notes core (+ tags/comments/attachments) | S1 | Partial (23/34) — `app/domain/notes.py`, `app/domain/collections.py`, `app/domain/tagging.py`, `app/routers/{note,collection}.py`, `app/services.py`; isolation tests in `tests/test_notes_router.py`. The `tags.*` surface is now complete (list + 7 mutations) on top of the S2t derivation service |
| S2t | Notes core | Tag derivation service: parse `#tag` / `#parent/child` from note content on upsert, upsert `tag` rows + `tagsToNote` links, honour `parent` chains | S2 | Done — `app/domain/tagging.py` (`extract_hashtags`, `build_hash_tag_tree`, `TagDerivation.derive`) wired into `NoteService.upsert` (create + update), reusing `(name, parent, accountId)` and pruning links for removed tokens; `tests/test_tagging.py` (12 tests). Unblocked the 7 `tags.*` mutations, `notes.relatedNotes`, and the analytics tag stats |
| S3 | Planning family | S2 | Partial (27/31) — `app/domain/{store,planning}.py`, `app/routers/planning.py`. The four remaining `task.*` symbols are **generator mutations** (`async function*` yielding progress: `importFromPlanInc` runs `DBJob.RestoreDB`, `importFromMemos` reads a Memos SQLite DB, `importFromMarkdown` walks `.md`/`.zip`) plus `exportMarkdown`. They need streaming support in `transport/trpc.py` *and* job runners, so they are a design item rather than a port |
| S4 | Files (+ traversal guards) | S1 | Done — `app/domain/files.py` (FileStorage + AttachmentService), `app/routes/{http,file}.py`, `app/routers/attachment.py`; guards covered by `tests/test_file_{storage,files_service,file_routes,files_integration}.py`. Deviations: stricter read policy, 400-before-404 for traversal, no thumbnails, `/api/s3file/*` 501, in-memory archives |
| S5 | Analytics/config/branding/font/notification | S2 | Partial (19/22) — `app/domain/{preferences,public}.py`, `app/routers/{preferences,public}.py`; all `public.*` reads plus `fonts.getFontData` landed. Deferred: `branding.searchImages`/`generateLogo` (image provider) and `public.musicMetadata` (audio tags + Spotify) |
| S1d | Identity | Superuser bootstrap parity (`PLANINC_SUPERUSER_NAME` / `PLANINC_SUPERUSER_PASSWORD`, generate + write `data/superuser.txt` 0600 on first boot) | S1 | Done — `app/domain/superuser.py` (all four TS branches + min-length guard + never-fatal failures), wired via `create_app(..., bootstrap=True)` behind a Robyn startup handler so tests cannot create accounts; `tests/test_superuser.py` (17 tests) |
| S6 | Collaboration | S2 | Pending |
| S7 | Integrations | S2 | Pending |
| S8 | AI routers | Phase 4 | Pending |
| G | Route matrix: zero unowned rows | all | Partial — `cloud_surreal/route-matrix.json` + `docs/plans/cloud_surreal/route-matrix.md` (185 frontend symbols, 0 unmapped slices, 90 implemented: S1 15/15, S2 23/34, S3 27/31, S4 6/6, S5 19/22, S6 0/34, S7 0/19, S8 0/24); gate in `tests/test_route_matrix.py` |

## Milestone 3 — Desktop sync (Phase 3)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| Y1 | Outbox + idempotency store | S2 | Pending |
| Y2 | `/api/sync` WebSocket | Y1 | Pending |
| Y3 | Broadcaster | Y2 | Pending |
| Y4 | Client replay + backoff | Y1 | Pending |
| Y5 | Isolation + replay tests | Y4 | Pending |

## Milestone 4 — AI (Phase 4)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| A1 | AI tables + migrations | F4 | Pending |
| A2 | Provider ports + secret encryption | A1 | Pending |
| A3 | Conversation/run + `ai` router | A2 | Pending |
| A4 | Embeddings + retrieval | A3 | Pending |
| A5 | Scheduled tasks + MCP | A3 | Pending |
| A6 | OpenAI-compatible route | A2 | Pending |
| A7a | `/plan` router + `/plan/health` | A3 | Pending |
| A7b | `/plan/chat` + `/plan/runs` + `/plan/conversations` | A7a | Pending |
| A7c | `/plan/search` (permission-filtered) | A4 | Pending |
| A7d | `/plan/providers` admin (secrets never returned) | A2 | Pending |
| A7e | `/plan/stream` WebSocket | A7b, Y2 | Pending |

## Milestone 5 — Cutover

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| C1 | Traefik switch to `cloud_surreal` | F7, G, Y5 | Pending |
| C2 | Rollback rehearsal and timing | C1 | Pending |
| C3 | Legacy `server/`/`django_server/` retention decision recorded | C1 | Pending |

## Milestone 6 — Cutover, parity, and sync (Phase 6)

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| X1 | Canonical schema extraction (TS `db.ts` + `recordSchemas.ts` → `schema.json`) | - | Done — `cloud_surreal/scripts/extract_schema.py`, 29 tables, 0 unmapped |
| X2 | `schema-parity.md` gap matrix, each gap owned by a Phase 2 slice | X1 | Done — `docs/plans/cloud_surreal/schema-parity.md` (+ expected field shapes); gate `tests/test_schema_parity.py` |
| X3 | Bidirectional sync: JSONL import (TS→Py) + outbox ingest (Py→TS), LWW + tombstones | F4, S2 | Pending |
| X4 | Capture live TS-server tRPC fixtures via `planincEndpoint` (pins Phase 1 Task 6) | - | Pending |
| X5 | Replace/archive decision executed (Traefik cutover, `server/` + `django_server/` archived) | X2, X3, G, C2 | Pending |

**Django is superseded:** no new `django_server/` features; it is an archive
candidate once the Robyn cutover passes. See
[`06-cutover-parity-and-sync.md`](./06-cutover-parity-and-sync.md).

## Definition of Done

Code, migration, contract test, and documentation change together. Cross-tenant authorization, replay-safe side effects, and client contract coverage are required. A slice is not complete because its modules import successfully.
