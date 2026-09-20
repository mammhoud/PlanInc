# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PlanInc is an open-source, self-hosted note-taking application with AI-powered features. It's a multi-platform application (web, desktop via Tauri, mobile) built with TypeScript/React frontend and Node.js/Express backend.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Tauri (for desktop apps)
- **Backend**: Node.js, Express, tRPC, SurrealDB data layer
- **Database**: SurrealDB (sole datastore — no ORM, no SQL database)
- **Package Manager**: Bun (v1.2.8+)
- **Build Tool**: Turbo (monorepo management)
- **AI**: Multiple AI providers (OpenAI, Anthropic, Google, Azure, Ollama, etc.)

## Project Structure

```
planinc/
├── frontend/               # THE single frontend: web, PWA, Tauri desktop + mobile
│   ├── src/               # React source code (platform/, components/, pages/, store/)
│   ├── src-tauri/         # Tauri desktop + Android/iOS app configuration
│   └── tauri-plugin-planinc/ # Custom Tauri plugin
├── server/                 # Backend Node.js server
│   ├── aiServer/          # AI integration services
│   ├── routerTrpc/        # tRPC API routes
│   └── routerExpress/     # Express API routes
├── shared/                # Shared utilities, types, and record schemas
└── planinc-types/         # Type definitions
```

## Common Development Commands

### Setup & Installation
```bash
bun install                # Install dependencies
```

### Development
```bash
bun run dev                # Run Tauri desktop app in development
bun run dev:backend        # Run backend server only
bun run dev:frontend       # Run frontend only
```

### Building

Every target is built from the same `frontend/` directory; the output is
`dist/public`, which both the web image and the Tauri bundles consume.

```bash
bun run build:web           # Web + PWA bundle → dist/public
bun run tauri:desktop:build # Desktop: Windows / macOS / Linux
bun run tauri:android:build # Android
bun run tauri:ios:build     # iOS
```

### Database
```bash
bun run seed               # Bootstrap schema + seed the SurrealDB store
```

### Testing & Linting
```bash
bun run test               # Run tests (if configured)
cd frontend && bun run check:contracts  # token contract + settings registry + platform matrix
```

## Architecture & Key Components

### Frontend Architecture
- **State Management**: MobX with custom stores in `/frontend/src/store/`
- **Platform adaptation**: `platform/PlatformProvider.tsx` mirrors the detected platform/OS/form factor onto `<html>` as `data-*`; `styles/platform.css` styles off those attributes. Capabilities (share sheet, native back, safe areas, offline shell) are read via `useCapability()` rather than branching on `isMobile`.
- **Routing**: React Router v7
- **UI Components**: Custom components with HeroUI (@heroui/react)
- **Editor**: Vditor for markdown editing
- **Internationalization**: i18next with multiple language support
- **API Communication**: tRPC client for type-safe API calls

### Backend Architecture
- **API Layer**: Hybrid approach using both tRPC (type-safe) and Express routes
- **Authentication**: Multiple providers (local, OAuth via passport)
- **File Storage**: Local filesystem or S3-compatible storage
- **AI Integration**: Factory pattern for multiple AI providers
- **Background Jobs**: Cron-based scheduled tasks in `/server/jobs/`
- **Embeddings**: RAG (Retrieval-Augmented Generation) support with @mastra/rag

### Database Schema
- **Main Entities**: accounts, notes, attachments, tags, comments, conversations
- **Data layer**: `server/db.ts` — SurrealDB with document-style delegates
- **Schema**: schemaless; `server/seed.ts` creates tables/indexes idempotently at boot

## Environment Configuration

Create a `.env` file in the root directory with:
```
SURREALDB_URL=http://surrealdb:8000/rpc
SURREALDB_NS=planinc
SURREALDB_DB=planinc
SURREALDB_USER=root
SURREALDB_PASS=change-me
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:1111

# Optional S3 storage
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# AI Providers (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
# ... other AI provider keys
```

## Important Patterns

1. **File Operations**: Use the filesystem routes in `/server/routerExpress/file/` for file handling
2. **AI Features**: AI providers are configured in `/server/aiServer/providers/`
3. **Type Safety**: Use tRPC routes when possible for type-safe API calls
4. **State Management**: Follow MobX patterns in store files
5. **Component Structure**: React components follow a modular structure with separate index.tsx files

## Deployment

### Docker
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Manual Deployment
1. Build the application: `bun run build:web`
2. Bootstrap/seed the datastore: `bun run seed`
3. Start the server: `bun run start`

## Port Configuration
- Frontend/Full App: 1111 (default)
- Backend API: Same port (integrated with Vite Express)

## Mobile Development (Tauri)
- Android development: `bun run tauri:android:dev`
- iOS support through Tauri configuration
- Custom plugin in `/app/tauri-plugin-planinc/`

## Key Dependencies Notes
- Uses Bun as package manager and runtime
- Requires Node.js >= 20.0.0
- SurrealDB required (server container or embedded engine) — no SQL database
- Tauri requires Rust toolchain for desktop builds