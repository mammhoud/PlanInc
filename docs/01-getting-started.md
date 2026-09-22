# Getting Started (PI-002)

> Part of **PlanInc** — AI-powered card note-taking and planning

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | >= 20 (`package.json` `engines`) | running the runtime natively |
| Docker + Compose | current | `make deploy`, the canonical smoke test |
| Python 3 | any 3.8+ | `scripts/generate-dir-docs.py` |

The root stack builds the React/Vite frontend with Bun and serves it from the
TypeScript Express server. There is no separate legacy runtime build.

## First run

```bash
make setup        # .env from .env.example, if missing
$EDITOR .env      # set PLANINC_SUPERUSER_NAME / PLANINC_SUPERUSER_PASSWORD
make install      # bun install
make run          # listen on :1111
```

Then open <http://localhost:1111> and sign in with the superuser you set in
`.env`. On first boot the server logs:

```
[superuser] Bootstrapped superuser 'admin' from environment
```

If you do not see that line, the account was not created — see
[`PI-007`](./06-secrets-and-superuser.md), because there is a specific way the
Makefile can silently blank the variable.

## Make targets

Run `make help` for the annotated list. The ones that matter:

| Target | What it does |
| --- | --- |
| `setup` | Create `.env` from `.env.example` if missing |
| `install` | Install Bun dependencies for the root workspace |
| `run` | Run the server natively (no Docker) |
| `test` | Hermetic suite: Playwright with a disposable embedded store |
| `test-canonical` | Smoke a *running* deployment over HTTP (`PLANINC_TEST_URL`) |
| `verify-surrealdb` | Pre-flight check that the embedded engine is usable |
| `deploy` | `build` + `up` — validate, build the image, start the container |
| `build` / `up` / `down` / `restart` / `logs` / `status` | Container lifecycle |

## Verifying a running instance

```bash
curl -fsS http://localhost:1111/health
make test-canonical
PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical
```

## Next steps

- [`PI-003`](./02-architecture.md) — how the pieces fit
- [`PI-004`](./03-runtime-http-api.md) — the HTTP surface
- [`PI-008`](./07-testing.md) — the test suite
