# Testing (PI-008)

> Part of **PlanInc** — AI-powered card note-taking and planning

The runtime is verified by a Playwright suite that **drives the real server over
HTTP**. There are no mocked routers: if the assertions pass, the endpoints work.

## Three configs, three jobs

| Config | Run by | Targets | Proves |
| --- | --- | --- | --- |
| `playwright.config.mjs` | `npm test` (first) | `127.0.0.1:1112` | Core behaviour — auth, categories, i18n parity |
| `playwright.extra.config.mjs` | `npm test` (second) | own server + own store | Suites that seed their own admin (appearance/graph) or register via the API (tickets) |
| `playwright.canonical.config.mjs` | `make test-canonical` | a **running** deployment (`:1111` or `PLANINC_TEST_URL`) | The deployment itself answers and serves the expected contract |

`npm test` runs the first two only, so it stays hermetic. The canonical config is
excluded from `playwright.config.mjs`'s `testIgnore` so the default run needs no
running instance.

## Isolation — why this matters

The runtime opens its database with `surrealkv://` and **no longer reads
`SURREALDB_URL`**. Isolation therefore comes from the file path, not a container:

```js
// playwright.config.mjs
const embeddedDir = path.join(os.tmpdir(), `planing_pw_embedded_${runId}`);
const embeddedFile = path.join(embeddedDir, 'planinc.db');
```

Each run gets `SURREALDB_FILE` and `UPLOAD_DIR` under a unique temp directory,
and chat context roots point at disposable fixtures. Consequences:

- The suite **cannot** touch the deployment store at `runtime/data/planinc.db` —
  which the running instance holds locked anyway.
- The suite never reads the real project tree or writes into real documents.
- Pointing a config back at the default path is a destructive change. Don't.

The run id is inherited through `PLANING_PW_RUN` rather than recomputed, because
Playwright re-evaluates the config module inside workers; recomputing it would
split the test namespace and the seeded admin mid-run.

## Running

```bash
make test                       # everything hermetic (~40 tests)
make test-canonical             # smoke the container on :1111
PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical

cd runtime
npx playwright test --config playwright.extra.config.mjs
```

## The mock LLM

`tests/mock-llm.mjs` is a minimal OpenAI-compatible server started as the first
web server on port **11434**. AI paths are exercised against it, so the suite
needs no provider credentials and spends no quota. Provider-name handling must
match what the mock advertises.

## Regression guards

Four suites encode engine behaviour that previously caused outages — see
[`PI-005`](./04-database-and-schema.md):

| Guard | Catches |
| --- | --- |
| Note creation with tags | `RecordId` serialising as `{}` |
| Workspace create + switch | Edges that silently did not persist |
| Settings with array values | Bare `array` fields coercing to `[]` |
| i18n key uniqueness | Duplicate keys silently overwriting labels |

## Conventions

- One `.spec.mjs` per behaviour area; name it after the area, not the bug.
- Because `workers: 1` and state is shared, read `auth-and-categories`'s seeding
  comment before adding a test that assumes a fresh admin.
- A failing test is a claim about the runtime until proven otherwise — three of
  the four guards above were written **because** a real bug was found by running
  the suite, not to satisfy it.

## Related

- [`PI-010`](./09-troubleshooting.md) — failures and fixes
