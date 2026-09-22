# Phase 1: Django foundation and tenant boundary

**Status:** Repository foundation implemented; infrastructure rehearsal pending  
**Depends on:** None  
**Blocks:** Domain/API implementation and data import  
**Outcome:** A disposable Django deployment can provision isolated tenants and
serve authenticated health/API requests.

The Django alternative lives in `django_server/`. The active TypeScript
`server/` remains the deployed backend until the import, parity, rollback, and
approval gates pass. No rename or archive operation is part of this plan.

## Work breakdown

### 1. Complete infrastructure rehearsal

- Add Compose services with healthchecks and persistent volumes.
- Configure PostgreSQL connection pooling and migration command behavior.
- Configure Redis as the Channels layer and worker broker/cache as selected.
- Add readiness checks that distinguish process health from dependency health.

**Acceptance:** `docker compose config -q`, PostgreSQL readiness, Redis
readiness, and Django migrations succeed.

The repository foundation, settings, tenant registry, hostname resolution,
request context, provisioning commands, notes slice, and WebSocket boundary
are implemented. Do not duplicate those tasks here.

## Exit gate

Phase 1 is complete only when a disposable Compose environment can:

1. Start PostgreSQL, Redis, and Django.
2. Provision two tenants.
3. Create users and memberships.
4. Reject cross-tenant access.
5. Pass health/readiness and migration checks.
