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
- Existing settings components already persist their supported values and
  enforce admin/platform visibility. The safe completion path was to add a
  declarative group manifest and responsive grouped navigation rather than
  inventing new server fields with no persistence contract.

## 2026-09-19 pagination, custom fields, and graph continuation

- View switching, pagination, and floating create buttons now live in
  `src/app/src/components/PlanincPlanning/` so every planning surface shares one
  implementation instead of ad-hoc controls.
- Custom form fields are stored per account in `planningFormFields`, keyed by
  `key` and scoped by `kind`; values live on the entity as `customFields`, which
  keeps the graph preview and the CRUD modal reading the same data.
- `planningLinks.showInGraph` is the single flag that decides whether a relation
  is drawn on the graph; the ticket relation modal can toggle it per link.
- The graph now derives node ids from `kind:entityId`, so edges can be drawn
  between any two visible nodes rather than only from the root hub.
- Resources reuse the shared view switcher; the graph reuses the same switcher
  with a `graph` label override for its canvas mode.

## 2026-09-19 ticket relation targets expansion

- Ticket relations now target notes and agents in addition to study and
  resources. Notes are loaded through `api.notes.list.mutate` because the legacy
  `notes.list` procedure is mutation-style; agents map to AI chat
  `conversation` records surfaced on `/ai`.
- `planningLinks` entity types now cover `note`, `ticket`, `study`, `resource`,
  and `agent`, with `agent` backed by the `conversation` table and the same
  account-ownership check used by the other targets.
- The graph shows a node per conversation so agent relations resolve into
  edges; a single agents hub node is kept only when the account has no
  conversations yet.

## 2026-09-19 icon warning follow-up

- The initial icon cleanup left stale `hugeicons:task-01` and
  `hugeicons:book-open-01` references in dashboard recent activity.
- Those references were replaced with `tabler:list-check` and
  `hugeicons:book-edit`, both present in the generated local registry.
- The remaining `rctx-contextmenu` `defaultProps` warning is third-party and
  is not caused by the PlanInc `ContextMenu` wrapper.

## Plans, categories, branding, approvals and htmx fragments

- **htmx already existed, but only in `runtime/`.** `runtime/server.mjs` serves
  Express + SurrealDB with a `/fragments/*` convention and ships
  `runtime/public/vendor/htmx.min.js`; the canonical app under `src/` is React +
  tRPC and the plan forbids mixing htmx into it. All htmx work therefore targets
  the runtime server, and the JSON endpoints stay as the JS fallback.
- **Pending shares must not create access.** Access is derived from
  `internalShares: { some: { accountId } }`, so an unapproved share cannot be
  represented as a `noteInternalShare` row. Pending requests live in
  `shareApprovals` and only materialise the share row on approval.
- **No mail transport exists** in the server dependencies (no nodemailer/SMTP
  client). Email invites are therefore rendered server-side and either POSTed to
  `SHARE_INVITE_WEBHOOK` when configured, or returned with the approve URL so
  the sender can share the link; acceptance always records the approval.
- **No image-generation endpoint existed.** `branding.generateLogo` calls the
  configured image model's OpenAI-compatible `/images/generations` directly and
  stores the result as an inline data URL (capped at 512 KB) instead of adding
  an SDK dependency or a file-storage path.
- **Notes have no status or date field**, only `createdAt`/`updatedAt`, so the
  plans board columns come from the new predefined categories and the calendar
  places plans on their creation date.
- **`planing/` is a 2.4 GB vendored Blinko fork with its own `.git`.** It is
  excluded via `.gitignore`; `git add` would otherwise register a nested
  repository gitlink and commit a huge dependency tree.
