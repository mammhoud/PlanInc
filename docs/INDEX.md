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
| PI-003 | [`docs/02-architecture.md`](./02-architecture.md) | Root source layout, request flow, Mermaid diagram | ✅ Exists |
| PI-004 | [`docs/03-runtime-http-api.md`](./03-runtime-http-api.md) | HTTP surface, route groups, auth, fragments | ✅ Exists |
| PI-005 | [`docs/04-database-and-schema.md`](./04-database-and-schema.md) | Embedded SurrealDB, schema bootstrap, engine semantics | ✅ Exists |
| PI-006 | [`docs/05-deployment.md`](./05-deployment.md) | `notes.structa.cloud`, compose, networks, TLS | ✅ Exists |
| PI-007 | [`docs/06-secrets-and-superuser.md`](./06-secrets-and-superuser.md) | `.env`, superuser bootstrap, secret handling | ✅ Exists |
| PI-008 | [`docs/07-testing.md`](./07-testing.md) | The two Playwright configs and what each proves | ✅ Exists |
| PI-009 | [`docs/08-i18n.md`](./08-i18n.md) | Locales, parity rules, adding a language | ✅ Exists |
| PI-010 | [`docs/09-troubleshooting.md`](./09-troubleshooting.md) | Symptom → cause → fix entries | ✅ Exists |
| PI-011 | [`docs/10-blinko-parity-and-design-plan.md`](./10-blinko-parity-and-design-plan.md) | Blinko analysis, design-system base (HeroUI/shadcn/FlyonUI), skill + content map, UX/integration backlog, ordered P0–P11 programme, phase log (P1/P2/P3 shipped) | ✅ Exists |
| PI-023 | [`docs/10-blinko-parity-and-design-plan.md`](./10-blinko-parity-and-design-plan.md) | Appendix B — Logo & Loading brand deliverable: brand-new SVG mark, 3 lockup variants, 5 SVG size tier, `loading.svg` + `loading-dark.svg`, `index.html`/`manifest.json`/component API | ✅ Appendix B (plan) + in place |
| PI-012 | [`docs/11-parity-matrix.md`](./11-parity-matrix.md) | P0 parity matrix — one row per backlog item with Blinko evidence, file-verified PlanInc status, gap type and owning phase | ✅ Exists |
| PI-013 | [`docs/12-settings-and-appearance-reference.md`](./12-settings-and-appearance-reference.md) | Settings registry reference (generated table), appearance v2 attributes/tokens, verification commands | ✅ Exists |
| PI-014 | [`docs/13-single-frontend-platforms.md`](./13-single-frontend-platforms.md) | Single frontend directory for every platform/OS: platform model, capabilities, `useSideNav`/`useIsPhone`, responsive tiers, `<html>` attribute contract, shared token contract, build artifact wiring, and `check:platform` (12 groups) | ✅ Exists |
| PI-015 | [`docs/plans/django-bolt/00-index.md`](./plans/django-bolt/00-index.md) | Master execution plan for the Django + django-bolt migration | ✅ Exists |
| PI-016 | [`docs/plans/django-bolt/01-foundation-and-tenancy.md`](./plans/django-bolt/01-foundation-and-tenancy.md) | Remaining PostgreSQL, Redis, and tenant-isolation rehearsal gate | ✅ Exists |
| PI-017 | [`docs/plans/django-bolt/02-domain-and-api.md`](./plans/django-bolt/02-domain-and-api.md) | Domain apps, django-bolt APIs, django-fusion fragments, auth, and frontend cutover | ✅ Exists |
| PI-018 | [`docs/plans/django-bolt/03-data-migration-and-cutover.md`](./plans/django-bolt/03-data-migration-and-cutover.md) | SurrealKV export/import, parity evidence, rollback, and production cutover | ✅ Exists |
| PI-019 | [`docs/plans/django-bolt/04-realtime-operations-and-verification.md`](./plans/django-bolt/04-realtime-operations-and-verification.md) | Channels, workers, analytics, deployment, observability, and release gates | ✅ Exists |
| PI-020 | [`docs/plans/django-bolt/05-server-architecture-and-erd.md`](./plans/django-bolt/05-server-architecture-and-erd.md) | Formint Cloud-inspired PlanInc server boundaries, integrated flows, settings, and complete ERD | ✅ Exists |
| PI-021 | [`docs/plans/django-bolt/06-implementation-task-board.md`](./plans/django-bolt/06-implementation-task-board.md) | Executable implementation tasks, dependencies, evidence, and external gates | ✅ Exists |
| PI-022 | [`docs/14-agenda.md`](./14-agenda.md) | Merged Notes + Plans Agenda stream, type filters, legacy path aliases, share links, default seed pack | ✅ Exists |
| PI-024 | [`docs/15-enhancements-and-recommendations.md`](./15-enhancements-and-recommendations.md) | Enhancement plan + module audit (settings, integrations, sharing, reviews, relations), parity-matrix corrections, tooltip map, prioritised roadmap | ✅ Exists |
| PI-025 | [`docs/plans/full-program-plan.md`](./plans/full-program-plan.md) | Full program plan: tenant-per-space, allauth authority, bidirectional sync, preview/switcher, PI-024 order, verify gates | ✅ Exists |

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
