# PlanInc

**Enterprise Planning & Incubation Platform**

PlanInc is a self-hosted planning and project incubation platform for modern teams and organisations. It provides tools for project management, structured note-taking, team collaboration, and strategic planning — all running locally with no SaaS dependency.

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
├── src/               # PlanInc application source (frontend, server, shared)
├── runtime/           # Isolated browser-test fixtures and compatibility runtime
├── src/               # Canonical Bun + React + Tauri application
│   ├── app/            # React/Vite/Tauri frontend
│   ├── server/         # Bun/Express/TRPC backend
│   └── shared/         # Shared schemas and types
└── docker-compose.yml  # Canonical source-based deployment
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
   make up
   ```

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

# Run tests
make test

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

The authenticated sidebar is organized into two responsive lanes: **Work**
(notes, todos, tickets, agents, analytics, resources, and graph) and **Learn**
(study). Tickets and study items are stored in the embedded SurrealDB as
account-scoped records; they do not revive the historical `planing/` tree.

### Authentication notes

- Sign-in credentials are submitted to `/api/auth/login`; successful sessions
  navigate to the authenticated workspace.
- The sign-in page no longer persists plaintext passwords in browser storage.
  “Remember me” only controls the existing username preference.
- Superuser passwords are hashed with the server password helper and are never
  printed by the provisioning command. Restart a running development server
  after provisioning so its account lookup cache is refreshed.

## 📖 Documentation

Comprehensive documentation lives in `docs/`:

- [Architecture Guide](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)
- [Contributing Guidelines](./docs/contributing.md)

## 🤝 Contributing

We welcome contributions. Please see [Contributing Guidelines](./docs/contributing.md) for details.

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
