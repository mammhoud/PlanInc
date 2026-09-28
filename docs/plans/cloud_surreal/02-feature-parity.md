# Phase 2: cloud_surreal Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce every frontend-visible feature of `server/` (TS/tRPC/Express) and `django_server/` (Django) inside `cloud_surreal/`, with no unowned client request.

**Architecture:** One `app/domain/<area>.py` service per area holding all business rules; one `app/routers/<area>.py` mapping tRPC procedure names to services; Express-compatible route modules for non-tRPC surfaces. Services are the only callers of `SurrealClient`.

**Tech Stack:** Robyn, `surrealdb`, `pytest`.

**Spec:** [`00-index.md`](./00-index.md), [`01-foundation-and-runtime.md`](./01-foundation-and-runtime.md)

## Scope Check

This phase covers many independent subsystems. Per the writing-plans scope rule, **each slice below is executed as its own task sequence** — do not attempt them in one pass. The slices are ordered so each ships working, testable software.

## Global Constraints

- All of Phase 1's constraints apply.
- Procedure names and input/output shapes must match `frontend/src/lib/apiTypes.ts` and `server/routerTrpc/*` exactly; a mismatch is a bug, not a rename.
- The Django tenancy/workspace guard is preserved as a policy in `app/domain/policies.py` (tenant scope + membership role), not as an ORM.

## Parity Surface (from the checkouts)

**tRPC routers to port (`server/routerTrpc/` → `app/routers/`):**
`note`, `ticket`, `task`, `study`, `planningField`, `planningCategory`, `planningLink`, `tag`, `comment`, `attachment`, `conversation`, `message`, `agentDirectory`, `ai`, `aiScheduledTask`, `skill`, `mcpServers`, `plugin`, `notification`, `analytics`, `config`, `branding`, `font`, `user`, `follows`, `shareApproval`, `public`, `_app`.

**Express routes to port (`server/routerExpress/` → `app/routes/`):**
`auth/`, `file/` (`upload`, `delete`, `archive`, `plugin`, `s3file`, `upload-by-url`), `openai`, `mcp`, `sync`, `rss`.

**Django-only behaviour to preserve:** tenant provisioning/suspension, workspace membership roles, tenant-scoped notes CRUD, outbox events, Channels `/ws/tenant` (Phase 3), import/export commands.

## Slice Order

1. **S1 Identity** — `user`, auth routes, JWT login/logout, memberships, policies.
2. **S2 Notes core** — `note`, `tag`, `comment`, `attachment` listing, tenant scope. Gate: create/edit/delete/share pass for two tenants.
3. **S3 Planning** — `task`, `ticket`, `study`, `planningField`, `planningCategory`, `planningLink`.
4. **S4 Files** — upload/download/archive, tenant-prefixed keys, path-traversal guards (Review Focus 4).
5. **S5 Analytics and config** — `analytics`, `config`, `branding`, `font`, `notification`.
6. **S6 Collaboration** — `follows`, `shareApproval`, `public`, `conversation`, `message`, `agentDirectory`.
7. **S7 Integrations** — `skill`, `mcpServers`, `plugin`, `rss`, `mcp`, `sync` (Phase 3 owns the channel).
8. **S8 AI** — `ai`, `aiScheduledTask`, `openai` (Phase 4 owns provider internals).

## Task Board

