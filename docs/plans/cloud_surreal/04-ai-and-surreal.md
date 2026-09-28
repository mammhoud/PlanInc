# Phase 4: cloud_surreal AI on SurrealDB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port every AI capability of `server/aiServer/` to `cloud_surreal/` with all AI state (providers, agents, conversations, runs, embeddings, usage) stored in SurrealDB, tenant-scoped, with secrets never leaving the server — exposed through the single AI entry point `/plan`.

**Architecture:** `app/ai/providers/` implements one adapter per provider behind a `ProviderPort`; `app/ai/` holds conversations, runs, embeddings, and usage services; the MCP hub and agent tools live in `app/ai/mcp/` and `app/ai/tools/`. Every AI read is filtered by the requesting membership, mirroring the notes policy.

**Tech Stack:** Robyn, `surrealdb`, `httpx`, `pytest`.

**Spec:** [`00-index.md`](./00-index.md), [`02-feature-parity.md`](./02-feature-parity.md)

## Global Constraints

- Provider credentials are encrypted at rest and **never** serialized into an API response.
- Every AI read is permission-filtered by the requesting membership.
- Embeddings and search documents carry `tenant_id`.

## AI Surface to Port (`server/aiServer/`)

- `providers/` — OpenAI, Anthropic, Google, Azure, Ollama, and the rest of the current adapters.
- `tools/` — including `searchPlaninc`, `updatePlaninc`, `scheduledTask`.
- `mcp/` — inbound server (`routerExpress/mcp.ts`) and outbound client hub (`PlanIncSettings/McpServersSection`).
- Personality/rooms/agents/conversations/messages/runs/usage.

## `/plan` Interfaces

```python
# app/routers/plan.py
async def get_health(request) -> dict: ...        # GET /plan/health
async def post_chat(request) -> dict: ...         # POST /plan/chat
async def list_conversations(request) -> dict: ...# GET  /plan/conversations
async def post_runs(request) -> dict: ...         # POST /plan/runs
async def post_search(request) -> dict: ...       # POST /plan/search
async def providers(request) -> dict: ...         # GET|PUT /plan/providers (admin)
async def stream(ws) -> None: ...                 # WS   /plan/stream
```

See [`00-index.md`](./00-index.md) for the route table, auth rule, and data tables.

## Task Board

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| P4-1 | SurrealDB tables + migrations: `ai_provider`, `ai_model`, `agent`, `agent_tool`, `ai_conversation`, `ai_message`, `ai_run`, `ai_usage`, `embedding` | Phase 1 | Pending |
| P4-2 | `ProviderPort` + provider adapters; secret encryption at rest | P4-1 | Pending |
| P4-3 | Conversation/message/run services + `ai` router | P4-2 | Pending |
| P4-4 | Embedding service + permission-filtered retrieval | P4-3 | Pending |
| P4-5 | `aiScheduledTask` + worker with tenant context | P4-3 | Pending |
| P4-6 | MCP server + client hub | P4-3 | Pending |
| P4-7 | `openai`-compatible Express route (tenant credentials + rate limit) | P4-2 | Pending |
| P4-8a | `/plan/health` + router scaffolding (auth + tenant scope) | A3 | Pending |
| P4-8b | `/plan/chat` + `/plan/runs` + `/plan/conversations` | P4-8a | Pending |
| P4-8c | `/plan/search` (permission-filtered embeddings) | A4 | Pending |
| P4-8d | `/plan/providers` admin surface (secrets never returned) | A2 | Pending |
| P4-8e | `/plan/stream` WebSocket (same auth handshake as `/api/sync`) | P4-8b, Phase 3 P3-2 | Pending |

## Required Tests

- A provider secret is absent from every AI router response (serialize and grep the exact secret).
- Cross-tenant AI retrieval returns nothing for another tenant's note.
- Usage rows record model, latency, and failure state for both success and error runs.
- **Review Focus 6:** an unauthenticated or expired-token client is rejected on `/plan/chat` and on the `/plan/stream` handshake, and a stream delivers only caller-tenant data.

## Exit Gate

All AI features answer through `/plan` on `cloud_surreal`; no secret appears in a response; retrieval is tenant-scoped; `/plan/stream` authenticates before streaming.
