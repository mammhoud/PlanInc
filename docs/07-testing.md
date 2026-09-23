# Testing (PI-008)

> Part of **PlanInc** — AI-powered card note-taking and planning

The runtime is verified by a Playwright suite that **drives the real server over
HTTP**. There are no mocked routers: if the assertions pass, the endpoints and the
`frontend/` app work.

## Two configs, two jobs

| Config | Run by | Targets | Proves |
| --- | --- | --- | --- |
| `playwright.config.mjs` | `make test` | its **own** isolated server on `:1112` | Core behaviour — auth, graph, resources drag-and-drop, page smoke |
| `playwright.canonical.config.mjs` | `make test-canonical` | a **running** deployment (`PLANINC_TEST_URL`, default `:1111`) | The deployment itself answers and serves the expected contract |

`make test` runs the hermetic config only, so it needs no running instance and
boots its own. The canonical config boots nothing — it only makes requests.

## Isolation — why this matters

The runtime opens its database with `surrealkv://` and the file path is the only
isolating input (`PLANINC_DB_FILE`). Two details make the hermetic run safe:

- Each run gets a unique store under `os.tmpdir()`
  (`planinc_e2e_<run-id>/planinc.db`), so it **cannot** touch `data/planinc.db`,
  which a running deployment holds locked.
- The config passes `PLANINC_PORT` to the server it spawns, and
  `reuseExistingServer` is off. The default port is **1112**, not the
  deployment's 1111, so a live instance is never silently tested. This was a real
  failure mode: the old config defaulted to 1111, where a running container
  answered `/signin`, so the suite ran against production credentials.

The run id is inherited through `PLANINC_E2E_RUN` rather than recomputed,
because Playwright re-evaluates the config module inside workers; recomputing it
would split the test namespace mid-run.

`PLANINC_E2E_USER` / `PLANINC_E2E_PASSWORD` / `PLANINC_E2E_FOLDER` /
`PLANINC_E2E_ROOT_FILE` are set by the config and re-read by the specs, so the
credentials and fixture names have one source.

The spawned server also receives `PLANINC_DATA_DIR` pointing at the same
`os.tmpdir()` namespace, so uploads, backups and vectors land in the throwaway
store instead of the checkout (`shared/lib/pathConstant.ts`).

## Bootstrapping the store

SurrealKV takes a file lock, so seeding has to happen **before** the server opens
the file. The `webServer` command chains it:

```text
bun --env-file ../.env scripts/create-superuser.ts
  && bun --env-file ../.env scripts/seed-planning-fixtures.ts
  && exec bun --env-file ../.env index.ts
```

The planning fixtures give the graph page nodes to render. The resources page
needs *attachments*, which cannot be written before the server is up, so a
Playwright **setup project** (`e2e/seed.setup.mjs`) logs in over HTTP and uploads
`PLANINC_E2E_ROOT_FILE` at the root plus a file into `PLANINC_E2E_FOLDER`. The
drag spec then names the root file explicitly — grabbing the *first* draggable
would sometimes pick the file that already sits in the folder and pass without
moving anything.

## Running

```bash
make test                       # contract checks + hermetic Playwright suite
make test-e2e                   # hermetic Playwright suite only
make test-canonical             # smoke the deployment on :1111
PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical
```

## The suites

| File | Covers |
| --- | --- |
| `e2e/seed.setup.mjs` | Seeds the isolated store (root file + folder) over the real HTTP API |
| `e2e/graph.spec.mjs` | The d3 graph renders accessibly (labelled `svg`, camera controls) and nodes activate from the keyboard |
| `e2e/resources-drag.spec.mjs` | Resources are wired to dnd-kit, and dropping the seeded root file onto a folder performs the move — asserting the response is `ok` **and** that the file is then listed inside that folder |
| `e2e/smoke.spec.mjs` | `/`, `/graph`, `/resources`, `/settings`, `/tickets`, `/study` render without runtime errors, and the appearance attributes reach `<html>` |
| `e2e/canonical/deployment.spec.mjs` | A running deployment serves the canonical pages, guards data procedures, and rejects bad credentials |

## The console guard

Every browser spec installs a `watchConsole` collector (`e2e/support.mjs`) and
asserts it is empty. An uncaught render error or a rejected promise fails the
test instead of only appearing in a developer console. This is the executable
form of "no errors in the logs", and it is what caught the `useSearchParams`,
`Modal`, `Dropdown`, and `TooltipProvider` crashes these specs now protect.

`support.mjs` filters a short allowlist of third-party noise (favicon 404s,
aborted requests, the `rctx-contextmenu` `defaultProps` deprecation, and
react-burger-menu's mount-order notices). Everything else is a failure — add to
the allowlist only with a reason that is about the library, not about silencing a
symptom.

## Conventions

- One `.spec.mjs` per behaviour area; name it after the area, not the bug.
- Because `workers: 1` and state is shared, read `e2e/seed.setup.mjs` before
  adding a test that assumes fresh data.
- A failing test is a claim about the runtime until proven otherwise — every
  guard in this suite was written **because** a real bug was found by running it,
  not to satisfy the suite.

## Related

- [`PI-005`](./04-database-and-schema.md) — the SurrealKV file-mode contract
- [`PI-010`](./09-troubleshooting.md) — failures and fixes
