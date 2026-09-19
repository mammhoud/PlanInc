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

Phase 1 is complete. The next action is to finalize the account-scoped resource
archive and lane-relationship contracts.

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
