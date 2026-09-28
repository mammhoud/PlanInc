# Workflow & Integrations Program Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three integrations to the current stack — a first-party **Docker plugin**, a **workflow canvas** (design a graph, load/run it as scripts, opened from a plugin page that adds nodes), and an **MCP installation** flow — without breaking the plugin contract or i18n parity.

**Architecture:** Each deliverable is a vertical slice: a server surface (tRPC router or Express route), a data model, a UI surface, and — where it is user-extensible — a plugin capability declared through `BasePlugin.capabilities` (PI-024 I2). The workflow canvas reuses `PlanIncGraph` (`components/PlanIncGraph/PlanincGraph.tsx`, `pages/graph.tsx`) rather than introducing a graph engine.

**Tech Stack:** React 18 + Vite, MobX, tRPC, SurrealDB, shadcn/ui + design tokens, plugin SystemJS runtime, MCP SDK (`@modelcontextprotocol/sdk`, already a server dependency).

**Spec:** This file. Phase plans:
- [`01-docker-plugin.md`](./01-docker-plugin.md)
- [`02-workflow-canvas.md`](./02-workflow-canvas.md)
- [`03-mcp-installation.md`](./03-mcp-installation.md)
- Python-server cutover/parity/sync is owned by [`../cloud_surreal/06-cutover-parity-and-sync.md`](../cloud_surreal/06-cutover-parity-and-sync.md).

## Global Constraints

- **i18n:** reuse existing locale keys; a new user-facing string must be added to `en` **and** all 16 other locales or `e2e/i18n-parity.spec.mjs` fails (PI-009).
- **Design tokens only:** no raw colour/spacing utilities — `bun run --cwd frontend check:contracts` must stay green.
- **Plugin contract:** new capabilities are declared on `BasePlugin.capabilities` (PI-024 I2); undeclared use warns, never silently passes.
- **MCP safety:** `mcpServersRouter` already whitelists stdio commands and rejects shell metacharacters; new install flows must route through that validation, not bypass it.
- **Auth:** MCP and Docker surfaces are `superAdminAuthMiddleware`-gated; no anonymous control of the host.

## Deliverables

| # | Deliverable | Server seam | UI seam |
| --- | --- | --- | --- |
| 1 | Docker plugin | new `dockerRouter` + plugin manifest | `PlanIncSettings` plugin card + a Docker panel |
| 2 | Workflow canvas | new `workflowRouter` + `workflow` table | new `pages/workflow.tsx` reachable from a plugin page |
| 3 | MCP installation | extend `mcpServersRouter` with a presets/install action | `PlanIncSettings/McpServersSection.tsx` |

## Phase Overview

| Phase | Plan | Delivers | Gate |
| --- | --- | --- | --- |
| 1 | 01 Docker plugin | Docker status/containers route, plugin package, declared capabilities | A plugin can read status; the panel renders; capability is declared |
| 2 | 02 Workflow canvas | workflow data model, canvas, node add, load/run scripts, plugin-opened page | A workflow round-trips as JSON and runs two nodes |
| 3 | 03 MCP installation | catalog presets, one-click install through existing validation, status UI | An install creates an enabled server that `testConnection` can reach |

## Review Focus

1. **Capability declarations** — every new plugin capability used in these slices must be declared in the plugin manifest, or the I2 warning banner fires.
2. **MCP command injection** — a preset whose `args` contain `;`, `$()`, `..`, or a redirect must be rejected by `areArgsSafe`, not installed.
3. **Workflow cycles** — a workflow with a cycle or a dangling edge must fail validation on load rather than hang the runner.
4. **Docker host exposure** — an unauthenticated or non-admin request to the Docker route must be rejected, and the daemon socket must never be proxied verbatim.
5. **i18n** — any new label introduced in these slices must exist in all locales before merge.

Each line has a test pinned to its owning task in the phase plan that introduces the code.

## Open Decisions

1. **Docker plugin scope** — read-only status first (recommended) vs container lifecycle control. Lifecycle needs a socket-permission decision.
2. **Workflow node schema** — whether nodes are PlanInc-native (`note`/`task`/`resource`) only, or arbitrary registered plugin node types.
3. **MCP catalog source** — a bundled JSON preset list vs a fetched registry. Bundled is the safe default (no network at install).
