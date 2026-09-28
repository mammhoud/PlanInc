# Phase 2: Workflow Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design a node/edge workflow on a page, add nodes, load workflows from script files, validate and run them. The page opens from a **plugin** page, and lives at `/workflow`.

**Architecture:** A `workflow` record stores `{ name, nodes[], edges[], version }` as JSON in SurrealDB. `workflowRouter` owns CRUD + `validate` + `run`. The canvas reuses `PlanIncGraph`; node types are a small native registry (Phase 2 keeps Open Decision 2 at PlanInc-native only). "Loading scripts" are workflow package files validated before hydration.

**Tech Stack:** tRPC, SurrealDB, React + `PlanIncGraph`, SystemJS plugin runtime.

**Spec:** [`00-index.md`](./00-index.md)

## Global Constraints

- Validate on load and before run: reject cycles and dangling edges (Review Focus 3).
- Node/edge JSON must round-trip unchanged (import → export).
- No new graph library; reuse `PlanIncGraph`.
- Reuse existing i18n keys; tokens only.

## File Structure

- `shared/lib/workflow.ts` — types + `validateWorkflow(nodes, edges)`
- `server/routerTrpc/workflow.ts` — CRUD, `validate`, `run`
- `server/routerTrpc/_app.ts` — register `workflow`
- `frontend/src/pages/workflow.tsx` — the page
- `frontend/src/components/PlanincWorkflow/WorkflowCanvas.tsx` — editor over `PlanIncGraph`
- `frontend/src/components/PlanincWorkflow/NodePalette.tsx` — add-node controls
- `frontend/src/components/PlanincWorkflow/loadWorkflowScript.ts` — script loader
- `plugins/planinc-workflow/index.js` — plugin that opens the page
- `frontend/src/App.tsx` — route `/workflow` (lazy)
- Tests: `shared/lib/__tests__/workflow.test.ts`, `server/routerTrpc/__tests__/workflow.test.ts`

## Interfaces

```ts
// shared/lib/workflow.ts
export type WorkflowNode = { id: string; type: 'start'|'note'|'task'|'resource'|'ai'; label: string; config: Record<string, unknown> }
export type WorkflowEdge = { id: string; from: string; to: string }
export type WorkflowValidation = { ok: boolean; errors: string[] }
export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowValidation

// server/routerTrpc/workflow.ts
// list: query -> Workflow[]; get: query({id}); upsert: mutate(WorkflowInput); delete: mutate({id})
// validate: mutate({nodes,edges}) -> WorkflowValidation
// run: mutate({id}) -> { started: boolean; runId: string }
```

## Tasks

### Task 1: Workflow types + validation

**Files:** Create `shared/lib/workflow.ts`; Test `shared/lib/__tests__/workflow.test.ts`

- [ ] **Step 1: Write the failing test** — `validateWorkflow` rejects a 3-node cycle and an edge pointing at a missing node id, and accepts a valid diamond (Review Focus 3).
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** `validateWorkflow` with a DFS cycle check + edge-endpoint existence check.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

### Task 2: CRUD + run route

**Files:** Create `server/routerTrpc/workflow.ts`; Modify `server/routerTrpc/_app.ts`

- [ ] **Step 1: Write the failing test** — `upsert` then `get` returns byte-identical `nodes`/`edges` (round-trip); `run` on an invalid workflow returns `{started:false}` and does not create a run.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the router; `run` calls `validateWorkflow` first.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

### Task 3: Canvas page + node palette

**Files:** Create `pages/workflow.tsx`, `PlanincWorkflow/WorkflowCanvas.tsx`, `PlanincWorkflow/NodePalette.tsx`; Modify `App.tsx`

- [ ] **Step 1: Write the failing test** — render the canvas with an empty workflow, click "add node", assert a node appears and the graph receives it.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the page and canvas over `PlanIncGraph`; wire the lazy route.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

### Task 4: Loading scripts + plugin page

**Files:** Create `PlanincWorkflow/loadWorkflowScript.ts`, `plugins/planinc-workflow/index.js`

- [ ] **Step 1: Write the failing test** — `loadWorkflowScript` rejects a JSON file with a cycle and returns `{ok:false,errors}`, and accepts a valid file.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the loader (parse → `validateWorkflow` → return) and a plugin that registers a menu/dialog action navigating to `/workflow`.
- [ ] **Step 4: Run the test to verify it passes.**
- [ ] **Step 5: Commit.**

## Exit Gate

- A workflow round-trips as JSON; invalid scripts and cyclic workflows are rejected with errors.
- The page opens from the plugin and from `/workflow`.
- `run` refuses invalid workflows.
- `tsc` + `check:contracts` green.
