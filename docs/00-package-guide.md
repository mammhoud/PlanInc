# Package Guide (PI-001)

> Part of **PlanInc** — AI-powered card note-taking and planning

This repository contains **two things that look similar and are not**: the
application that actually runs in production, and the upstream monorepo it was
extracted from. Confusing them is the single most common source of wasted time
here, so this page starts with the distinction.

| Path | What it is | Deployed? | Language |
| --- | --- | --- | --- |
| [`runtime/`](../runtime/README.md) | The canonical application | **Yes** — container `planinc` | Node + vanilla ESM |
| [`src/`](../src/README.md) | Upstream Bun monorepo (React/Tauri client + Express/tRPC backend) | No | TypeScript |
| root tooling | `Makefile`, `docker-compose.yml`, `verify-surrealdb.sh` | — | Make / YAML |
| [`scripts/`](../scripts/README.md) | Documentation generator | — | Python 3 |

## Layout

```
.
├── runtime/            # ← what runs. server.mjs (124 routes) + public/ UI
│   ├── server.mjs      # Express 5 server, embedded SurrealDB
│   ├── public/         # vanilla ES-module UI, no build step
│   ├── tests/          # Playwright suite driving the real server
│   └── data/           # surrealkv database (gitignored, deployment state)
├── src/                # upstream monorepo, kept for feature work
│   ├── app/            # React + Vite + Tauri client
│   ├── server/         # Express + tRPC backend
│   └── shared/         # @planinc/shared
├── docs/               # this documentation tree
├── scripts/            # generate-dir-docs.py
├── Makefile            # setup / run / test / deploy
└── docker-compose.yml  # the planinc container
```

## Where do I change something?

| I want to change… | Edit | Then |
| --- | --- | --- |
| The live UI | `runtime/public/` | `make restart` |
| The live API behaviour | `runtime/server.mjs` | `make test`, then `make deploy` |
| The database schema | the `DEFINE` block in `runtime/server.mjs` | `make test` — the bootstrap is idempotent |
| Tests | `runtime/tests/*.spec.mjs` | `make test` |
| Translations | `runtime/public/locales/<lang>/` | `make test` (parity is enforced) |
| Deployment / domains | `docker-compose.yml`, `.env` | `make deploy` |
| A directory README | the directory itself, if hand-written | otherwise `scripts/generate-dir-docs.py` |

## Consumers

- **The edge** routes `notes.structa.cloud` to `planinc:1111` — see
  [`PI-006`](./05-deployment.md).
- **The proxy repo** (`/home/application/proxy`) owns TLS and the vhost; this
  repo only owns the container.

## Development workflow

```bash
make setup      # create .env from .env.example if missing
make run        # run server.mjs natively on :1111
make test       # hermetic Playwright suite, disposable database
make deploy     # build + start the container
```

## Related

- [`PI-002`](./01-getting-started.md) — getting started
- [`PI-003`](./02-architecture.md) — architecture
- [`PI-006`](./05-deployment.md) — deployment
