# PlanInc navigation, resources, CRUD, settings, and graph enhancement plan

## Goal

Make the PlanInc workspace easier to scan and operate by grouping every sidebar
destination into clear lanes, upgrading Resources into a complete file manager,
standardizing modal CRUD flows, expanding settings forms with useful custom
fields, adding ticket list/card/grid switching, and connecting tickets, notes,
and graph nodes through explicit links and preview modals.

## Scope

- Canonical React/Bun/tRPC/SurrealDB application under `src/`.
- Preserve the current PlanInc visual language, responsive behavior, account
  scoping, and existing local fixes.
- Do not revive the deleted legacy `planing/` implementation.
- Do not mix HTMX/Alpine into the canonical React surface; reuse existing
  React, HeroUI, MobX, tRPC, and modal patterns.

## Phases

### Phase 1 — Inventory and navigation information architecture

**Status:** complete

- Inventory every route in `BaseStore.routerList`, mobile navigation, and
  settings tabs.
- Define stable sidebar lanes:
  - Work: Dashboard, Notes, Todo, Tickets, Review, Analytics.
  - Knowledge: Resources, Graph, Study, Agents.
  - System: Settings and account/admin destinations.
- Decide which destinations remain direct links versus grouped collapsible
  sections, and keep mobile navigation discoverable.
- Add active-state, keyboard-focus, translation, and collapsed-sidebar rules.

**Exit criteria:** one route manifest drives desktop and mobile navigation, no
duplicate links remain, and all current routes remain reachable.

### Phase 2 — Resources file-manager completion

**Status:** complete

- Map the existing attachment/file API and identify missing operations for:
  upload, directory creation, directory rename/delete, file rename/delete,
  download, move, copy/paste, and multi-select.
- Add an explicit upload entry point that accepts files into the current folder,
  shows progress/errors, and refreshes the current listing.
- Preserve and improve New Folder with duplicate-name and invalid-name
  validation.
- Add folder-aware download behavior (single file and selected files where the
  backend supports archive generation); otherwise show an explicit unsupported
  state instead of silently failing.
- Add list/grid view switching, search, sort, selection toolbar, breadcrumb
  navigation, and empty/loading/error states.
- Keep all file operations account-scoped and prevent path traversal.

**Exit criteria:** users can upload, create directories, rename, move, delete,
and download resources from desktop and mobile with visible success/failure
feedback.

- Completed upload, folder-aware archive download, search, sort, selection,
  list/grid switching, and destination-folder support.
- Remaining archive authorization/path-traversal tests are tracked in Phase 7.

### Phase 3 — Shared modal CRUD foundation

**Status:** in_progress

- Standardize modal shells for create, edit, preview, delete confirmation, and
  destructive-operation errors.
- Extract shared form primitives for title, description, status, category, tags,
  links, validation, dirty-state handling, submit/loading state, and reset on
  cancel.
- Apply the foundation to Tickets, Study, Resources, and any existing CRUD
  surfaces without changing their account boundaries.
- Make modal close, escape, cancel, and failed-submit behavior deterministic.

**Exit criteria:** each CRUD surface has consistent create/edit/delete modals,
field validation, error reporting, and no stale state after reopening.

### Phase 4 — Settings custom fields and form enhancements

**Status:** pending

- Group settings into General, Appearance, Workspace, AI/Integrations,
  Automation, Storage/Data, Security, and About.
- Add reusable setting-field components for text, number, select, multi-select,
  toggle, secret/password, URL, JSON, and file inputs.
- Add field descriptions, validation, reset-to-default, save status, and
  permission/platform visibility.
- Extend relevant settings forms with useful custom fields only where the
  backend/store already supports persistence; define tRPC/store contracts
  before adding new persisted values.
- Keep admin-only settings protected and avoid exposing secret values in logs or
  rendered summaries.

**Exit criteria:** settings are searchable by group and field, forms work on
  mobile, persisted values round-trip, and unauthorized settings remain hidden.

### Phase 5 — Ticket list/card/grid views and lane binding

**Status:** in_progress

- Add a view switcher with accessible list, compact card, and grid modes.
- Persist the selected view per user/device without breaking existing filters.
- Keep category/tag/status/priority filters consistent in every mode.
- Add “bind/move to lane” actions so a ticket can be associated with Notes,
  Study, Agents, or another supported lane.
