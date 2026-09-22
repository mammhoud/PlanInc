# Phase 4: Realtime, workers, operations, and release verification

**Status:** Channels and worker safety boundaries implemented; operations
architecture staged; release gates pending

**Depends on:** [Phase 3](./03-data-migration-and-cutover.md)  
**Outcome:** Django is operationally complete, observable, recoverable, and
ready to become the sole PlanInc server.

## Current deployment topology (TypeScript source stack)

**Verified 2026-09-22.** Until Django takes traffic, the running service is the
Bun/TypeScript source stack. The cutover must preserve these facts:

- **Build context and image.** `dockerfile` builds from the repository root
  (context `.`), not `./runtime`. The runner stage is `node:20-alpine` and starts
  `node server/index.js` — there is no `bun` in the runtime image.
- **Data mount.** Live state moved from `./runtime/data` to `./data`
  (`PLANINC_DB_FILE=/app/data/planinc.db`). A host that predates the cutover must
  have `planinc.db`, `documents/`, and `notes/` moved into `./data` **before**
  the first start, or the service silently boots on an empty store.
- **Runtime externals.** The esbuild bundle externalises a fixed set
  (`server/esbuild.config.ts`): `surrealdb`, `@surrealdb/node`, `esbuild`,
  `llamaindex`, `@langchain/community` (plus the `@langchain/core` and
  `pdf-parse` peers it loads at boot), `sharp`, `sqlite3`, `lightningcss`,
  `@node-rs/crc32`, `@libsql/*`. A missing entry fails only at boot, so the
  runner stage's install list must be revisited whenever that array changes.
- **Build memory.** The client's Vite chunk render peaks near 5.7 GB RSS in a
  single Node process. Serialise the workspace builds (`TURBO_CONCURRENCY=1`) and
  build on a host with ~7 GB free or a swapfile; an 8 GB host without swap dies
  with an OOM kill rather than a useful error.
- **Seed gap.** `server/seed.ts` is not compiled into `dist/`, so the container
  cannot run it and default-font seeding never executes; schema/index setup is
  handled by the server's own `bootstrap()`. Decide whether the Django migration
  owns seeding or the container gains a compiled seed step.

## Channels and WebSockets

- Map every existing event to a typed event name and payload schema.
- Use tenant-scoped groups such as `tenant_<schema>:workspace_<id>`.
- Authenticate the handshake before joining a group.
- Reject a client that requests a workspace outside its membership.
- Propagate request ID, user ID, tenant schema, and workspace ID into logs.
- Add reconnect/backoff behavior to the React/Tauri client.

Required tests:

- handshake authentication;
- tenant group isolation;
- workspace membership filtering;
- reconnect after worker restart;
- event ordering and duplicate handling.

## Workers and django-bolt operations

Create explicit worker tasks for:

- search indexing;
- embedding rebuild;
- scheduled AI jobs;
- recommendation and analytics aggregation;
- markdown/export jobs;
- attachment text extraction;
- webhook delivery and retry;
- maintenance and retention.

Every task must carry tenant identity, be idempotent where possible, record
success/failure state, and fail visibly. No worker may use a global default
tenant.

Durable task state belongs to the operations boundary described in
[`PI-020`](./05-server-architecture-and-erd.md): outbox events are committed
with domain writes, delivery attempts are persisted, and retry/backoff state
is observable.

Use django-bolt for typed analytics/read APIs and scheduled operations only
where its package contract is verified. Keep domain writes in Django services
and transactions.

## Observability and security

Add:

- structured request and worker logs;
- health and readiness endpoints;
- metrics for latency, errors, queue depth, imports, and WebSocket sessions;
- audit events for authentication, permission changes, exports, imports, and
  provider changes;
- rate limits for login, AI, uploads, and public shares;
- secret redaction and environment validation;
- trusted-host, CSRF, CORS, and secure-cookie checks;
- tenant leakage alarms based on request and query context.

## Deployment topology

```text
planinc-web       Django ASGI via Daphne or Gunicorn/Uvicorn
planinc-worker    background task process
planinc-postgres  PostgreSQL
planinc-redis     Redis
Traefik           TLS, host routing, health checks
object storage    tenant-prefixed uploads
```

The frontend may be built in a separate Bun stage and copied into Django static
storage, or served by a dedicated static service. Do not run the old Express
server in the production Compose stack after cutover.

## Verification matrix

### Static and package checks

```bash
uv run ruff check server
uv run python server/manage.py check --deploy
uv run python server/manage.py makemigrations --check
uv run pytest server/tests -q
```

### API and client checks

```bash
make test
PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical
```

Also run focused tests for authentication, notes, planning, tickets, files,
search, AI, integrations, fragments, and WebSockets.

### Deployment checks

- `docker compose config -q`
- PostgreSQL and Redis health
- Django `/health` and `/ready`
- ASGI request and static files
- Bolt OpenAPI generation
- WebSocket handshake
- worker startup and retry
- backup and restore drill
- Traefik HTTPS smoke test

## Release checklist

- [ ] Dependency versions and lockfiles are committed.
- [ ] Tenant isolation suite passes.
- [ ] Route matrix has no unowned client request.
- [ ] Import report has no unexplained rejected records.
- [ ] Backup and restore were rehearsed.
- [ ] Rollback was rehearsed and timed.
- [ ] Secrets and host/header restrictions were reviewed.
- [ ] Error rate and latency dashboards are ready.
- [ ] Compatibility server and SurrealKV backup retention dates are recorded.
- [ ] Product owner approves the cutover window.

## Final exit

The migration is complete only after Django handles all production traffic for
the agreed rollback window, no compatibility route is receiving traffic, the
backup is retained, and the archive/removal decision is separately approved.

The Django ASGI application exposes a tenant-scoped `/ws/tenant` channel with
explicit tenant validation and group naming. `TenantTaskContext` and
`run_tenant_task` reject background operations without tenant identity. Redis,
metrics, backup/restore, and traffic-cutover checks remain external release
gates.
