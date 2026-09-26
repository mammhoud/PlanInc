# PlanInc Full Program Plan (PI-025)

> Part of **PlanInc** — AI-powered card note-taking and planning
>
> **Status:** Active execution plan
> **Sources:** PI-020 (server architecture + ERD), PI-021 (task board
> `06-implementation-task-board.md`), PI-024 (enhancement order), PI-007
> (secrets/superuser), PI-006 (deployment).
> **Reference model:** `projects/POS/formint-cloud` — Django serves the API
> directly (`backend/apps/{core,domain,handlers}`), Unfold admin, Channels
> sync, shared DB, Makefile orchestration.

## Milestone 0 — Verified baseline (read-only)

- [x] Done — `planinc` container healthy `:1111`; `/health` 200 locally and at
  `https://notes.structa.cloud/health`.
- [x] Done — Auth: `admin` superadmin (id 1); `POST /api/auth/login` 200;
  canonical smoke 3/3 + 5/5 authenticated pages.
- [x] Done — Django `manage.py check` clean; `manage.py test` 16/16 OK
  (tenant-header case fix, test `ALLOWED_HOSTS`, notes/workspaces listing
  pagination + tests, TS `note.ts` withLink/hasTodo AND-scope fix).
- [x] Done — Traefik: global
  `application/proxy/configs/traefik/dynamic/notes.yml` routes
  `notes.structa.cloud → planinc:1111` on `common`. No project-local proxy
  file exists yet.

## Milestone 1 — Tenant DB per space + project Traefik (docs + snippet only)

- [x] Done — `django-tenants.schema_name` wiring: provisioning sets
  `schema_name`, per-space schema routing helper + docs; SQLite tests prove
  isolation. No live Postgres (board A4 stays Blocked externally).
- [x] Done — Workspace↔tenant guard: workspace-scoped queryset helpers +
  `require_workspace` (mirrors `middleware/tenant.py` require_tenant);
  membership role check on note/workspace writes.
- [x] Done — New `traefik/notes.yml` project example vhost (mirrors global
  rules: `Host(notes.structa.cloud)`, `planinc:1111`, `common` network,
  `/health` check) + `docs/05-deployment.md` wiring section. Global proxy
  files untouched; snippet validated with `docker compose config -q`.

## Milestone 2 — Auth: allauth authority, GitHub + Google

- [x] Done — Django: `django-allauth` (+`github`, `google`) in
  `pyproject.toml`/settings/migrations; env-driven providers, no secrets in
  repo; link `Membership` by verified email → `Tenant`.
- [x] Done — Django issues session JWT (claims shape =
  `server/lib/helper.ts` generateToken: `sub/name/role/exp/iat`); TS
  `verifyToken` accepts via shared secret; passport-local stays as fallback
  to E6. Contract tests for both verifiers.
- [x] Done — Signin page: dynamic provider buttons kept; loading/disabled/
  error states, same-origin `redirect` validation, 2FA handoff preserved.
  i18n: reuse existing keys only (PI-009 parity).

## Milestone 3 — Bidirectional Surreal ↔ Postgres workspace sync (multi-user cloud)

- [x] Done — Surreal→Postgres importer command: accounts→Tenant/User/Member,
  notes→workspaces; idempotent keys; rejected-record report (board E2).
- [x] Done — Postgres→Surreal publisher: outbox consumer → auth-gated TS
  ingest, idempotency-keyed; tombstones on delete (formint-cloud
  `tombstones.py` pattern).
- [x] Done — Conflict rule documented + tested: last-writer-wins per
  `(aggregate_id, updated_at)` + dedupe; writes require
  `can_access_workspace` editor+.
- [x] Done — Invite flow: admin+ invites → token accept → `WorkspaceMember`;
  tenant-scoped tests throughout.

## Milestone 4 — Demo/preview + floating switcher + README demo link

- [x] Done — Public `/preview` route (lazy `pages/preview.tsx`, listed in
  `publicRoutes`): static mock screens (Agenda/Nodes/Graph) on
  `GradientBackground` waterPlane shader; no login, no DB.
- [x] Done — `Common/ScreenSwitcher/`: fixed right-center vertical tabs,
  collapsible, fade/slide transitions, `GuidedTooltip` hints, token-only
  styling (`var(--pi-*)`), no hardcoded colors.
- [x] Done — README: Live Demo + `/preview` links, auth-bg note, animated-view
  description.

## Milestone 5 — PI-024 enhancements (priority order)

- [x] Done — S1 share preview (`PreviewCard` in share dialog).
- [x] Done — R2 review-confetti gate fix.
- [x] Done — R1 review strip (reviewed-today, streak, queue).
- [ ] Remaining — I1/I2 webhook completion + plugin capability warning.
- [x] Done — M2 graph module legend (`pages/graph.tsx` legend row).
- [ ] Remaining — M1 related strip (inline cross-links per module).
- [ ] Remaining — #8 setting-value tooltips (`ConfigTooltip` exists in
  `Common/InteractiveTooltip.tsx`, unused — rollout pending).
- [ ] Remaining — #10 insights single entry point.

## Milestone 6 — Verify gates (all green before sign-off)

- [x] Done — `bun run --cwd frontend check:contracts`, `tsc --noEmit`.
- [x] Done — `PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical`.
- [x] Done — Django `manage.py check` + `manage.py test` green.
- [x] Done — `docker compose config -q` on new Traefik snippet; `/health`
  both endpoints.
- [x] Done — Task-board flips (B2/C1/C2/D4/E2) recorded with evidence;
  `docs/INDEX.md` PI-025 row marked complete.

Gate results: contracts PASSED (159 raw, baseline 169); tsc clean on touched
files; canonical 3 passed (6 auth-gated skipped without creds); Django
check clean + 30/30 tests OK; compose config OK; traefik snippet YAML OK;
`/health` 200 local + remote. C2/D4/E3-E6 remain Pending per board (no
evidence yet).

## Sequencing

Milestones 1–2 → 2 (allauth) → 3 (sync) → 4 (preview/switcher) → 5 (PI-024)
→ 6 (verify). If staging OAuth creds are unavailable, Milestone 2 lands
code-complete behind the TS-fallback flag and Milestone 3 proceeds on SQLite.
