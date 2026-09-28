# PlanInc — blocked externally

> **Status:** Living ledger — updated 2026-09-28
> **Owner:** Mahmoud · **Validator:** Moustafa
> **Purpose:** The open items across the PlanInc plan set that **cannot be closed
> by writing code**. Each row names what it is blocked on, the evidence for that
> claim, and the exact condition that unblocks it. Everything *not* listed here is
> considered codeable work, not blocked.

<!-- AI-generated: review needed -->

## Why this file exists

The task boards carry a `Blocked externally` status. Without a single ledger that
status is untestable: a task can sit "blocked" for months after its blocker
cleared, and a new blocker is invisible. This is the one place to check, and the
one place to update, before anyone plans a migration window.

Rule: **a blocked task is not progress.** Do not flip a board row to Done because
its code imports; flip it when the row's unblock condition below is met.

## django-bolt (`docs/plans/django-bolt/`)

| ID | Task | Blocked on | Evidence | Unblock condition |
| --- | --- | --- | --- | --- |
| A4 | PostgreSQL/Redis/django-tenants rehearsal | No PostgreSQL/Redis replica allocated for PlanInc | `06-implementation-task-board.md` A4 | An environment with PostgreSQL + Redis reachable and a window to run the rehearsal |
| E3 | Two PostgreSQL migration rehearsals + parity | A4 | board E3 | A4 complete, plus two scheduled windows |
| E4 | Backup/restore and rollback timing drills | E3 | board E4 | Rehearsal data from E3 |
| E5 | Validate Redis workers, metrics, Traefik, health, WebSockets | A4, D3 | board E5 | A4 complete and a deployable staging target |
| E6 | Product approval + final cutover window | E4, E5 | board E6 | Named approver and a signed window |

Pre-cutover decisions still unanswered (they gate E6, not code):
1. Retention period for the final SurrealKV backup.
2. Supported production object-storage provider.
3. Approved cutover and rollback window.

## cloud_surreal (`docs/plans/cloud_surreal/`)

| ID | Task | Blocked on | Evidence | Unblock condition |
| --- | --- | --- | --- | --- |
| X4 | Capture live TS-server tRPC fixtures via `planincEndpoint` | A running reference TS server to capture from (pins Phase 1 Task 6) | `05-implementation-task-board.md` X4; `02-feature-parity.md` | The legacy `server/` reachable, or captured fixtures supplied |
| C1 | Traefik switch to `cloud_surreal` | X4/X5 + the framework decision | board C1 | The `cloud_surreal` vs `django-bolt` decision resolved (see `00-index.md`) and the cutover gate green |
| C2 | Rollback rehearsal and timing | C1 | board C2 | C1 staged |
| C3 | Legacy `server/`/`django_server/` retention decision recorded | C1 | board C3 | Owner records the retention window |
| X5 | Replace/archive executed | C2, G, X2, X3 | board X5 | C2 complete |
| S5 (3 procs) | `branding.searchImages`, `branding.generateLogo`, `public.musicMetadata` | An image provider and an audio-tag/Spotify provider | `cloud_surreal/README.md` deviations | Provider choice + credentials |
| S3 (4 procs) | `task.importFromPlanInc` / `importFromMemos` / `importFromMarkdown` / `exportMarkdown` | Generator/streaming support in the tRPC transport + job runners | board S3 | Streaming transport designed and implemented (a design item, not a blocker) |

## workflow-and-integrations (`docs/plans/workflow-and-integrations/`)

| Item | Blocked on | Unblock condition |
| --- | --- | --- |
| Docker plugin lifecycle control (vs read-only status) | Docker socket-permission decision | Owner picks read-only status first, or grants a scoped socket |
| MCP catalog source | Bundled JSON vs fetched registry decision | Owner picks bundled (safe default, no install-time network) |
| Workflow node schema | PlanInc-native vs arbitrary plugin node types | Owner records the node schema |

## Cross-cutting decisions

| Decision | Blocks | Owner |
| --- | --- | --- |
| `cloud_surreal` (Robyn) **vs** `django-bolt` (Django) | Every cutover item in both plans | Mahmoud |
| Production object-storage provider | django-bolt E3–E6 | operator |
| Demo/staging host for PlanInc parity checks | Any end-to-end rehearsal | operator |
