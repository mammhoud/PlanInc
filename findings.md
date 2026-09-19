# Findings

## Repository and branch

- Canonical nested repository: `application/tools/PlanInc`.
- Active branch: `generic`.
- Current HEAD: `1659226f` on `generic`, pushed to `origin/generic`.
- The old `runtime/` tree still exists for legacy tests/demo behavior but is not
  the canonical application surface.

## Initial feature inventory

- Frontend routes/layout live under `src/app/src`.
- Sidebar and mobile navigation already exist under
  `src/app/src/components/Layout`.
- Existing analytics, AI, note, resource, and settings components are present.
- Backend TRPC routers are under `src/server/routerTrpc`.
- SurrealDB normalization is centralized in `src/server/db.ts`.
- Local database directories are untracked and must remain uncommitted.

## Decisions pending audit

| Feature/source | Decision | Reason |
|---|---|---|
| Current `src/` application | Keep and extend | Canonical Bun + Express + TRPC + SurrealDB app |
| Legacy `runtime/` application | Do not clone into UI | Separate legacy implementation and data model |
| Historical `planing/` tree | Audit selectively | It contains prior planning ideas but must not reintroduce Prisma/PostgreSQL |

## Committed-history evidence

- The committed `planing/` path is not a usable feature source. History shows it
  as a gitlink and later as an empty `.gitkeep` directory; there are no
  committed planning components, routes, schemas, or ticket records to clone.
- The legacy `runtime/` tree contains ticket and appearance/graph Playwright
  specs, but those tests target the obsolete standalone runtime application and
  must be treated as behavioral references only.
- Current canonical source has analytics and AI-agent surfaces, but no
  first-class ticket or study route/data model.

## Keep/port/reject matrix

| Surface | Action | Notes |
|---|---|---|
| `src/` layout, stores, TRPC, SurrealDB | Keep | Current authenticated product and data contract |
| Historical `planing/` | Reject as source | Empty/gitlink history; no implementation to merge |
| `runtime/tests/tickets.spec.mjs` | Port test intent only | Legacy selectors/API must not be copied directly |
| `runtime/tests/appearance-and-graph.spec.mjs` | Port test intent only | Use current route and component contracts |
| Existing analytics page/store | Reuse | Natural home for graph summaries and metrics |
| Existing AI agent tools | Reuse | Graph can expose agent activity without duplicating agent logic |

## Architecture implication

The requested “clone app features” work needs new canonical feature contracts,
not a file merge from `planing/`. The safest sequence is to add typed ticket and
study domain models/procedures, then compose them into the existing sidebar and
graph UI. Existing notes remain the source of truth for note nodes.

Tickets and study items are first-class account-scoped SurrealDB records with
authenticated CRUD procedures. The graph uses explicit node kinds rather than
localized labels, so navigation remains stable across locales.

Authentication uses the existing PBKDF2 password helper. The sign-in UI does
not persist plaintext passwords, and `src/server/scripts/create-superuser.ts`
provisions or updates a `superadmin` account from environment variables,
arguments, or an interactive password prompt.