| ID | Slice | Task | Depends on | Status |
| --- | --- | --- | --- | --- |
| P2-S1a | S1 | `app/domain/policies.py`: `require_tenant`, `require_workspace_role` | Phase 1 | Done — `app/domain/policies.py` (+ `require_authenticated`/`require_role`/`require_superadmin`) |
| P2-S1b | S1 | `user` router + `/api/auth/*` compatible login/logout | S1a | Done — `app/domain/users.py`, `app/routers/user.py`, `app/routes/auth.py` (incl. TOTP 2FA and OAuth2) |
| P2-S1c | S1 | Contract tests: login/logout/token against frontend fixtures | S1b | Partial — the identity test suite covers login/logout/profile/validate-token/2FA/OAuth and token claim shapes; live frontend-fixture capture is Phase 6 Task X4 |
| P2-S1d | S1 | Superuser bootstrap (`PLANINC_SUPERUSER_*`, `data/superuser.txt`) | S1b | Done — `app/domain/superuser.py`, opt-in startup handler in `create_app`; `tests/test_superuser.py` covers all four TS branches, the 12-char floor, first-boot-only note writing, and never-fatal failures |
| P2-S2a | S2 | `note` service + router (list/detail/upsert/delete/reference/review) | S1b | Done — `app/domain/notes.py`, `app/routers/note.py` (`notes.*`) |
| P2-S2b | S2 | `tag`, `comment`, `attachment` listing | S2a | Done — `app/domain/collections.py`, `app/routers/collection.py` (`tags.*`/`comments.*` listing); attachments moved to S4 |
| P2-S2c | S2 | Two-tenant isolation tests | S2b | Done — `tests/test_notes_router.py::test_notes_are_isolated_between_accounts` + account-scoped service tests |
| P2-S3 | S3 | planning family routers | S2a | Done — `app/domain/{store,planning}.py`, `app/routers/planning.py` (`tickets.*`/`study.*`/`task.*`/`planning*.*`) |
| P2-S4 | S4 | file routes + traversal tests | S1b | Done — `app/domain/files.py`, `app/routers/attachment.py`, `app/routes/{http,file}.py`; guards covered by `tests/test_file_{storage,files_service,file_routes,files_integration}.py` |
| P2-S5 | S5 | analytics/config/branding/font/notification | S2a | Partial (19/22) — `app/domain/{preferences,public}.py`, `app/routers/{preferences,public}.py`: config, analytics, notifications, branding get/setLogo, fonts list/getByName/getFontData, and all `public.*` reads. Remaining: `branding.generateLogo`, `branding.searchImages`, `public.musicMetadata` (need an image provider / audio tag parser) |
| P2-S6 | S6 | collaboration routers | S2a | Pending |
| P2-S7 | S7 | integrations routers | S2a | Pending |
| P2-S8 | S8 | AI routers | Phase 4 | Pending |
| P2-G | All | Route matrix: every frontend `api.*` call has an owning procedure | all | Partial (83/185 implemented) — `scripts/extract_route_matrix.py` → `route-matrix.json` + `route-matrix.md` (185 symbols, 0 unmapped slices); gate `tests/test_route_matrix.py` also requires every S1 symbol implemented |

## Slice S1 as built

- `db/ids.py` — `next_id()` reproduces the TS per-table counter (`seq:<table>`),
  so account ids stay numeric, not random record ids.
- `domain/passwords.py` — PBKDF2-HMAC-SHA512 / 1000 / 64-byte / 16-byte-hex salt,
  byte-compatible with `server/lib/password.ts`.
- `domain/policies.py` — `require_authenticated`, `require_role`,
  `require_superadmin`, `require_tenant`, `require_workspace_role`.
- `domain/users.py` — `UserService`: account CRUD, numeric id allocation, config
  reads (registration/2FA), API-token minting, login.
- `routers/user.py` — the `users.*` procedure surface (login, register, list,
  publicUserList, nativeAccountList, detail, regenToken, genLowPermToken,
  genTokenByUserId, link/unlinkAccount, upsertUser, upsertUserByAdmin,
  deleteUser).
- `routes/auth.py` — `/api/auth/login|logout|profile|validate-token|verify-2fa`
  plus the OAuth `:providerId` authorize redirect and `callback/:providerId`.
- `domain/totp.py` — RFC 6238 TOTP with otplib's defaults (SHA-1, 6 digits,
  30 s, 20-byte base32 secret) and `otpauth://` key URIs; standard library only.
- `domain/oauth.py` — built-in providers (github/google/facebook/discord),
  generic OAuth2/OIDC providers, HMAC-signed state, stdlib code exchange and
  profile fetch, per-provider profile normalisation.
