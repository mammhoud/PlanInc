# PlanInc enhancement planning progress

## 2026-09-19

- Created a new scoped plan for sidebar categorization, resource file-manager
  operations, shared CRUD modals, settings form expansion, ticket view modes,
  lane binding, and graph previews.
- Confirmed the canonical implementation surfaces and existing reusable APIs.
- Completed the route/navigation/resource/ticket/graph inventory. Found that
  Resources already have authenticated file download and most folder CRUD, but
  upload is not exposed on the page and does not accept a destination folder.
- No product code changed in this planning pass.

## Current status

Phase 8 is complete in code. The next action is to run the canonical web build
and focused server tests with the Bun toolchain installed.

## Decision

- Resource downloads must support ZIP archives for selected files and folders.

## 2026-09-19 — Resources implementation checkpoint

- Added destination-folder support to authenticated uploads for local and S3
  storage.
- Added authenticated ZIP downloads for selected files and folders.
- Added resource-page upload and selected-download controls plus folder archive
  action in the resource context menu.
- Added a focused upload integration test for nested destination folders.
- Backend bundle, frontend production build, and focused upload tests pass.
- Fixed a JSX composition error found by the first frontend build.
- Resources phase remains in progress; list/grid/search/sort and archive route
  coverage are still pending.

## 2026-09-19 — Fixture preview validation complete

- Added `seed:planning-fixtures`, an idempotent account-scoped fixture loader
  for representative tickets and studies across every existing account.
- Restarted the canonical server from `src/server` with `--env-file ../.env`
  so fixtures and browser requests use the same database.
- Authenticated browser preview confirmed fixture tickets and studies, and all
  seven planning routes rendered successfully after async loading.
- Server logs showed no application errors. Non-blocking icon fallback and
  dependency deprecation warnings remain documented for later cleanup.

## 2026-09-19 — Relationship and graph checkpoint

- Added the account-scoped `planningLinks` table contract, indexes, ownership
  checks, duplicate prevention, and create/list/delete tRPC procedures.
- Added reversible ticket-to-study binding controls with related-item display.
- Added accessible graph node buttons, read-only previews, and node-kind
  filters using the same relationship records.
- Production web build passed and focused upload coverage remains green
  (11 tests).
- Added focused relationship authorization coverage; the combined upload and
  relationship suite passes all 16 tests.
- During preview, the legacy `notes.list` mutation-style endpoint was
  mistakenly queried from the new ticket target loader; it caused HTTP 405
  errors and was removed from that UI path. The server router remains
  note-capable, and no new errors appeared after the fix.

## 2026-09-19 — Resource upload visibility and validation checkpoint

- Moved the upload control out of the folder-only breadcrumb branch so upload
  is available at the resource root and inside nested folders.
- Verified the authenticated Resources page exposes `Choose File` and
  `Upload` controls at `/resources`.
- Planning smoke, relationship authorization, and upload integration suites
  pass: 19 tests total.
- Route smoke checks for `/dashboard` and `/resources` returned HTTP 200.
- The production web build passes; existing icon fallback warnings remain
  non-blocking and do not prevent interaction.
- Authenticated browser checks also confirmed fixture tickets, tag/category
  filters, List/Cards/Grid switching, Related items actions, and Graph route
  rendering. The browser still reports the existing third-party
  `defaultProps` deprecation from `rctx-contextmenu`; it is not an application
  runtime failure.

## 2026-09-19 — Shared CRUD modal checkpoint

- Added `PlanningCrudModal` as the shared Ticket/Study create and edit shell.
- Modal state resets from the selected item on open, trims and normalizes
  fields, disables close actions while saving, and surfaces failed mutations
  inline without silently closing.
- Replaced duplicated inline Ticket and Study CRUD form logic with the shared
  modal.
- Planning smoke and relationship tests pass (8 tests); the production web
  build passes.
- An attempted `build:no-pwa` command was invalid for the current package
  scripts; the canonical `build:web` command was used successfully instead.

## 2026-09-19 — PlanInc plan completion

- Added grouped Settings navigation for General, Workspace, AI & Integrations,
  Automation, Storage & Data, Security, and About.
- Preserved existing settings persistence, admin-only visibility, desktop-only
  hotkey behavior, and responsive mobile tabs.
- Added selection recovery when search filters hide the currently selected
  settings tab.
- Final validation passed: production build, 19 focused server tests, route
  smoke checks, `git diff --check`, and authenticated browser checks for
  Resources, Tickets, Graph, and Settings.
- All PlanInc phases are now complete and the final checkpoint was pushed to
  both `PlanInc:generic` and `workspace:generic`.

