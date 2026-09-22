# PlanInc migration scaffolding

This directory contains disposable Phase 0 tooling for the Django migration.
It is intentionally separate from the production Compose stack and does not
change the current embedded SurrealDB deployment.

## PostgreSQL tenancy smoke test

Start the disposable database:

```bash
docker compose -f migration/docker-compose.postgres.yml up -d
```

Run the isolation test from an environment with `psycopg` installed:

```bash
PLANINC_MIGRATION_DATABASE_URL=postgresql://planinc:planinc-dev-only@127.0.0.1:55432/planinc_migration \
  uv run python migration/test_tenant_isolation.py
```

The test creates two schemas, writes the same table/key in each schema, and
proves that changing `search_path` cannot read the other tenant's row. It is a
pre-Django contract test, not a replacement for `django-tenants` integration
tests.

## Tenant resolution contract

Run the framework-independent hostname/header contract tests with:

```bash
PYTHONPATH=migration python3 -m unittest migration/test_tenant_contract.py
```

The production contract resolves `<tenant-slug>.notes.structa.cloud` by
hostname. `X-PlanInc-Tenant` is accepted only in development or test contexts.