- `db/surreal.py` — `SurrealClient.update` now calls the SDK's **`merge`**; the
  SDK's `update` replaces the record with the given content and silently dropped
  fields (an OAuth account lost `name`/`role` when its `apiToken` was written).
  Caught by the identity integration test below.
- `tests/test_identity_integration.py` — drives the real `/api/auth/verify-2fa`
  and OAuth authorize/callback routes through Robyn's `TestClient` against the
  real embedded SurrealKV file, then reopens the file in a second process to
  prove the 2FA API token and OAuth account persisted.

**Known gap within S1:** Twitter/X is OAuth 1.0a in the TS server and is not a
built-in here; it works only when configured as a generic OAuth2 provider with
explicit `authorizationUrl`/`tokenUrl`. `UserService.config_value` is a
documented cross-slice read that slice S5 replaces with its own config service,
and the OAuth HTTP calls run on a worker thread (`asyncio.to_thread`).

## Slice S1d as built (superuser bootstrap)

`domain/superuser.py` ports `bootstrapSuperuserFromEnv` from `server/index.ts`,
including the four branches that make a deployment usable:

1. env username + 12+-char password → upsert as `superadmin`, re-hashing the
   password and carrying over `image`/`apiToken`/`note`/`description`/`linkAccountId`
   so a rotation cannot wipe them; writes the credential note only on a true first
   boot (no superadmin *and* no account with that name).
2. password below 12 chars → warn and skip, rather than creating a broken admin.
3. no env, no superadmin → generate a shell-safe 32-char password, create the
   account, write `superuser.txt` at `0600` (created with the mode up front so it
   is never briefly world-readable).
4. no env, superadmin present → leave it alone, so unsetting the env var is not a
   lockout.

Failures are logged and returned as `BootstrapResult(action="failed")` instead of
raising, matching the TS `try/catch` — a bootstrap problem must not stop the
server listening. When the note cannot be written the generated password is
returned in the result so it is not lost.

The bootstrap runs from a Robyn **startup handler** so the lazy embedded
connection is created on the loop that serves requests, and it is opt-in
(`create_app(..., bootstrap=True)`) so tests never create an account as a side
effect. `cloud_surreal/docker-compose.yml` now forwards `PLANINC_SUPERUSER_NAME`
and `PLANINC_SUPERUSER_PASSWORD`.

## Slice S2 as built

- `domain/notes.py` — `NoteService`: account-scoped list/detail/upsert,
  recycle (`trashMany`/`deleteMany`/`clearRecycleBin`), references
  (add/remove/both directions), tag-based `related`, and review
  (`reviewNote`/`reviewStats`). A note owned by another account is `NOT_FOUND`,
  never leaked.
- `domain/collections.py` — account-scoped `TagService`, `CommentService`,
  `AttachmentService` listing.
- `routers/note.py`, `routers/collection.py` — the `notes.*`, `tags.list`,
  `comments.list`, `attachments.list` procedures.
- `app/services.py` — `AppServices` bundle so routers/routes share one client.
- `tests/test_notes_service.py`, `tests/test_notes_router.py` — service rules plus
  two-account isolation (list, detail, and same-named records).

**Deferred beyond S2:** note sharing links, history/versions, and the complex
`list` filter set remain with their owning slices (see the prerequisite below).

### Prerequisite found while scoping the rest of S2 — **resolved by S2t**

The tag surface cannot be finished as a set of CRUD handlers, because
**nothing in `cloud_surreal` ever writes `tagsToNote`** — `domain/notes.py` and
`domain/preferences.py` only *read* it, and `NoteService.upsert` writes content
type/metadata/state fields without deriving tags from `#hashtags` in the body.
Those links are what the TS `notes.upsert` maintains.

Consequences while it is missing:

- `notes.relatedNotes` (tag-overlap based) can only ever return `[]`.
- The seven `tags.*` mutations are not meaningfully implementable:
  `updateTagName` and `updateTagMany` work by rewriting note content and relying
  on the upsert to re-derive tags, and `deleteOnlyTag` then garbage-collects tags
  whose usage count reached zero. Without derivation those handlers would appear
  implemented while doing nothing observable — worse than being absent.
