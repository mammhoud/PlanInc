# Phase 3: SurrealKV migration and traffic cutover

**Status:** Export, verification, and dry-run checkpoint tooling implemented;
native import mapping and cutover pending

**Depends on:** [Phase 1](./01-foundation-and-tenancy.md) and [Phase 2](./02-domain-and-api.md)  
**Outcome:** Existing PlanInc data is imported into PostgreSQL with evidence,
and production can switch to Django with a tested rollback.

## Migration principles

- Never copy the SurrealKV file into PostgreSQL.
- Keep an immutable source backup before every rehearsal and final import.
- Export by explicit records and relations, not by assumptions about current
  table names.
- Import one tenant at a time.
- Make every import operation idempotent and resumable.
- Never import plaintext credentials or provider secrets.
- Preserve uploads separately from metadata and verify both.

## Management commands

```bash
python manage.py planinc_export_surreal \
  --source ./migration/input/planinc.db \
  --output ./migration/export/run-001 \
  --checksum sha256

python manage.py planinc_import_surreal \
  --input ./migration/export/run-001 \
  --tenant demo \
  --checkpoint ./migration/checkpoints/demo.json \
  --dry-run

python manage.py planinc_import_surreal \
  --input ./migration/export/run-001 \
  --tenant demo \
  --checkpoint ./migration/checkpoints/demo.json

python manage.py planinc_verify_import \
  --input ./migration/export/run-001 \
  --tenant demo \
  --report ./migration/reports/demo.json
```

## Export format

Each export must contain:

```text
manifest.json
records/<table>.jsonl
relations/<relation>.jsonl
uploads/index.jsonl
checksums/sha256sums
```

The manifest records source database identity, export time, schema version,
tenant mapping, record counts, relation counts, file counts, and tool version.

## Import stages

1. Validate manifest and checksums.
2. Provision or resolve the target tenant using the tenancy app.
3. Import users/memberships through the accounts/workspaces identity mapping.
4. Import notes, planning, tickets, study, knowledge, and resources.
5. Import relations, comments, history, audit, and integration state.
6. Copy and verify tenant-prefixed uploads.
7. Rebuild search indexes and analytics projections.
8. Emit rejected records without silently dropping them.
9. Write a checkpoint after each bounded batch.
10. Run post-import permission and relation checks.

## Parity evidence

For each tenant, record:

- source and target row counts by domain;
- source and target checksums for stable fields;
- relation counts and orphan counts;
- attachment count, size, and checksum;
- user/membership mapping;
- permission behavior;
- search result spot checks;
- rejected-record report and remediation owner.

## Rehearsal schedule

### Rehearsal 1: disposable local copy

- Restore a copy of the SurrealKV backup.
- Run export/import into disposable PostgreSQL.
- Fix schema and mapping errors.

### Rehearsal 2: production-like environment

- Use the same Compose image and configuration shape as production.
- Run full import and frontend/API smoke tests.
- Measure import duration, database size, queue backlog, and rollback time.

### Final cutover

1. Announce maintenance window.
2. Enable legacy read-only mode.
3. Run final incremental export.
4. Import and verify checksums.
5. Switch Traefik to Django.
6. Run health, authentication, CRUD, upload, search, WebSocket, and smoke tests.
7. Monitor errors and tenant isolation.
8. Keep the old service and backup available through the rollback window.

## Rollback procedure

Rollback is allowed when there is data loss, tenant leakage, authentication
failure, unacceptable error rate, or unrecoverable latency.

1. Stop new writes to Django.
2. Preserve Django logs, metrics, and database snapshot.
3. Restore the previous Traefik route.
4. Start the compatibility service in read/write mode only after confirming
   the data boundary.
5. Record writes made during the Django window for later reconciliation.
6. Do not delete the PostgreSQL database or SurrealKV backup.

## Exit gate

Phase 3 is complete only after two successful rehearsals, a measured rollback,
zero unexplained rejected records for the chosen tenant, and signed approval of
the cutover checklist.

`planinc_export_surreal` writes a manifest, per-table JSONL records, and
SHA-256 checksums from a SQLite-compatible source while omitting credential-like
columns. `planinc_verify_import` validates checksums and writes a report.
`planinc_import_surreal --dry-run` validates the export and writes a resumable
checkpoint. Native SurrealKV reading and target-model import mapping remain
deployment-gated.
