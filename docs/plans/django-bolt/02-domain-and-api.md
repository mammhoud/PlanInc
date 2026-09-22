# Phase 2: PlanInc domain model and Django API

**Status:** Architecture and first vertical slice implemented; domain slices staged

**Depends on:** [Phase 1](./01-foundation-and-tenancy.md)  
**Blocks:** Data import and frontend cutover  
**Outcome:** Core PlanInc functionality is available through bounded Django
apps, django-bolt endpoints, django-fusion fragments, and tested client adapters.

The complete app boundary, ownership matrix, integrated use-case flows, and
ERD are maintained in
[`PI-020`](./05-server-architecture-and-erd.md). Implement those boundaries
as bounded vertical slices rather than copying Formint's POS models.

Business rules belong in `domain/services/` and `domain/policies/`. Route
handlers, Bolt endpoints, Fusion fragments, WebSockets, and workers validate
transport input, call a service, and serialize or publish the result.

## Vertical slice order

### Slice A: accounts, workspaces, and memberships

- Django user/session integration
- JWT or session compatibility adapter
- login, logout, profile, token refresh, membership listing
- workspace role and permission service
- rate limits and audit events

**Gate:** existing client login and logout tests pass against Django.

### Slice B: notes and knowledge

- notes, tags, comments, backlinks, history
- list/filter/pagination contracts
- share and raw-share authorization
- Fusion fragments for notes and comments
- outbox event and permission-aware search projection

**Gate:** create, edit, delete, share, comment, and backlink flows pass for two
tenants.

### Slice C: planning and tickets

- todos, tasks, categories, fields, links
- ticket CRUD and configurable fields
- kanban and calendar query projections
- server-rendered tables/forms where the client requests fragments

**Gate:** planning and ticket UI tests pass with stable response envelopes.

### Slice D: resources and files

- upload, archive, delete, text extraction, preview, protected download
- tenant-prefixed object keys: `tenants/<schema>/uploads/...`
- content-type, size, filename, and authorization validation
- local storage only in development; object storage in production

**Gate:** upload/download tests prove tenant isolation and no path traversal.

### Slice E: AI, search, and integrations

- provider configuration and active-provider selection
- chat rooms, sessions, messages, runs, usage
- OpenAI-compatible endpoint with tenant credentials and rate limits
- RSS, plugins, MCP, webhooks, and external integrations
- permission-aware search

**Gate:** provider secrets are never returned to clients and integration
requests are tenant-scoped.

## API design

Use three explicit surfaces:

1. **django-bolt:** typed JSON CRUD, analytics, and high-frequency reads.
2. **django-fusion:** render-first tables/forms/fragments for HTMX or fallback
   client flows.
3. **Django services/management commands:** imports, exports, maintenance, and
   side effects that should not be exposed as generic CRUD.

Preserve the existing envelope where practical:

```json
{"status": "success", "message": "", "data": {}}
```

Document any intentional differences in the route matrix before changing the
frontend adapter.

## Bolt module rules

- Split endpoints by domain; do not create one large `bolt_api.py`.
- Use typed request/response schemas.
- Apply authentication and tenant context to every protected endpoint.
- Use explicit pagination limits and ordering.
- Return stable error codes for validation, authentication, authorization, and
  not-found cases.
- Generate OpenAPI documentation from the mounted Bolt APIs.

## Frontend migration

Keep `frontend/` unchanged initially. Add an API adapter layer that can select
the Django base URL by environment and supports a short-lived compatibility
mode. Migrate callers in this order:

```text
auth -> notes -> planning -> tickets -> files -> search -> AI -> integrations
```

Update TypeScript contracts and tests together with each endpoint slice.

## Required tests

- App boundary import and migration tests
- Bolt schema and OpenAPI tests
- Fusion render-first/data API tests
- Authentication and permission tests
- CRUD/filter/pagination tests
- File authorization and path safety tests
- Existing React API adapter tests
- Contract tests against Django and, while retained, the compatibility server

## Delivery checklist

- [x] Tenant-scoped notes model and CRUD contract
- [x] Shared ASGI and Channels boundary
- [x] Tenant context and worker guard
- [ ] Accounts, workspace membership, and authentication adapter
- [ ] Notes versions, comments, tags, backlinks, and outbox
- [ ] Planning, tickets, and study projections
- [ ] Files, extraction, previews, and object-storage ports
- [ ] AI provider, agent, conversation, embedding, and usage models
- [ ] Search projection and permission-aware query service
- [ ] RSS, webhooks, plugins, MCP, SSO, and public-share adapters
- [ ] Audit, analytics, durable jobs, and retry persistence
- [ ] Client adapter and Fusion fragment cutover

## Exit gate

Phase 2 is complete when all core client flows use Django for authentication,
notes, planning, tickets, files, and settings, and the route matrix has no
unowned active request.

The first tenant-scoped notes slice is available at `GET|POST /api/notes` and
`GET|PATCH|DELETE /api/notes/<id>`. It uses the standard success/error envelope,
rejects missing or inactive tenants, and filters every lookup by tenant.