## 2026-09-19 — Pagination, custom forms, graph tooltips, and navigation polish

- Added shared `PlanningViewSwitch`, `PlanningPagination`, and `PlanningFab`
  components; Tickets and Study gained list/cards/grid switching, page-size
  controls, and a floating create button matching the notes add-button style.
  Resources now reuses the shared switcher, and Graph gained a Graph/List view.
- Added the account-scoped `planningFormFields` table (indexed and unique per
  account/kind/key) plus the `planningFields` router with create/update/delete
  validation. Ticket and Study records now carry `customFields`, and the shared
  CRUD modal renders the configured fields with required validation.
- Added Settings → Forms (`FormFieldSetting`) to manage field definitions,
  including type, options, required, order, enabled, and a `showInGraph` flag.
- Extended `planningLinks` with a `showInGraph` flag and `resource` targets;
  ticket relation editing can toggle graph visibility per link.
- Rebuilt the graph around a generic node model (notes, tickets, study,
  resources, agents) with native tooltips, a hover info strip, relation-count
  badges, `showInGraph`-gated edges, and a paginated node list plus richer
  previews (status, tags, `showInGraph` custom fields, labelled relations).
- Reorganised sidebar lanes into Planning, Work, Knowledge, Insights, and
  System.
- Added focused validation tests for the custom form-field schema and updated
  the planning-link tests for the new `showInGraph` default.

## 2026-09-19 — Graph Escape-back and canvas shortcut hint

- `Escape` in the graph preview now steps back to the previously visited node
  when the history stack is non-empty, and only closes the preview once there
  is nothing to go back to. HeroUI's own keyboard dismiss is disabled on that
  modal so the two handlers cannot fight over the key.
- The step-through shortcut hint is now shown on the graph canvas (under the
  SVG, whenever the graph has relations) as well as inside the preview, sharing
  the `graph-step-hint` string.

## 2026-09-19 — Graph keyboard stepping and focus stability

- While a graph preview is open, `←`/`→` step through the focused node's
  related nodes without closing the preview, and `Backspace` walks back through
  the visited-node history. Canvas clicks and relation clicks share the same
  focus helper so they also populate that history.
- The preview shows a small shortcut hint whenever the node has related items.
- The camera animation now runs once per focused node id (tracked in a ref), so
  a background data refresh that rebuilds the node positions no longer restarts
  the focus animation while the preview is open. Revealing a hidden node kind
  still focuses once its position becomes available.

## 2026-09-19 — Graph drill-down animation and TODO view controls

- Drilling into a related graph node now animates the SVG camera: selecting a
  node (from the canvas or from a relation row) eases the `viewBox` to a 55%
  zoom centred on that node, and closing the preview eases back to the full
  view. The animation runs on `requestAnimationFrame` with an ease-in-out cubic
  curve and is cancelled on unmount.
- The focused node gets a static emphasis ring plus a pulsing ring (SVG SMIL),
  and a thicker stroke so it stays identifiable behind the preview modal.
- Clicking a relation whose kind is currently filtered out now reveals that
  kind before centring, so the drill-down target is always visible.
- The notes view switch and pagination now also drive the TODO view: `Timeline`
  (the grouped date view, paginated per page of todos), `Cards`, and `Grid`.

## 2026-09-19 — Notes view switch, pagination, and clickable graph relations

- The notes home page (`/`, `/?path=...`) now exposes the shared
  list/cards/grid view switcher and the shared pagination footer. Cards keeps
  the masonry drag-and-drop experience (scoped to the current page), while list
  and grid render plain `PlanIncCard`s. Page size is persisted per device and
  the page resets when the route, filters, or view mode change.
- Pagination operates over the notes already loaded by the existing server
  paging/infinite-scroll, so no data-loading contract changed.
- Graph node previews now render relations as clickable rows: clicking a
  related note, agent, ticket, study item, or resource opens that node's
  preview, with a fallback navigation when the target node is not loaded.

## 2026-09-19 — Ticket relation targets

- Extended `planningLinks` entity types with `agent`, mapped to the
  account-scoped `conversation` table, alongside the existing note/ticket/study
  and resource targets.
- The ticket Related items modal now links to notes (loaded via the
  mutation-style `notes.list.mutate`) and agents (conversations) in addition to
  study items and resources, and labels each relation by its target kind.
- The graph renders one node per AI conversation so agent relations resolve to
  edges, falling back to a single agents hub when no conversations exist.
- Added planning-link coverage for the agent target.

## 2026-09-19 — Icon fallback cleanup

- Replaced stale local icon names in navigation, dashboard recent activity,
  Tickets, Study, and Resources with entries present in the generated registry.
