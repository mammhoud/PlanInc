# PlanInc Django implementation task board

**Status:** Active execution board  
**Source architecture:** [`PI-020`](./05-server-architecture-and-erd.md)  
**Rule:** Completed repository work is recorded as evidence, not repeated as
open work. External release gates remain blocked until their dependencies are
available.

## Workstream A: shared foundation

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| A1 | Keep the active TypeScript server and shared `frontend/` deployment stable | - | Complete |
| A2 | Tenant registry, hostname resolution, and explicit tenant context | - | Complete |
| A3 | Health/readiness, request IDs, production settings guards | A2 | Complete |
| A4 | Run PostgreSQL/Redis/Django rehearsal with `django-tenants` | A2, A3 | Blocked externally |

## Workstream B: application boundaries

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| B1 | Add `domain/policies`, `domain/services`, `domain/events`, and `domain/ports` | A2 | Implemented shared tenant policy, transaction boundary, event names, and event sink port |
| B2 | Add `accounts` and `workspaces` models, memberships, roles, and sessions | B1 | Complete: `accounts` app (`UserProfile`, `UserPreference`, `AccessToken`) with profile/preference/token services + `api/account/*` endpoints, session-JWT bearer auth, auto-profile signal, and tests; prior session JWT + OAuth membership link retained |
| B3 | Add `operations` outbox, job attempts, checkpoints, and retention records | B1 | Complete: `JobCheckpoint` (`save_checkpoint`/`get_checkpoint`), `RetentionPolicy` (`set_retention_policy`/`retention_cutoff`), and `RetentionRecord` (`record_retention`) with migration `0003` and tests |
| B4 | Add shared error envelopes and service-to-Bolt/Fusion adapters | B1 | Implemented `domain/errors.py` taxonomy, `api/envelopes.py`, and `api/adapters.py` (`service_view` + `run_service`) with tests; notes slice migrated |

## Workstream C: PlanInc product use cases

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| C1 | Extend notes with versions, tags, comments, backlinks, and history | B2, B3 | Complete: `Tag`, `NoteVersion`, `NoteComment` (threaded/resolvable), `NoteLink` with in/out backlinks, optional `workspace` binding, tag/version/comment/link endpoints, one outbox event per mutation, audit on create/update/delete; tenant-isolation + lifecycle tests |
| C2 | Add planning tasks, tickets, categories, links, and study review | C1 | Complete: `planning` app (`Category`, `Task`+M2M, `TaskLink`, `Ticket`, `StudyItem`) with CRUD endpoints, spaced-review service, outbox + audit events, and isolation tests |
| C3 | Add knowledge resources, relations, attachments, previews, and extraction | B3 | Complete: `knowledge` app (`Resource`, `ResourceRelation`, `Attachment`, `FilePreview`, `Extraction`), tenant-prefixed object keys with traversal-safe filenames, preview/extraction lifecycle endpoints, and tests |
| C4 | Add permission-aware search projections | C1, C3 | Complete: `search` app (`SearchDocument` projection, `index_note`/`index_resource`, `reindex_tenant`), query drops documents whose workspace the caller cannot reach, tag/type filters, and permission tests |
| C5 | Add AI providers, agents, conversations, runs, embeddings, and usage | C4 | Complete: `ai` app (`AIProvider`/`AIModel`/`Agent`/`AgentTool`/`AIConversation`/`AIMessage`/`AIRun`/`AIUsage`/`Embedding`), Fernet credential port (`domain/ports/secrets.py`), `local` chat transport, run execution records usage, credentials never serialized, and tests |
| C6 | Add RSS, webhooks, plugins, MCP, SSO, and public share adapters | B3 | Complete: `integrations` app (`RSSFeed`, `WebhookEndpoint`/`WebhookDelivery`, `PluginInstallation`, `MCPServer`, `SSOConnection`, `ShareLink`) with delivery queue, encrypted secrets never serialized, share resolve/revoke, and isolation tests |
| C7 | Add audit events and analytics read models | B3, C5, C6 | Complete: `audit` app (append-only `AuditEvent`, `record_audit`, wired into note/task/ticket writes, `GET /api/audit`) and `analytics` app (`MetricSnapshot`, `increment_metric`, `tenant_summary`, endpoints) with tests |

## Workstream D: client and runtime integration

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| D1 | Add versioned django-bolt APIs and OpenAPI output from domain services | B4, C1 | Complete: `api/bolt_api.py` declares the `/api/v1` surface as a `RouteSpec` registry and generates an OpenAPI 3.1 document from it; served at `/api/openapi.json` and `/api/v1/openapi.json`; `create_bolt_api()` mounts the registry when django-bolt is installed (optional dependency) |
| D2 | Add django-fusion fragments using the same services | B4, C1 | Complete: `fragments` app renders notes table and per-note comments server-side from the same tenant-scoped services, with a `?format=json` envelope fallback (`/fragments/notes`, `/fragments/notes/<id>/comments`); templates structured for a `{% comp %}` swap when django-fusion is installed |
| D3 | Add Channels events, workspace membership checks, and reconnect contract | B2, C1 | Complete: `realtime/publish.py` tenant/workspace groups + outbox bridge, consumer enforces tenant and workspace membership (4400/4403), `ready`/`resync` reconnect contract, and tests (fixed the in-memory channel-layer `hosts` config bug) |
| D4 | Add frontend API adapters and migrate flows in auth, notes, planning, files, search, AI order | D1, D2 | Adapter complete: `frontend/src/lib/djangoApi.ts` provides `djangoRequest`/`djangoRequestWithMeta`, envelope unwrapping, `DjangoApiError`, tenant/JWT headers, `MIGRATION_ORDER` and per-slice `isDjangoSliceEnabled`; typed adapters for auth, notes, planning, files, search, AI, integrations. Connection verified 2026-09-29: Django serves `/health` (200) + `/api/openapi.json` (3.1.0) standalone; contract match confirmed (`X-Planinc-Tenant` + `Bearer` against `{status,data}` envelope); fixed Bearer token-shape unwrap (`resolveAuthToken`: `planincToken` persists a JSON `TokenData` object). Production still serves the legacy Bun stack (no `VITE_PLANINC_*` set) — call-site migration gated per environment by the slice flags, final cutover is E6 |

## Workstream E: migration and release

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| E1 | Implement native SurrealKV reader and explicit target-model mappings | C1-C7 | Pending |
| E2 | Complete tenant import, rejected-record reports, and attachment verification | E1 | `import_surreal_workspace` implemented (idempotent, LWW, rejected-record report, author mapping) with tests; attachment verification implemented: `planinc_export_surreal --uploads-dir` writes `uploads/index.jsonl` (path/size/sha256) + manifest `files` counts, `planinc_verify_import --uploads-root` checks existence/size/checksum with `unsafe_path` rejection and an `attachments` report section, dry-run checkpoints record `indexed_files` (`apps/tenancy/test_export_verify.py`, 8 tests); tenant-prefixed byte copy pending E1 native mapping |
| E3 | Run two PostgreSQL migration rehearsals and parity checks | A4, E2 | Blocked externally |
| E4 | Run backup/restore and rollback timing drills | E3 | Blocked externally |
| E5 | Validate Redis workers, metrics, Traefik, health, and WebSockets | A4, D3 | Blocked externally |
| E6 | Obtain product approval and execute the final cutover window | E4, E5 | Pending approval |

## Definition of done

A task is complete only when its code, migration, contract tests, and
documentation are updated together. A phase is not production-complete merely
because its Django module imports successfully. Cross-tenant authorization,
replay-safe side effects, import evidence, operational recovery, and client
contract coverage are required.