- Analytics' tag statistics read the same join table.

So the next S2 step was a **tag-derivation service** (parse `#tag` and
`#parent/child` tokens from note content on upsert, upsert `tag` rows and
`tagsToNote` links, honour `parent` chains) *before* the `tags.*` mutations are
ported. That is a genuine slice of work, not a handler.

**Built as S2t** (`app/domain/tagging.py`): `extract_hashtags` (strip fenced
code, then match `#token` at word boundaries, ignoring `//#`), `build_hash_tag_tree`
(split on `/` into a parent tree), and `TagDerivation.derive`, which upserts tags
by `(name, parent, accountId)` and syncs the note's `tagsToNote` links on create
and on content change (pruning the links whose tokens disappeared). It is called
from `NoteService.upsert`. `tests/test_tagging.py` covers the three steps, the
parent chain, idempotency, pruning, and account isolation; the existing
`notes.relatedNotes` test now proves a real tag overlap instead of a seeded row.

**Then the tag surface was completed** (`app/domain/collections.py`):
`fullTagNameById`, `updateTagIcon`, `updateTagOrder`, `updateTagMany`,
`updateTagName`, `deleteOnlyTag`, and `deleteTagWithAllNote`, with
`tests/test_tag_service.py`. Note the upstream quirks kept deliberately:
`updateTagName` rewrites bodies and re-derives rather than renaming the row, and
`deleteOnlyTag` strips the tag from *every* linked note before garbage-collecting
the chain. The route matrix moved from 83 to **90** implemented symbols
(S2 16/34 → 23/34).

**Tag semantics to preserve when it is built** (from `server/routerTrpc/tag.ts`):
`fullTagNameById` walks the `parent` chain and renders `#a/b/c`;
`deleteOnlyTag` strips the tag token from every linked note's content, deletes the
`tagsToNote` rows for the whole chain, then deletes any tag in that chain left with
zero usages; `deleteTagWithAllNote` trashes the linked notes first; and
`updateTagName` notably does **not** rename the tag row itself — the rename arrives
via the content rewrite and the subsequent derivation. That last quirk is upstream
behaviour worth mirroring deliberately rather than "fixing" silently.

## Slice S3 as built

- `domain/store.py` — `AccountStore`, the shared account-scoped CRUD base
  (numeric ids, `createdAt`/`updatedAt`, `NOT_FOUND` across accounts).
- `domain/planning.py` — `TicketService` (category↔tag mirroring),
  `StudyService` (list filters, due deck, SM-2 `review`), `PlanningLinkService`
  (entity assertion + self-link guard + dedupe), `PlanningFieldService`
  (per-kind unique key), `PlanningCategoryService` (slug, default, reorder,
  assign, seedDefaults, reassign-on-delete), `TaskService` (persisted schedule).
- `routers/planning.py` — the `tickets.*`, `study.*`, `planningLinks.*`,
  `planningFields.*`, `planningCategories.*`, `task.*` procedures.
- `tests/test_planning_service.py`, `tests/test_planning_router.py` — SM-2
  transitions, tag mirroring, link dedupe, category rules, and isolation.

**Deferred beyond S3:** `task.importFromPlanInc` / `importFromMemos` /
`importFromMarkdown` / `exportMarkdown` need the file service and job runners
(S4/Phase 4); `task` execution is scheduler-state only here.

## Slice S4 as built

- `domain/files.py` — `FileStorage` (the only module that touches the upload
  root: per-segment validation, resolved-path containment re-check, symlink
  escape rejection, ``temp/`` gating, collision-suffixed `save_unique`) and
  `AttachmentService` (account- or note-owned scoping, `can_read`, upload,
  folder create/rename/move/delete, in-memory zip archive).
- `routes/http.py` — shared request parsing for both route modules, including a
  raw multipart parser (Robyn's `request.files` is keyed by *field* name and
  loses the original filename/content type).
