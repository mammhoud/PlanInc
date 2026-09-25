# PlanInc Agenda (PI-022)

**Status:** Shipped  
**Scope:** Merged Notes + Plans into one Agenda stream, type filters, legacy
path aliases, share-link fixes, and the 13-note default seed pack.

## Stream

| URL | Meaning |
|-----|---------|
| `/?path=agenda` | Merged stream, all types (`type` omitted → all) |
| `/?path=agenda&type=planinc` | Type 0 plans only |
| `/?path=agenda&type=note` | Type 1 notes only |
| `/?path=agenda&type=todo` | Type 2 plans/tasks only |
| `/?path=notes` | Legacy → Agenda with `type=note` |
| `/?path=todo` | Legacy → Agenda with `type=todo` |

Side nav entry: **Agenda** (`baseStore.routerList` → `/?path=agenda`).

## Type filter UI

Chips on the home page (`frontend/src/pages/index.tsx`):
**All · PlanInc (بلينكو in Arabic) · Notes · Plans**.
Plan-oriented surfaces (categories, kanban, calendar, timeline, show-completed)
appear for `type=todo` and `type=all`. Pure note/planinc streams use
cards/grid/list.

## Create-mode defaults

`useEditor` create mode and `PlanIncEditor` post-create navigation both read
`path` + `type` and land on the matching Agenda filter.

## Share links

- Base URL: `PLANINC_PUBLIC_URL` (env) → caller origin → relative path.
- Public URL: `{origin}/share/{id}` (optional `?password=`).
- Email invite: `{origin}/share/invite/{token}` — route
  `frontend/src/pages/share/invite.tsx` calls `shareApprovals.acceptInvite`.
- Admin approval no longer clears an existing share password
  (`publishPublicNote(…, null, …)` keeps the staged password).
- Share ids are crypto-strong (`randomBytes` base64url, 12 chars).

## Superuser bootstrap

On every boot (`server/index.ts` → `bootstrapSuperuserFromEnv`):

- Reads `PLANINC_SUPERUSER_NAME` + `PLANINC_SUPERUSER_PASSWORD` (min 12 chars).
- Upserts the account as `superadmin` and re-hashes the password.

`.env` must set a strong password before `make redeploy`.

## Default seed pack (13 notes)

`server/seedData.ts` → `agendaNotes` inserts when the account lacks
`#Agenda/` content (in addition to the classic `#Welcome` pack):

1. Agenda/Main  
2. Agenda/Index  
3. Agenda/Summary  
4. Agenda/README  
5. Agenda/Content model  
6. Agenda/Meeting agenda  
7. Agenda/Feature tracking  
8. Agenda/Task tracking  
9. Agenda/Team notes  
10. Agenda/Dev team plans  
11. Agenda/Completion checklist  
12. Agenda/Startup story  
13. Agenda/Anytype extensibility  

Content is rewritten to describe PlanInc so a fresh deploy (empty database)
has app-related material with no external services.

Seed runs from `bootstrap()` for every existing account and on first
registration. Fixed seed ids (`101`–`113`) use `skipDuplicates`.

## Lanes (plan categories)

Settings → **Agenda lanes** owns the board lanes (account-unique slugs).
Done is a card status (mark complete / archived), never a lane.

Related preferences in the same section (per-account config keys):

| Preference | Key | Default | Effect |
|---|---|---|---|
| Default lane for new plans | lane `isDefault` flag | first lane | `notes.upsert` files a new plan (type TODO) into the default enabled lane |
| Show completed | `agendaShowCompleted` | `false` | merges the archived stream into the board as a Done lane |
| Show uncategorised lane | `agendaShowUncategorised` | `true` | catch-all column, directory row and move-target so no plan falls out |

## Log fixes

- `tagsToNote` create re-allocates on id clash (seq vs seed collision).
- `shareApprovals` columns declared in `ensureSurrealSchema`; output schema
  coerces missing optional fields to `null`.

## Verification

```bash
bun run --cwd frontend check:contracts
bunx playwright test --config playwright.canonical.config.mjs
# after deploy:
curl -fsS http://127.0.0.1:1111/health
```

Legacy aliases and Agenda chips should both load the same `agendaList`.
