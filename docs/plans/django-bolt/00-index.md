# PlanInc Django + django-bolt migration plan

**Status:** Foundation and first vertical slices implemented; production gates pending  
**Owner:** PlanInc platform  
**Scope:** Replace the active Bun/Express/tRPC/embedded-SurrealDB server with a
Django ASGI server using django-bolt, django-fusion, PostgreSQL, Redis, and
Channels, while keeping the existing React/Vite/Tauri client operational during
the migration.

## Goal

Deliver a production-ready Django server that preserves the important PlanInc
client contracts, adds an explicit tenant boundary, and provides a safe,
repeatable migration path from SurrealKV to PostgreSQL.

## Non-goals

- Do not rewrite the React/Tauri client before the Django API has contract tests.
- Do not copy the Formint Pro server wholesale.
- Do not delete the current data backup or legacy compatibility code at first
  cutover.
- Do not introduce a second Robyn or Express production server.
- Do not claim tenant isolation until it is tested through HTTP, WebSockets,
  workers, and management commands.

## ⚠️ Reconciliation with `cloud_surreal` — open owner decision (2026-09-28)

<!-- AI-generated: review needed -->
This plan and [`../cloud_surreal/00-index.md`](../cloud_surreal/00-index.md)
**claim the same target** (the PlanInc Python cutover) and contradict each other:
this plan replaces the Bun server with **Django ASGI + django-bolt + PostgreSQL +
Redis**, while `cloud_surreal` replaces **both** `server/` and `django_server/`
with **Robyn + embedded SurrealKV** and states *"No Django, no django-bolt, no
django-fusion"*. `cloud_surreal`'s board even calls this tree *"Django is
superseded… an archive candidate"*, while the structa.cloud registry names
**this** plan authoritative.

Only one can execute. **Status: OPEN — requires the owner**; the answer decides
the framework, the datastore, and which tree is archived. Full comparison and a
recommendation live in the `cloud_surreal` index. Record the decision in both
indexes and in the registry, then delete the losing plan.

## Plan files

| File | Purpose | Depends on |
| --- | --- | --- |
| [01-foundation-and-tenancy.md](./01-foundation-and-tenancy.md) | Django project, dependency provenance, settings, PostgreSQL, Redis, tenancy | None |
| [02-domain-and-api.md](./02-domain-and-api.md) | Domain models, Bolt endpoints, Fusion fragments, auth, and client adapters | 01 |
| [03-data-migration-and-cutover.md](./03-data-migration-and-cutover.md) | SurrealKV export/import, parity, rollback, and traffic cutover | 01, 02 |
| [04-realtime-operations-and-verification.md](./04-realtime-operations-and-verification.md) | Channels, workers, analytics, deployment, observability, and release gates | 01, 02, 03 |

## Current phase status

| Phase | Repository implementation | Remaining gate |
| --- | --- | --- |
| 01 Foundation and tenancy | Django settings, health/readiness, tenant registry, provisioning, request context, notes schema, and ASGI boundary | PostgreSQL/Redis rehearsal and hostname approval |
| 02 Domain and API | Tenant-scoped notes CRUD is implemented as the first vertical slice | Remaining domain slices, Bolt schemas, and client adapter migration |
| 03 Data migration and cutover | JSONL export and checksum verification commands are implemented | Native SurrealKV adapter, import mapping, rehearsals, rollback, and approval |
| 04 Realtime and operations | Tenant-scoped Channels WebSocket and worker tenant guard are implemented | Redis workers, metrics, backup/restore, and production traffic validation |

Remaining gates require external services or an approved production window;
documentation does not mark those gates complete.

## Dependency graph

```text
01 Foundation + tenancy
        |
        v
02 Domain + API
        |
        v
03 Data migration + cutover
        |
        v
04 Realtime + operations + verification
```

## Remaining decisions before cutover

1. Confirm the migration retention period for the final SurrealKV backup.
2. Confirm the supported production object-storage provider.
3. Approve the final cutover window and rollback window.

## Global acceptance criteria

- `python manage.py check` passes in development, test, and production settings.
- `python manage.py makemigrations --check` reports no pending migrations.
- Two tenants can read and write identically named records without leakage.
- Every migrated frontend request has a tested Django destination.
- SurrealKV exports are idempotent, checksummed, resumable, and verifiable.
- Health, WebSocket, worker, backup, restore, and deployment smoke checks pass.
- Rollback can restore the previous service and data backup without data loss.

## Working rules

- Keep changes inside `projects/PlanInc/`.
- Keep the existing `frontend/` as the active shared client for web, PWA,
  desktop, Android, and iOS builds.
- Add model, service, API, frontend adapter, and test changes as vertical
  slices.
- Update the route matrix and this plan when a contract changes.
- Run the narrowest relevant check before moving to the next phase.
