# Phase 1: Docker Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-party, admin-only plugin that reports the host's Docker state (daemon reachable, containers with name/image/status) through a curated read API, and renders it in a settings panel.

**Architecture:** A `dockerRouter` (tRPC, `superAdminAuthMiddleware`) is the only thing that talks to the Docker socket; the plugin consumes the typed API — it never holds the socket. The plugin declares its capabilities so the I2 guard is exercised, not bypassed.

**Tech Stack:** `dockerode` (or the Docker Engine HTTP API over a unix socket), tRPC, `BasePlugin`, `PluginApiStore`.

**Spec:** [`00-index.md`](./00-index.md)

## Global Constraints

- `superAdminAuthMiddleware` on every procedure.
- The route returns **curated fields only** — never raw `inspect` payloads, env vars, or mounts.
- No container lifecycle in this phase (Open Decision 1).
- Reuse existing i18n keys; no new labels.

## File Structure

- `server/routerTrpc/docker.ts` — `dockerRouter` (`status`, `list`)
- `server/routerTrpc/_app.ts` — register `docker`
- `server/lib/docker.ts` — socket client + field projection (the only Docker-aware module)
- `frontend/src/components/PlanIncSettings/DockerSetting.tsx` — panel
- `frontend/src/components/PlanIncSettings/registry/RegistrySettingItem.tsx` — not modified; the section is added to `pages/settings.tsx`
- `plugins/planinc-docker/index.js` — plugin package (manifest + panel capability)
- Tests: `server/lib/__tests__/docker.test.ts`

## Interfaces

```ts
// server/lib/docker.ts
export type DockerStatus = { available: boolean; version?: string; error?: string }
export type DockerContainer = { id: string; name: string; image: string; state: string; status: string }
export async function getDockerStatus(): Promise<DockerStatus>
export async function listContainers(): Promise<DockerContainer[]>

// server/routerTrpc/docker.ts
// status: query -> DockerStatus
// list:   query -> DockerContainer[]
```

## Tasks

### Task 1: Docker client with field projection

**Files:** Create `server/lib/docker.ts`; Test `server/lib/__tests__/docker.test.ts`

- [ ] **Step 1: Write the failing test** — inject a fake engine; assert `listContainers()` returns only `{id,name,image,state,status}` for a raw container that also has `Env`, `Mounts`, and `NetworkSettings`, i.e. the extra keys are dropped.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** `getDockerStatus`/`listContainers` against the socket, projecting fields. `getDockerStatus` returns `{available:false,error}` instead of throwing when the socket is absent.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

### Task 2: Admin-only route

**Files:** Create `server/routerTrpc/docker.ts`; Modify `server/routerTrpc/_app.ts`

**Interfaces:** Produces `docker.status`, `docker.list` (both `query`).

- [ ] **Step 1: Write the failing test** — call `docker.list` with a non-admin context; expect a `FORBIDDEN`/`UNAUTHORIZED` error, not data (Review Focus 4).
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the router with `superAdminAuthMiddleware` on both procedures and explicit zod `.output()` schemas.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

### Task 3: Plugin package + declared capabilities

**Files:** Create `plugins/planinc-docker/index.js`, `plugins/planinc-docker/metadata.json`; Modify `pages/settings.tsx` (add the section)

**Interfaces:** Consumes `docker.status`, `docker.list`; declares `capabilities: ['addCardFooterSlot']` if it adds a card slot (otherwise declares none).

- [ ] **Step 1: Write the failing test** — load the plugin through the existing plugin harness (`PluginManagerStore.initPlugin`) and assert no entry appears in `PluginApiStore.capabilityWarnings` for it (Review Focus 1).
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the plugin (a `BasePlugin` subclass) that renders the container table, and add the settings section.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

## Exit Gate

- `docker.status`/`docker.list` work for an admin and fail closed for everyone else.
- No raw `inspect` fields leave the server.
- The plugin loads with zero capability warnings.
- `tsc` + `check:contracts` green.
