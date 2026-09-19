# PlanInc enhancement findings

## Current architecture

- Canonical app is React + HeroUI + MobX + tRPC + Bun/Express + SurrealDB.
- Sidebar lanes are currently generated from `BaseStore.routerList` and rendered
  by `Sidebar`; mobile navigation is a separate surface.
- Resources already support folder navigation, drag/move, rename, delete,
  download for files, cut/paste, selection, and New Folder through
  `ResourceStore` and attachment tRPC procedures.
- Resource upload components and Express upload routes already exist, but the
  Resources page does not expose a complete first-class upload workflow.
- Settings already has many tabs and admin/platform visibility rules; the
  enhancement should organize and extend existing forms rather than replace
  them.
- Tickets and Study already support category/tags and modal metadata editing.
- Graph currently draws SVG nodes for notes, tickets, study, and agents, but
  ticket/study nodes navigate only to collection pages and do not preview a
  specific entity.
- `BaseStore.routerList` currently places Resources, Agents, and Graph in the
  Work lane, while only Study is in Learn; Settings and Plugin are hidden from
  the sidebar. This supports moving to a declarative lane/group manifest.
- `MobileNavBar` currently renders every non-hidden route as an equal-width
  bottom-bar item, so categorization needs a mobile overflow/group strategy
  rather than simply exposing every sidebar item.
- Tickets currently use an inline create/edit form plus a category/tag modal;
  the existing form can be migrated to a shared CRUD modal without changing
  the tRPC mutations.
- The upload endpoint is authenticated and streams multipart uploads to
  `FileService`, but it currently does not receive a destination folder field.
  Resource upload must add a validated folder parameter or move the returned
  attachment after upload.
- File downloads already support `?download=true` and path validation. Folder or
  multi-file downloads need an explicit archive endpoint or a clearly surfaced
  limitation.
- Existing resource folder creation, rename, delete, move, and download actions
  are already modal/context-menu based, so the main work is to unify UX,
  expose upload, and add view/search/sort controls.

## Existing reuse points

- `src/app/src/components/Layout/Sidebar.tsx`
- `src/app/src/components/Layout/MobileNavBar.tsx`
- `src/app/src/store/baseStore.ts`
- `src/app/src/pages/resources.tsx`
- `src/app/src/store/resourceStore.tsx`
- `src/app/src/components/PlanincResource/ResourceContextMenu.tsx`
- `src/app/src/components/Common/UploadFile/index.tsx`
- `src/app/src/pages/settings.tsx`
- `src/app/src/components/PlanIncSettings/*`
- `src/app/src/pages/tickets.tsx`
- `src/app/src/pages/study.tsx`
- `src/app/src/pages/graph.tsx`
- `src/server/routerExpress/file/upload.ts`
- `src/server/routerExpress/file/file.ts`
- `src/server/routerTrpc/_app.ts`
- `src/server/routerTrpc/ticket.ts`
- `src/server/routerTrpc/note.ts`

## Design constraints

- Preserve existing PlanInc design tokens, responsive breakpoints, and current
  dashboard/sidebar work.
- Do not reintroduce Blinko branding or the deleted legacy planning project.
- Prefer one shared relation contract for lane bindings and graph edges.
- Use explicit toasts/errors; do not hide unsupported folder download behavior.
- Keep all resource, ticket, note, study, and graph queries account-scoped.

## 2026-09-19 continuation analysis

- Ticket and study records currently store nullable `noteId`/`studyItemId`
  pointers, but there is no reusable relation table or agent/resource target
  contract.
- The graph page currently renders SVG anchors to collection routes only; it
  does not expose entity IDs in navigation or provide a node preview/switch
  interaction.
- Ticket CRUD is still an inline form with a category/tag modal; this is the
  most direct surface for adding reversible lane binding without first
  rewriting every CRUD page.
- PlanInc's source workspace scripts live under `application/tools/PlanInc/src`;
  invoking them from the repository root or wrapper directory reports missing
  scripts.
- The last production web build passes. The dedicated TypeScript build still
  exhausts the available Node heap before emitting diagnostics, so it is not a
  useful gate without a memory/toolchain change.
- The legacy `notes.list` procedure is mutation-style despite its name. Calling
  it through the plain tRPC query client produces an unsupported GET request,
  so the current ticket relationship UI exposes Study targets only until a
  mutation-safe note target loader is introduced. The relationship contract
  itself remains note-capable.
- Focused relationship tests cover same-account creation, cross-account
  source/target rejection, duplicate-link reuse, and ownership-protected
  deletion.
- The root Resources page previously hid its upload control because the
  component lived inside the nested-folder breadcrumb branch. The control is
  now rendered in the shared action row, while destinationFolder remains
  conditional for nested paths.
- Ticket and Study previously duplicated inline form state and metadata modal
  behavior. The shared `PlanningCrudModal` now owns reset-on-open, normalized
  tags, loading guards, and inline mutation errors for both surfaces.