- `git diff --check` passed.
- Production `build:web` passed; only pre-existing case-sensitive AI tool import
  warnings remain.
- Focused planning smoke and relationship tests pass: 8 tests, 0 failures.
- The integrated Playwright MCP could not start because the environment is out
  of disk space while installing `@playwright/mcp`; prior authenticated browser
  validation remains the available UI evidence.

## 2026-09-19 — Graph keyboard shortcut help overlay

- Added a help overlay on the graph that lists every graph keyboard shortcut:
  Tab / Enter / Space to focus and open a node, ← / → to step through related
  nodes, Backspace to go back through visited nodes, Esc to close or go back,
  and ? to toggle the overlay. Each row renders its keys as `<kbd>` chips.
- The overlay opens with the `?` key from anywhere on the page (ignored while
  typing in an input, textarea, or contenteditable field) and also from a
  keyboard icon button in the graph toolbar, which carries
  `aria-keyshortcuts="?"`.
- While the overlay is open it owns keyboard input, so the preview's relation
  stepping and Escape handling pause until it closes; Escape dismisses it.
- Canvas `Enter` / `Space` now route through the same `focusNode` helper as
  mouse clicks, so keyboard-opened previews populate the back-navigation
  history and reveal filtered-out node kinds identically.
- Coverage: added `graph-shortcuts`, `graph-shortcuts-description`, and the
  `shortcut-*` label keys to the English locale, and extended the existing
  canvas hint to advertise `?`.
- `translation.json` parses cleanly. Build/test verification is blocked in this
  environment (no `bun`, `src/node_modules` absent) — run `bun install &&
  bun run build:web` plus the server suite before committing.

## 2026-09-19 — Plans, categories, branding, approvals and htmx lists

**Interrupted htmx work completed.** The `/fragments/notes` and
`/fragments/tickets` routes now have their shell wiring: a live filter form,
filter-chip row and pagination nav in `runtime/public/index.html`, an
`htmx:afterSwap` re-bind hook plus lane-select sync in `runtime/public/app.js`,
the `htmxAidedLoad` dispatch that also unblocks the existing audit fragment, and
the fragment styles in `runtime/public/styles.css`. New i18n keys were added to
both locales and the i18n parity checks (same key set, translated Arabic, every
`data-i18n` hook resolving) pass locally; `node --check` passes for
`runtime/server.mjs` and `runtime/public/app.js`.

- **Plans rename + views.** The sidebar entry is now `plans` (route `?path=todo`
  kept). Plans have their own persisted view (`planinc:plans:view`) offering
  **Board**, **Calendar**, **Cards** and **Timeline**; the shared
  `PlanningViewSwitch` gained `kanban`, `calendar` and `timeline` modes.
- **Predefined categories.** New `planningCategories` table (unique per account
  and slug) with `planningCategory` router (list/create/update/delete/reorder/
  assign/seedDefaults), preset colour + icon palettes, and a Settings →
  Categories section. Notes gained an optional `categoryId`; the board columns,
  category filter chips and per-card "move to category" picker all use it.
- **Form fields.** The existing custom-form-field settings section already
  covers add/edit/remove/enable, and it is now grouped with categories under
  Settings → Forms.
- **Workspace logo.** New `branding` router (`get`, `setLogo`,
  `searchImages`, `generateLogo`) and a Settings → Workspace logo section: paste
  a URL, pick a searchable image resource, or generate a mark with the
  configured image model (stored inline as a data URL).
- **Default palette.** Added `src/app/src/lib/themePalettes.ts` with the
  preplixity palette as the runtime default and one-click presets in Appearance.
- **Share approvals.** Added the `shareApprovals` table + `shareApproval`
  router implementing all three layers: recipient in-app approval, email invite
  with an approve token, and an admin gate (`requireShareApproval`). The share
  dialog now requests rather than grants access, shows request status, and can
  send email invites; a Settings → Share approvals section reviews incoming,
  outgoing and admin queues.
- **Agent directories.** Added the `agentDirectories` table + router and an AI
  settings section for working dirs and ordered skills dirs (add/remove/default/
  move up-down).
- **Tests.** New unit coverage for the category schema/slugging/presets, agent
  directory path validation and label derivation, and the share approval schema,
  token generator and procedure surface.
- **Repository hygiene.** Root `.gitignore` now excludes the legacy `planing/`
  vendored fork (2.4 GB, nested git dir) plus build/test artefacts.

Verification: no Bun toolchain or `src/node_modules` in this environment, so
`bun install && bun run build:web` plus the server suite still need to be run
before release. `node --check` passes for the runtime server and client, and the
English translation catalogue parses.
