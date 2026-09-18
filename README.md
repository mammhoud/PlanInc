# PlanInc

**Enterprise Planning & Incubation Platform**

PlanInc is a comprehensive planning and project incubation platform designed for modern teams and organizations. It provides robust tools for project management, collaboration, and strategic planning.

## 🚀 Features

- **Project Planning**: Advanced project planning and tracking capabilities
- **Team Collaboration**: Real-time collaboration tools for distributed teams
- **Resource Management**: Efficient resource allocation and tracking
- **Analytics Dashboard**: Comprehensive analytics and reporting
- **Integration Ready**: Seamless integration with existing workflows

## 📦 Components

### Core Services

- **Planing**: Main planning and project management service
- **Runtime**: Execution runtime for workflows and automation
- **Blinko Data**: Data persistence and synchronization layer

### Infrastructure

- **Docker Compose**: Container orchestration for all services
- **SurrealDB**: Embedded database for real-time data management
- **Makefile**: Build and deployment automation

## 🎯 Ideations

PlanInc serves as an incubation platform for innovative ideas and projects. Here are some key ideation areas:

### Strategic Planning
- Long-term roadmap visualization and tracking
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

## 🛠️ Resources & Tools

PlanInc integrates with and is inspired by several powerful open-source tools:

### Knowledge Management
- **[Blinko](https://github.com/blinkospace/blinko)**: A self-hosted personal note-taking and knowledge management application with markdown support, tags, and powerful search capabilities. PlanInc uses Blinko for documentation and knowledge base management.

### Collaboration & Productivity
- **[Anytype](https://github.com/anyproto/anytype-ts)**: A local-first, privacy-focused collaboration platform that combines notes, tasks, and projects in a unified workspace. Anytype inspires PlanInc's approach to decentralized collaboration.

### Additional Tools
- **SurrealDB**: Embedded real-time database for data synchronization
- **Docker**: Containerization for consistent deployment
- **Make**: Build automation for development workflows

## 🏗️ Architecture

```
PlanInc/
├── planing/          # Main planning service
├── runtime/          # Execution runtime
├── blinko-data/      # Knowledge base storage
├── planing-data/     # Planning data persistence
└── docker-compose.yml # Service orchestration
```

## 🚦 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/mammhoud/PlanInc.git
   cd PlanInc
   ```

2. **Start services**
   ```bash
   make up
   ```

3. **Access the application**
   - Main Interface: http://localhost:3000
   - API Endpoint: http://localhost:8000

## 📋 Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Make (optional, for build automation)

## 🔧 Configuration

Environment variables can be configured in the `.env` file:

```env
# Database
DATABASE_URL=surrealdb://localhost:8000

# Authentication
AUTH_SECRET=your-secret-key

# External Services
BLINKO_URL=http://blinko:3001
```

## 🧪 Development

```bash
# Start development environment
make dev

# Run tests
make test

# Build for production
make build
```

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- [Architecture Guide](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)
- [Contributing Guidelines](./docs/contributing.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./docs/contributing.md) for details.

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** - see the [LICENSE](./LICENSE) file for details.

### Why AGPL?

We chose AGPL-3.0 to ensure that:
- All modifications and improvements remain open source
- Users of network services have access to the source code
- The community benefits from all enhancements
- Commercial use requires contributing back to the project

## 🌟 Acknowledgments

- Thanks to the [Blinko](https://github.com/blinkospace/blinko) team for the excellent knowledge management tool
- Inspired by [Anytype](https://github.com/anyproto/anytype-ts) for local-first collaboration
- Built with modern containerization and orchestration technologies

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/mammhoud/PlanInc/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mammhoud/PlanInc/discussions)

---

**Built with ❤️ by the PlanInc Team**
