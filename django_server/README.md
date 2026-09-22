# PlanInc Django server alternative

This directory is the isolated Django server foundation for PlanInc. It is
deliberately separate from the active TypeScript `server/` so the current
Express/tRPC deployment remains runnable while the API is migrated.

## Current scope

- Django ASGI entrypoint and environment-based settings
- request IDs and explicit tenant resolution
- public health and readiness endpoints
- initial tenant/domain registry models
- tenant provisioning, suspension, and verification commands
- tenant context endpoint at `/api/tenancy/context`
- tenant-scoped notes CRUD at `/api/notes`
- tenant-scoped workspace CRUD at `/api/workspaces`
- workspace and workspace-membership models
- transactional note service with durable outbox events
- Channels WebSocket boundary at `/ws/tenant`
- resumable migration export/checksum verification commands
- isolated django-bolt construction boundary
- explicit tenant task context for worker integrations

The server is not wired into the production Compose stack yet. The Django
foundation and first notes/realtime/migration slices are implemented, but
production cutover still requires the external PostgreSQL, Redis, backup,
rollback, and product-approval gates in the plan.

The target app boundaries, PlanInc use-case flows, settings contract, and
complete relational ERD are documented in
[`docs/plans/django-bolt/05-server-architecture-and-erd.md`](../docs/plans/django-bolt/05-server-architecture-and-erd.md).

## Local checks

```bash
python manage.py check
python manage.py test
make -C .. django-run
python manage.py provision_tenant demo --name "Demo tenant"
python manage.py verify_tenant demo
python manage.py suspend_tenant demo
```

Install the dependencies from `pyproject.toml` first. The django-bolt version
is intentionally constrained to the published package and must not point at a
missing local source tree.
