# PlanInc Documentation Index (PI-000)

> **Source of truth.** This index never marks a doc "✅ Exists" until its file is
> actually present in `docs/`. Cross-references in other docs use the `PI-0NN`
> IDs in this table, following the convention established by `django-fusion`
> (`DF-NNN`).

## Documentation Map

| ID | File | Topic | Status |
|----|------|-------|--------|
| PI-000 | [`docs/INDEX.md`](./INDEX.md) | This index | ✅ Exists |
| PI-001 | [`docs/00-package-guide.md`](./00-package-guide.md) | Layout, what is actually deployed, where to change things | ✅ Exists |
| PI-002 | [`docs/01-getting-started.md`](./01-getting-started.md) | Running locally, `make` targets, first login | ✅ Exists |
| PI-003 | [`docs/02-architecture.md`](./02-architecture.md) | Runtime vs `src/` monorepo, request flow, Mermaid diagram | ✅ Exists |
| PI-004 | [`docs/03-runtime-http-api.md`](./03-runtime-http-api.md) | HTTP surface, route groups, auth, fragments | ✅ Exists |
| PI-005 | [`docs/04-database-and-schema.md`](./04-database-and-schema.md) | Embedded SurrealDB, schema bootstrap, engine semantics | ✅ Exists |
| PI-006 | [`docs/05-deployment.md`](./05-deployment.md) | `notes.structa.cloud`, compose, networks, TLS | ✅ Exists |
| PI-007 | [`docs/06-secrets-and-superuser.md`](./06-secrets-and-superuser.md) | `.env`, superuser bootstrap, secret handling | ✅ Exists |
| PI-008 | [`docs/07-testing.md`](./07-testing.md) | The three Playwright configs and what each proves | ✅ Exists |
| PI-009 | [`docs/08-i18n.md`](./08-i18n.md) | Locales, parity rules, adding a language | ✅ Exists |
| PI-010 | [`docs/09-troubleshooting.md`](./09-troubleshooting.md) | Symptom → cause → fix entries | ✅ Exists |

## Per-directory documentation

Every directory in this repository carries a `README.md` describing its role,
contents and public API. Those files are generated and enforced:

```bash
python3 scripts/generate-dir-docs.py          # write/refresh
python3 scripts/generate-dir-docs.py --check  # exit 1 if any directory is undocumented
```

Hand-written READMEs are never overwritten — the generator only replaces files
carrying its own footer.

## Conventions

- **Doc IDs:** `PI-NNN`. IDs are stable across filename changes; if a doc is
  renamed, edit its row here rather than the ID.
- **Cross-link discipline:** reference another doc by its `PI-NNN` ID and a
  markdown link. Plain filename references drift.
- **Status update rule:** switch a row to ✅ Exists **only after** the file is on
  disk with real, non-stub content.
- **Source mapping:** code blocks should be traceable to a real path. Note the
  source path above non-obvious blocks.
