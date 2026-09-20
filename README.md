# PlanInc

**Enterprise Planning & Incubation Platform**

PlanInc is a self-hosted planning and project incubation platform for modern teams and organisations. It provides tools for project management, structured note-taking, team collaboration, and strategic planning — all running locally with no SaaS dependency.

## 📚 Documentation

Long-form documentation lives in [`docs/`](./docs/INDEX.md), indexed with stable
`PI-NNN` IDs. If you are new here, start with the
[package guide](./docs/00-package-guide.md) — it explains the distinction that
costs everyone time first: the **deployed** application is `runtime/`, while
`src/` is the upstream monorepo it was extracted from.

Every directory in this repository also carries a `README.md` describing its role,
contents and public API. Those files are generated and enforced:

```bash
python3 scripts/generate-dir-docs.py          # write/refresh
python3 scripts/generate-dir-docs.py --check  # exit 1 if any directory is undocumented
```

## 🚀 Features

- **Project Planning**: Advanced project planning and tracking capabilities
- **Team Collaboration**: Real-time collaboration tools for distributed teams
- **Resource Management**: Efficient resource allocation and tracking
- **Analytics Dashboard**: Comprehensive analytics and reporting
- **Integration Ready**: Seamless integration with existing workflows
- **Self-hosted & AGPL**: Full data ownership; no vendor lock-in

## 📦 Components

### Core Services

- **PlanInc**: Main planning and project management service (port 1111)
- **Embedded SurrealDB**: Data persistence inside the Bun/Express application
- **Tauri desktop client**: Native desktop shell using the same local web server

### Infrastructure

- **Docker Compose**: Container orchestration for all services
- **SurrealDB**: Embedded database for real-time data management (SurrealKV file mode — no separate DB container)
- **Makefile**: Build and deployment automation

## 🎯 Use Cases

PlanInc serves as an incubation platform for innovative ideas and projects.

### Strategic Planning
- Long-term roadmap visualisation and tracking
- Milestone-based project progression
- Resource forecasting and capacity planning
- Risk assessment and mitigation strategies

### Team Collaboration
- Real-time document collaboration
- Knowledge sharing and documentation
- Cross-functional team coordination
- Async communication workflows

### Process Automation
- Workflow automation engine
- Custom business logic implementation
- Integration pipelines
- Event-driven architectures

### Data-Driven Insights
- Performance metrics and KPIs
- Predictive analytics
- Trend analysis and forecasting
- Decision support systems

### Innovation Labs
- Experiment tracking and validation
- Prototype development workflows
- A/B testing frameworks
- Innovation metrics and scoring

## 🛠️ Tools & Integrations

