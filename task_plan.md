# PlanInc navigation, planning, and graph completion

## Goal

Extend the canonical SurrealDB/Bun PlanInc application without replacing its
current visual language or reintroducing the removed legacy `planing/` app.
Deliver a responsive sidebar with two navigation lanes, a Study category,
graph views for notes/tickets/agents/study, and an auditable ticket map based on
current code and committed history.

## Scope guardrails

- Keep the canonical application under `src/`; do not revive the old Prisma/
  PostgreSQL `planing/` tree.
- Preserve the existing authenticated layout, note editor, theme tokens, and
  responsive behavior.
- Reuse current TRPC/data helpers and schemas before adding new endpoints.
- Do not commit local SurrealDB data directories or credentials.

## Tickets

### Ticket 1 — Audit planning history and current feature surfaces
**Status:** complete

- Inspect current navigation, routes, stores, graph/analytics components,
  server procedures, seed data, and tests.
- Inspect committed `planing/` history and current commits for features that
  are safe to port.
- Record duplicate/dead code and explicit keep/port/reject decisions.

### Ticket 2 — Define a stable navigation information architecture
**Status:** complete

- Preserve current primary navigation and split additions into two labeled
  lanes: **Work** (notes, tickets, agents, graph) and **Learn** (study).
- Add responsive behavior for desktop collapse, mobile drawer, keyboard focus,
  and active-route state.

### Ticket 3 — Add Study as a first-class category
**Status:** complete

- Reuse note/category data contracts where possible.
- Add route/store/query wiring only where the existing app has no suitable
  surface.
- Keep empty, loading, and error states explicit.

### Ticket 4 — Add graph views for notes, tickets, agents, and study
**Status:** complete

- Reuse an existing graph implementation if present.
- Otherwise add a small typed graph model and responsive visualization surface
  that works in browser and Tauri.
- Ensure graph nodes link back to canonical routes and respect auth boundaries.

### Ticket 5 — Add ticket creation/list/detail flows
**Status:** complete

- Confirm whether ticket records already exist in the current SurrealDB schema.
- Port only committed features compatible with the current data layer.
- Add focused server and UI tests for create/list/update/navigation behavior.

### Ticket 6 — Responsive design pass and regression verification
**Status:** complete

- Preserve current design tokens and improve layout at mobile, tablet, and
  desktop widths.
- Run focused type/build checks and browser verification.
- Review diff for dead code, duplicate implementations, generated artifacts, and
  accidental data changes.

### Ticket 7 — Complete ticket and study CRUD UX
**Status:** complete

- Add explicit edit, delete, status, and priority controls for tickets.
- Add edit, status, source-link, and delete controls for study items.
- Add loading/error states and prevent duplicate submissions.

### Ticket 8 — Complete graph relationships and navigation
**Status:** complete

- Model note, ticket, study, and agent nodes with typed edges.
- Make graph nodes navigable to their owning page or record.
- Keep the graph responsive and usable at narrow widths.

### Ticket 9 — Add focused regression coverage
**Status:** complete

- Add API smoke coverage for protected ticket/study procedures and new pages.
- Keep account-scoped CRUD enforcement covered by the authenticated router
  implementation and existing server validation paths.
- Re-run builds and diff/data-artifact checks.

### Ticket 10 — Finalize plan artifacts and delivery review
**Status:** complete

- Reconcile all ticket statuses, findings, and errors.
- Confirm no local databases, build output, credentials, or legacy duplicate
  sources are staged.
- Provide a feature/commit map and exact validation results.

### Ticket 11 — Harden authentication and provisioning
**Status:** complete

- Remove plaintext password persistence from the sign-in flow.
- Add a hashed, environment-driven superuser provisioning command.
- Verify authenticated navigation and invalid-credential handling.
- Document credential handling and local provisioning.

## Current phase

All planned phases complete.

## Next step

No planned implementation steps remain. Keep local SurrealDB data ignored and
review the feature/validation summary before any optional commit.

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Frontend `tsc --noEmit` exhausted the default ~2 GB heap | 1 | Use the app's configured `build:web` command with a 4 GB Node heap; retain the failure as a validation limitation if the host cannot provide it |
| Frontend/server `tsc` remained resource-bound after the larger-heap retry | 2 | Stopped the long-running checks; production frontend and backend builds passed, plus HTTP smoke checks |
| Full legacy Playwright suite could not start because Docker was unavailable | 1 | Ran canonical authenticated browser checks and focused API smoke tests instead |
| Integrated Playwright MCP could not launch the configured Chrome binary | 1 | Used the available browser automation surface for sign-in and post-auth navigation checks |
| A full disk caused temporary `ENOSPC` build failures | 1 | Cleared generated Vite/Bun caches, ignored database artifacts, and reran builds successfully |
