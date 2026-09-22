# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

PlanInc is an open-source, self-hosted note-taking application with AI-powered features. It's a multi-platform application (web, desktop via Tauri, mobile) built with TypeScript/React frontend and Node.js/Express backend.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS v4, shadcn/ui (migrating from HeroUI), Tauri (for desktop apps)
- **Backend**: Node.js, Express, tRPC, SurrealDB data layer
- **Database**: SurrealDB (sole datastore — no ORM, no SQL database)
- **Package Manager**: Bun (v1.2.8+)
- **Build Tool**: Turbo (monorepo management)
- **AI**: Multiple AI providers (OpenAI, Anthropic, Google, Azure, Ollama, etc.)
- **UI Framework**: shadcn/ui with Radix primitives (in migration from HeroUI)

## Project Structure

```
planinc/
├── frontend/               # THE single frontend: web, PWA, Tauri desktop + mobile
│   ├── src/               # React source code
│   │   ├── components/
│   │   │   ├── ui/        # shadcn/ui components (Button, Card, Dialog, etc.)
│   │   │   ├── Common/    # PlanInc-specific common components
│   │   │   ├── Planinc*/  # Feature-specific components
│   │   │   └── Layout/    # Layout components (Sidebar, Header, etc.)
│   │   ├── store/         # MobX stores
│   │   ├── pages/         # Page components
│   │   ├── lib/           # Utilities (trpc, axios, appearance)
│   │   ├── platform/      # Platform detection and adaptation
│   │   └── styles/        # Global styles, tokens, design system
│   ├── src-tauri/         # Tauri desktop + Android/iOS app configuration
│   └── tauri-plugin-planinc/ # Custom Tauri plugin
├── server/                 # Backend Node.js server
│   ├── aiServer/          # AI integration services
│   ├── routerTrpc/        # tRPC API routes
│   └── routerExpress/     # Express API routes
├── shared/                # Shared utilities, types, and record schemas
└── planinc-types/         # Type definitions
```

## UI Component Guidelines

### shadcn/ui Migration Status

The project is migrating from HeroUI to shadcn/ui. shadcn/ui provides:
- Copy-in components (you own the code)
- Radix UI primitives for accessibility
- CSS variable-based theming
- Tailwind v4 native integration

**Migration Rules:**
1. New components should use shadcn/ui primitives
2. Existing HeroUI components should be migrated incrementally
3. Maintain backward compatibility during migration
4. Use `cn()` utility for class merging (from `lib/utils.ts`)

### Available shadcn/ui Components

After migration, these components are available in `components/ui/`:
- Button, Card, Dialog, Input, Textarea, Select
- Dropdown Menu, Popover, Tooltip
- Tabs, Badge, Avatar, Skeleton
- Progress, ScrollArea, Separator
- Form components (Label, Field, etc.)

### Component Import Pattern

```typescript
// Use shadcn/ui components from @/components/ui/
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Use cn() for class merging
import { cn } from '@/lib/utils'
```

## Responsive Design System

### 8-Tier Responsive System

The design system uses an 8-tier responsive approach:

| Tier | Breakpoint | Data Attribute |
|------|------------|----------------|
| xs | 360px | `data-tier="xs"` |
| sm | 480px | `data-tier="sm"` |
| md | 768px | `data-tier="md"` |
| lg | 1024px | `data-tier="lg"` |
| xl | 1280px | `data-tier="xl"` |
| 2xl | 1600px | `data-tier="2xl"` |
| 3xl | 1920px | `data-tier="3xl"` |
| 4xl | 2560px | `data-tier="4xl"` |

### Responsive Border-Radius Scale

All border-radius values are responsive and scale across tiers:

```css
/* tokens.css contains the full responsive scale */
--radius: 0.375rem /* xs */ → 0.8rem /* 4xl */
--pi-radius-sm: 2px → 9px
--pi-radius-md: 4px → 12px
--pi-radius-lg: 6px → 14px
--pi-radius-xl: 8px → 20px
--pi-radius-2xl: 12px → 24px
--pi-radius-3xl: 16px → 28px
```

### Responsive Motion Curves

Motion timing scales with viewport:

```css
--motion-fast: 150ms (xs) → 300ms (3xl/4xl)
--motion-base: 250ms (xs) → 550ms (3xl/4xl)
--curve-smooth: cubic-bezier(0.16, 1, 0.3, 1) from sm+ tiers
--curve-sharp: cubic-bezier(0.4, 0, 0.2, 1)
--curve-bounce: cubic-bezier(0.34, 1.56, 0.64, 1)
--curve-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Responsive Component Edge Attributes

```css
--card-radius: var(--pi-radius-md) → var(--pi-radius-3xl)
--modal-radius: var(--pi-radius-lg) → calc(var(--pi-radius-3xl) * 1.6)
--sheet-radius: var(--pi-radius-xl) → calc(var(--pi-radius-3xl) * 1.6)
--button-radius: var(--pi-radius-sm) → var(--pi-radius-lg)
--input-radius: var(--pi-radius-sm) → var(--pi-radius-md)
```

## Interactive Features

### Tooltips

Use Radix Tooltip primitives for consistent tooltips:
```typescript
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
```

### Modals/Dialogs

Use Radix Dialog for modals with proper accessibility:
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
```

### Preview Panels

For hover previews and configuration previews:
- Use Popover/PopoverContent for floating previews
- Use Tooltip with rich content for simple previews
- Use Sheet/Drawer for side panel previews

### Configuration Editors

Configuration preview/edit modals should:
1. Show current configuration in a read-only preview
2. Provide inline editing capabilities
3. Include validation feedback
4. Support undo/redo for changes
5. Show live preview of changes before applying

## State Management

- **MobX** for global state (stores in `/frontend/src/store/`)
- **Local state** for component-specific state
- **Platform capabilities** via `useCapability()` hook
- **Appearance settings** via registry-driven system

## Important Patterns

1. **File Operations**: Use the filesystem routes in `/server/routerExpress/file/` for file handling
2. **AI Features**: AI providers are configured in `/server/aiServer/providers/`
3. **Type Safety**: Use tRPC routes when possible for type-safe API calls
4. **State Management**: Follow MobX patterns in store files
5. **Component Structure**: React components follow a modular structure
6. **Platform Detection**: Use `platform/detect.ts` and `usePlatform()` hook
7. **Responsive Classes**: Use tier-based classes from tokens.css

## Design Token Convention

All components should use design tokens from `styles/tokens.css`:

```css
/* Semantic tokens (preferred) */
var(--background)
var(--foreground)
var(--primary)
var(--secondary)
var(--muted)
var(--accent)
var(--border)

/* Component tokens */
var(--card-radius)
var(--button-radius)
var(--input-radius)

/* Motion tokens */
var(--motion-fast)
var(--motion-base)
var(--curve-smooth)
```

**NEVER use hardcoded colors or spacing values in components.**

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

## Development Commands

```bash
bun install                        # Install dependencies
bun run dev                        # Run Tauri desktop app in development
bun run dev:backend                # Run backend server only
bun run dev:frontend               # Run frontend only
bun run build:web                  # Web + PWA bundle
bun run tauri:desktop:build        # Desktop build
bun run tauri:android:build        # Android build
bun run check:contracts            # Verify tokens, settings, platform
```