- `routes/file.py` — `GET /api/file/*` (ETag/304, byte ranges, download and
  thumbnail flags, ownership check, `.bko` superadmin-only, temp auth),
  `POST /api/file/upload` (multipart, destination folder, voice-note metadata),
  `POST /api/file/upload-by-url`, `POST /api/file/delete`,
  `POST /api/file/archive`, `GET /plugins/*`, `GET /api/s3file/*` (501).
- `routers/attachment.py` — `attachments.list/createFolder/rename/move/delete/deleteMany`.
- Service graph: `AppServices.attachments` is now `AttachmentService(client,
  FileStorage(upload_dir))`; `Settings` gained `data_dir`/`upload_dir`/`temp_dir`/
  `plugin_dir`/`is_demo` mirroring `shared/lib/pathConstant.ts`.
- Tests: `test_file_storage.py` (traversal, symlink escape, `temp/` gate,
  collisions), `test_files_service.py` (sanitisation parity with the TS
  `sanitizeUploadFileName`, scoping, folders, archive contents),
  `test_file_routes.py` (HTTP-level upload/serve/archive/delete/plugins),
  `test_files_integration.py` (real embedded SurrealKV round trip).

**Deliberate deviations from the TS server (all documented in `routes/file.py`):**

1. **Serving is stricter.** The TS route allowed any authenticated user to read an
   attachment with no `accountId` and no owning note; `can_read` requires
   ownership, an owning note, a public share, or superadmin.
2. **Path is validated before the datastore lookup**, so a traversal attempt
   returns 400 rather than being masked by the attachment 404.
3. **No thumbnails** — `?thumbnail=true` returns the original bytes with
   `X-PlanInc-Thumbnail: unsupported` (no image dependency).
4. **No S3** — `/api/s3file/*` answers 501 with an explicit message.
5. **Archives are built in memory** with a byte cap instead of streamed.

**Deferred beyond S4:** `task.importFromPlanInc`/`importFromMemos`/
`importFromMarkdown`/`exportMarkdown` and the S5 font/logo file operations can
now build on this storage layer; S3 object storage stays out of scope.

## Slice S5 as built

- `domain/preferences.py` — `ConfigService` (key/value per `userId`, plugin
  config, AI config), `NotificationService`, `AnalyticsService`
  (daily/monthly/insights with top-tag stats), `BrandingService`,
  `FontService`.
- `routers/preferences.py` — `config.*`, `analytics.*`, `notifications.*`,
  `branding.get`/`setLogo`, `fonts.list`/`getByName`.
- `tests/test_preferences.py` — config scoping, notification lifecycle,
  analytics counts/tags, and the route surface.

**Deferred within S5:** `branding.searchImages` / `generateLogo` (AI/image),
- `domain/public.py` + `routers/public.py` — the unauthenticated `public.*`
surface: `serverVersion` (from the nearest `package.json`), `latestClientVersion`
/ `latestServerVersion` (GitHub and Docker Hub, degrading to `""` on failure),
`oauthProviders` (global config), `siteInfo` (superadmin by default, else the
requested account), `hubList`/`hubSiteList` (empty / cached index fetch),
`linkPreview` (HTML meta extraction with OpenGraph precedence, matched to
`unfurl`'s field order), and `testHttpProxy` (status + timing, with the error
reasons the settings UI shows). A small TTL cache mirrors the TS `cache.wrap`
TTLs so upstream request rates stay the same.
- `FontService.get_font_data` — base64 `{name, fileData}` matching the TS
`bufferToBase64` shape, with a missing font returning `null` rather than erroring.

**Remaining in S5 (3 of 22):** `branding.searchImages` / `generateLogo` (need an
image provider) and `public.musicMetadata` (needs an audio tag parser plus a
Spotify client). The file half of the font surface can now build on the S4
storage layer.

## Exit Gate

- A generated `route-matrix.md` lists every `api.*` symbol used in `frontend/src` and its `cloud_surreal` procedure, with zero unowned rows.
- Two tenants read and write identically named records without leakage.
- `pytest` green across slices.
