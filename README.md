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

- **Planing**: Main planning and project management service (port 1111)
- **Runtime**: Execution runtime for workflows and automation
- **PlanInc Data**: Data persistence layer (embedded SurrealDB)

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
├── planing/           # Main planning service
├── runtime/           # Execution runtime (built app + playwright tests)
│   ├── public/        # Frontend assets
│   ├── tests/         # Playwright e2e tests
│   └── data/          # Runtime data (uploads, DB)
├── planinc-data/      # Persistent data volumes
└── docker-compose.yml # Service orchestration
```

## 🚦 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/mammhoud/PlanInc.git
   cd PlanInc
   ```

2. **Copy and configure environment**
   ```bash
   make setup       # copies .env.example → .env
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
PLANING_PORT=1111
PLANING_PUBLIC_URL=http://localhost:1111
PLANING_NEXTAUTH_SECRET=change-me-in-production

# SurrealDB (embedded — no extra container needed)
SURREALDB_FILE=./runtime/data/planinc.db
SURREALDB_NS=planinc
SURREALDB_DB=planinc
```

## 🧪 Development

```bash
# Start development environment
make dev

# Run tests
make test

# Build for production
make build

# Verify SurrealDB runtime contract
make verify-surrealdb
```

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
