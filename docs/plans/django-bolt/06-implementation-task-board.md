# PlanInc Django implementation task board

**Status:** Active execution board  
**Source architecture:** [`PI-020`](./05-server-architecture-and-erd.md)  
**Rule:** Completed repository work is recorded as evidence, not repeated as
open work. External release gates remain blocked until their dependencies are
available.

## Workstream A: shared foundation

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| A1 | Keep the active TypeScript server and shared `frontend/` deployment stable | - | Complete |
| A2 | Tenant registry, hostname resolution, and explicit tenant context | - | Complete |
| A3 | Health/readiness, request IDs, production settings guards | A2 | Complete |
| A4 | Run PostgreSQL/Redis/Django rehearsal with `django-tenants` | A2, A3 | Blocked externally |

## Workstream B: application boundaries

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| B1 | Add `domain/policies`, `domain/services`, `domain/events`, and `domain/ports` | A2 | Implemented shared tenant policy, transaction boundary, event names, and event sink port |
| B2 | Add `accounts` and `workspaces` models, memberships, roles, and sessions | B1 | Session JWT (`api/auth/token`, TS-claims shape) + OAuth membership link (allauth adapter) implemented and tested; native accounts adapter pending |
| B3 | Add `operations` outbox, job attempts, checkpoints, and retention records | B1 | Outbox and job-attempt models implemented; checkpoints/retention pending |
| B4 | Add shared error envelopes and service-to-Bolt/Fusion adapters | B1 | Pending |

## Workstream C: PlanInc product use cases

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| C1 | Extend notes with versions, tags, comments, backlinks, and history | B2, B3 | Notes service and outbox events implemented; `external_id` + `author` sync identity, `reviewedAt`, listing pagination added with tests; rich note model (versions/tags/comments) pending |
| C2 | Add planning tasks, tickets, categories, links, and study review | C1 | Pending |
| C3 | Add knowledge resources, relations, attachments, previews, and extraction | B3 | Pending |
| C4 | Add permission-aware search projections | C1, C3 | Pending |
| C5 | Add AI providers, agents, conversations, runs, embeddings, and usage | C4 | Pending |
| C6 | Add RSS, webhooks, plugins, MCP, SSO, and public share adapters | B3 | Pending |
| C7 | Add audit events and analytics read models | B3, C5, C6 | Pending |

## Workstream D: client and runtime integration

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| D1 | Add versioned django-bolt APIs and OpenAPI output from domain services | B4, C1 | Pending |
| D2 | Add django-fusion fragments using the same services | B4, C1 | Pending |
| D3 | Add Channels events, workspace membership checks, and reconnect contract | B2, C1 | Partial; workspace membership model/helper exists, WebSocket enforcement pending |
| D4 | Add frontend API adapters and migrate flows in auth, notes, planning, files, search, AI order | D1, D2 | Pending |

## Workstream E: migration and release

| ID | Task | Depends on | Status |
| --- | --- | --- | --- |
| E1 | Implement native SurrealKV reader and explicit target-model mappings | C1-C7 | Pending |
| E2 | Complete tenant import, rejected-record reports, and attachment verification | E1 | `import_surreal_workspace` implemented (idempotent, LWW, rejected-record report, author mapping) with tests; attachment verification pending |
| E3 | Run two PostgreSQL migration rehearsals and parity checks | A4, E2 | Blocked externally |
| E4 | Run backup/restore and rollback timing drills | E3 | Blocked externally |
| E5 | Validate Redis workers, metrics, Traefik, health, and WebSockets | A4, D3 | Blocked externally |
| E6 | Obtain product approval and execute the final cutover window | E4, E5 | Pending approval |

## Definition of done

A task is complete only when its code, migration, contract tests, and
documentation are updated together. A phase is not production-complete merely
because its Django module imports successfully. Cross-tenant authorization,
replay-safe side effects, import evidence, operational recovery, and client
contract coverage are required.
