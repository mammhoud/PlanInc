# Package Guide (PI-001)

> Part of **PlanInc** — AI-powered card note-taking and planning

This repository contains the deployed TypeScript source stack. A Django
alternative is being developed in `django_server/` without replacing the
active runtime; the remaining work is tracked in the
[`Django + django-bolt execution plan`](./plans/django-bolt/00-index.md).

| Path | What it is | Deployed? | Language |
| --- | --- | --- | --- |
| [`../`](../README.md) | The canonical deployed application (React/Tauri client + Express/tRPC backend) | **Yes** - container `planinc` | Bun + Express + React/Vite |
| `server/` | Express/tRPC API and SurrealDB integration | **Yes** | TypeScript |
| `frontend/` | React/Vite/Tauri client | **Yes** | TypeScript |
| `data/` | Persistent SurrealKV database and uploads | Runtime state | SurrealKV files |
| root tooling | `Makefile`, `docker-compose.yml`, `verify-surrealdb.sh` | — | Make / YAML |
| [`scripts/`](../scripts/README.md) | Documentation generator | — | Python 3 |

## Layout

```
.
├── frontend/           # React + Vite + Tauri client
├── server/             # Express + tRPC backend
├── shared/             # @planinc/shared
├── app/                # auxiliary application assets and experiments
├── data/               # SurrealKV database and uploads (gitignored)
├── docs/               # this documentation tree
├── scripts/            # generate-dir-docs.py
├── Makefile            # setup / run / test / deploy
└── docker-compose.yml  # the planinc container
```

## Where do I change something?

| I want to change… | Edit | Then |
| --- | --- | --- |
| The live UI | `frontend/src/` | `make restart` |
| The live API behaviour | `server/` | `make test`, then `make deploy` |
| The database schema | `server/surreal.ts` and `server/db.ts` | source-stack checks |
| Tests | `e2e/` and frontend contract checks | `make test` |
| Translations | `frontend/src/lib/i18n/` | frontend checks |
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
make run        # run the server natively on :1111
make test       # frontend contract checks
make deploy     # build + start the container
```

## Related

- [`PI-002`](./01-getting-started.md) — getting started
- [`PI-003`](./02-architecture.md) — architecture
- [`PI-006`](./05-deployment.md) — deployment
- [`PI-015`](./plans/django-bolt/00-index.md) — Django + django-bolt migration plan
