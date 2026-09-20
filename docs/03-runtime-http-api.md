# Runtime HTTP API (PI-004)

> Part of **PlanInc** — AI-powered card note-taking and planning

The runtime exposes **124 routes** from `runtime/server.mjs`. They are grouped
below by concern rather than listed exhaustively — duplicate the file's own
`grep` when you need a complete inventory:

```bash
grep -nE "app\.(get|post|put|patch|delete)\(" runtime/server.mjs
```

## Route groups

| Group | Prefix | Examples |
| --- | --- | --- |
| Health | `/health` | readiness for the edge and `make test-canonical` |
| Auth | `/api/auth/*` | `/api/auth/profile` |
| Notes | `/api/notes` | CRUD, `/:id/share`, `/:id/activity`, `/:id/backlinks`, `/:id/comments` |
| Attachments | `/api/attachments` | upload, `/:id/text`, `/:id` patch/delete |
| Categories & tags | `/api/categories`, `/api/tags` | |
| Chat | `/api/chat/*` | `/rooms`, `/rooms/:id/members/:accountId`, `/sessions`, `/sessions/:id/context` |
| Tickets | `/api/tickets` | `/tickets/fields`, `/tickets/fields/:id` |
| Study | `/api/study/*` | `/items`, `/due`, `/stats`, `/analytics` |
| Workspaces | `/api/workspaces` | `/:id/bundle`, `/:id/context-roots`, `/:id/context-roots/:root/tree|file` |
| Members & invitations | `/api/members`, `/api/invitations` | |
| AI | `/api/ai/*` | `/policy` (get + patch), `/jobs`, `/runs`, `/usage` |
| Providers | `/api/providers` | `/:name` delete, `/:name/active` |
| Context | `/api/context/*` | `/roots` |
| Audit & security | `/api/audit`, `/api/security/events`, `/api/telemetry/queries` | |
| Settings & integrations | `/api/settings`, `/api/integrations` | |
| Export | `/api/export`, `/api/export/markdown` | |
| Views | `/api/graph`, `/api/kanban`, `/api/calendar` | |
| Prompts & comments | `/api/prompts`, `/api/comments` | |
| Fragments | `/fragments/*` | `notes`, `tickets`, `members`, `audit` — HTML, not JSON |
| Sharing | `/share/:id`, `/share/:id/raw` | public links |
| Files | `/files/:id/:name` | stored attachment bytes |

## Conventions

- **Auth:** JWT (bearer or cookie) verified per request; the superuser and
  regular accounts share one code path. `withAuth`-style helpers attach the
  account to the request.
- **Workspace scoping:** most collection routes resolve a workspace scope before
  touching the database. Creating a workspace and switching to it must both
  produce a persisted membership edge — see [`PI-005`](./04-database-and-schema.md).
- **Fragments return HTML.** If you expect JSON from `/fragments/*`, that is the
  bug.
- **Errors** are JSON `{ error: "..." }` with a matching status code. The UI
  surfaces `error` verbatim.

## Health

```bash
curl -fsS http://localhost:1111/health
curl -fsS https://notes.structa.cloud/health
```

`/health` is what the Traefik health check and `make test-canonical` use, so it
must stay cheap and dependency-light.

## Related

- [`PI-005`](./04-database-and-schema.md) — what these routes read and write
- [`PI-008`](./07-testing.md) — how the routes are tested