### Collaboration & Productivity
- **[Anytype](https://github.com/anyproto/anytype-ts)**: A local-first, privacy-focused collaboration platform combining notes, tasks, and projects in a unified workspace. Anytype inspires PlanInc's approach to decentralised collaboration.

### Infrastructure
- **SurrealDB**: Embedded real-time database for data synchronisation
- **Docker**: Containerisation for consistent deployment
- **Make**: Build automation for development workflows

## 🏗️ Architecture

```
PlanInc/
├── runtime/            # Deployed server: Express + embedded SurrealDB (surrealkv)
│   ├── server.mjs       # All HTTP routes, schema bootstrap, AI jobs, jobs worker
│   ├── public/          # Server-rendered SPA shell, htmx fragments, locales
│   └── tests/           # Playwright suite (hermetic + deployed smoke)
├── src/                # Source monorepo (Bun + React/Vite/Tauri + tRPC)
│   ├── app/             # React/Vite/Tauri frontend
│   ├── server/          # Bun/Express/tRPC backend
│   └── shared/          # Shared schemas and types
└── docker-compose.yml  # Canonical deployment (builds ./runtime)
```

## 🚦 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/mammhoud/PlanInc.git
   cd PlanInc
   ```

2. **Copy and configure environment**
   ```bash
   cp .env.example .env
   # edit .env with your values
   ```

3. **Start services**
   ```bash
   make up        # start (image must be built)
   make deploy    # build + start
   make run       # run natively without a docker build (uses ./runtime/data)
   ```

   Set `PLANINC_SUPERUSER_NAME` and `PLANINC_SUPERUSER_PASSWORD` in `.env` to
   have the first admin account created automatically on first boot.

4. **Access the application**
   - Main Interface: `http://localhost:1111`

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- `make` (optional, for build automation)

## 🔧 Configuration

Copy `.env.example` to `.env` and adjust:

```env
# Server
PLANINC_PORT=1111
PLANINC_PUBLIC_URL=http://localhost:1111
PLANINC_NEXTAUTH_SECRET=change-me-in-production

# SurrealDB (embedded — no extra container needed)
PLANINC_DB_FILE=./src/data/planinc.db
PLANINC_DB_NS=planinc
PLANINC_DB_NAME=planinc
```

## 🧪 Development

```bash
# Browser development — Bun backend + ViteExpress frontend
cd src
bun install
cp .env.tmpl .env
bun run dev:backend
# Open http://localhost:1111

# Canonical planning surfaces
# /tickets  - first-class ticket CRUD
# /study    - first-class study items
# /graph    - responsive cross-domain graph view

# Desktop development — Tauri shell connected to the same server
cd src
bun run dev

# Run the runtime test suite (hermetic — spins up its own server and a
# disposable embedded SurrealDB store, never the deployment database)
make test

# Smoke a running deployment over HTTP (defaults to http://127.0.0.1:1111;
# set PLANINC_TEST_URL to point somewhere else)
make test-canonical

# Create or update a local superuser (never commit these credentials)
PLANINC_SUPERUSER_NAME=admin \
  PLANINC_SUPERUSER_PASSWORD='use-a-unique-password-at-least-12-chars' \
  bun run create:superuser
# Or omit the password variable to enter it interactively:
# PLANINC_SUPERUSER_NAME=admin bun run create:superuser

# Build the canonical web/backend application
cd src
bun run build:web
bun run start:server:production

# Validate the deployment wrapper
docker compose config -q
```

The authenticated sidebar is organized into five responsive lanes: **Planning**
(dashboard, tickets, study, and graph), **Work** (notes, todos, and archived),
**Knowledge** (resources and agents), **Insights** (analytics), and **System**
(plugins and settings). Tickets and study items are stored in the embedded
SurrealDB as account-scoped records; they do not revive the historical
`planing/` tree.

Planning modules share consistent controls: a list/cards/grid view switcher, a
pagination footer, and a floating create button matching the notes add button.
Tickets and study items support account-scoped custom form fields
(**Settings → Forms**), and relations marked **Show in graph** are drawn on the
graph, which previews every node type with tooltips and related-item details.

### Authentication notes

- Sign-in credentials are submitted to `/api/auth/login`; successful sessions
  navigate to the authenticated workspace.
- The sign-in page no longer persists plaintext passwords in browser storage.
  “Remember me” only controls the existing username preference.
- Superuser passwords are hashed with the server password helper and are never
  printed by the provisioning command. Restart a running development server
  after provisioning so its account lookup cache is refreshed.

## 📖 Documentation Index

The full map is [`docs/INDEX.md`](./docs/INDEX.md). The pages most often needed:

- [Architecture](./docs/02-architecture.md)
- [Runtime HTTP API](./docs/03-runtime-http-api.md)
- [Database and schema](./docs/04-database-and-schema.md)
- [Deployment](./docs/05-deployment.md)
- [Testing](./docs/07-testing.md)
- [Troubleshooting](./docs/09-troubleshooting.md)

## 🤝 Contributing

Contributions are welcome. Read the [package guide](./docs/00-package-guide.md)
first — it explains which of the two codebases a change belongs in — then run the
suite before opening a pull request:

```bash
make test
```

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see the [LICENSE](./LICENSE) file for details.

### Why AGPL?

- All modifications and improvements remain open source
- Users of network services have access to the source code
- The community benefits from all enhancements
- Commercial use requires contributing back to the project

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/mammhoud/PlanInc/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mammhoud/PlanInc/discussions)

---

**Built with ❤️ by the PlanInc Team**