- Define the relationship model explicitly: ticket-to-note links, ticket-to-study
  links, and optional graph edge metadata; preserve account ownership checks.
- Add a related-items panel to ticket detail/edit modals.
- Added an account-scoped `planningLinks` router and a reversible Study
  binding modal on ticket cards. Note-capable links are supported server-side;
  the current ticket UI intentionally exposes Study targets only until the
  legacy mutation-style note list client is migrated safely.

**Exit criteria:** tickets can be viewed in all three layouts, filtered without
  losing context, and linked to another lane through a persisted, reversible
  action.

### Phase 6 — Graph links, previews, and switch modal

**Status:** in_progress

- Replace route-only graph anchors with typed node targets carrying entity ID,
  kind, label, and preview metadata.
- Add note, ticket, study, resource, and agent node links only when the target
  exists and belongs to the current account.
- Add a node preview modal with title, type, metadata, related links, and
  open-full-page action.
- Add a graph switch modal/filter for node types and relationships.
- Make graph nodes keyboard accessible and usable at mobile widths.
- Reuse the same relationship records created by lane binding; do not maintain
  a second disconnected graph state.
- Added account-scoped link loading, accessible SVG node buttons, read-only
  previews, and node-kind visibility filters backed by the shared link data.

**Exit criteria:** clicking a graph node opens a preview, users can switch
  visible node/edge types, and “open” navigates to the correct detail surface.

### Phase 7 — Validation, documentation, and release

**Status:** pending

- Add focused server tests for resource operations, relationship ownership,
  settings validation, and graph preview data.
- Add Playwright coverage for responsive navigation, resource upload/folder/
  download flows, CRUD modals, ticket view switching, lane binding, and graph
  preview/switch behavior.
- Run frontend/backend builds, targeted Bun tests, route smoke checks, and
  `git diff --check`.
- Update product documentation and translations.
- Review for duplicate routes, stale branding, unsafe file paths, secrets, and
  accidental changes outside PlanInc.
- Commit and push to `origin/generic` only after all required checks pass.

## Decisions to confirm before implementation

1. Resource directory downloads: generate a ZIP for selected files/folders.
2. Lane binding: should a ticket link to one target item, many target items, or
   both depending on lane?
3. Settings custom fields: which fields must be persisted server-side versus
   device-local preferences?
4. Graph preview: should previews be read-only, or include inline edit/delete?

## Dependencies

- Existing attachment endpoints and `ResourceStore`.
- `BaseStore.routerList`, `Sidebar`, and `MobileNavBar`.
- Existing `DialogStore`, `DialogStandaloneStore`, HeroUI form controls, and
  toast/error patterns.
- Ticket/study tRPC routers and account-scoped database helpers.
- Note/resource stores and current graph page.
- Existing Playwright/Bun smoke-test setup.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Resource API cannot archive folders | Implement file download first and expose a clear folder limitation until a safe archive endpoint exists. |
| Relationship model duplicates graph state | Create one account-scoped relation contract and derive graph edges from it. |
| Settings values lack persistence | Separate device-local fields from server settings and do not pretend unsaved fields persisted. |
| Sidebar becomes crowded | Use stable lanes and progressive disclosure while preserving direct access. |
| Modal state leaks between records | Reset form state from the selected record key and test reopen/cancel flows. |

## Fixture preview validation

**Status:** complete

- Added an idempotent planning fixture loader for every existing account.
- Loaded three tickets and two studies per account without duplicating records.
- Restarted the canonical watch server with the shared `src/.env` database path.
- Authenticated browser preview confirmed dashboard, tickets, study, and graph
  fixture content; analytics, resources, and settings also rendered successfully.
- Route smoke tests returned HTTP 200 for every planning route.
- Server logs contained no application errors or failed API requests. Existing
  icon fallback and third-party deprecation warnings remain non-blocking.

## Next Step

Implement the shared relationship contract and ticket lane-binding controls,
then derive graph links and previews from the same account-scoped records.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Playwright CLI browser installation rejected macOS 12 | Prior verification | Use the integrated browser for visual checks and retain CLI coverage for environments with supported browser binaries. |
| Low disk space during Playwright MCP package install | Prior verification | Avoid package installation and broad cache generation; continue with existing tools. |
