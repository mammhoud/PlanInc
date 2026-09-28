"""django-bolt integration boundary.

The versioned API is declared once, as data (:class:`RouteSpec`), so the same
registry can back the django-bolt mount, the generated OpenAPI document, and
the client adapter contract. django-bolt is optional: :func:`create_bolt_api`
fails loudly when the package is absent, while :func:`openapi_document` always
works because it only reads the registry.
"""

from __future__ import annotations

from dataclasses import dataclass, field

API_VERSION = "v1"
API_PREFIX = f"/api/{API_VERSION}"


@dataclass(frozen=True)
class RouteSpec:
    method: str
    path: str
    service: str
    summary: str = ""
    tag: str = "core"
    auth: bool = True
    parameters: tuple[str, ...] = field(default_factory=tuple)

    @property
    def full_path(self) -> str:
        return f"{API_PREFIX}{self.path}"


def route_registry() -> tuple[RouteSpec, ...]:
    """The versioned surface, grouped by the domain slice that owns it."""
    return (
        # notes
        RouteSpec("GET", "/notes", "notes.list_notes", "List notes"),
        RouteSpec("POST", "/notes", "notes.create_note", "Create a note"),
        RouteSpec("GET", "/notes/{id}", "notes.get_note", "Get a note"),
        RouteSpec("PATCH", "/notes/{id}", "notes.update_note", "Update a note"),
        RouteSpec("DELETE", "/notes/{id}", "notes.delete_note", "Delete a note"),
        RouteSpec(
            "GET", "/notes/{id}/history", "notes.list_versions", "Note history"
        ),
        RouteSpec(
            "GET",
            "/notes/{id}/comments",
            "notes.list_comments",
            "List comments",
        ),
        RouteSpec(
            "POST",
            "/notes/{id}/comments",
            "notes.add_comment",
            "Add a comment",
        ),
        RouteSpec("GET", "/notes/{id}/tags", "notes.list_tags", "Note tags"),
        RouteSpec("POST", "/notes/{id}/links", "notes.create_link", "Link notes"),
        RouteSpec(
            "GET",
            "/notes/{id}/backlinks",
            "notes.list_backlinks",
            "Note backlinks",
        ),
        RouteSpec("GET", "/tags", "notes.list_tags", "List tags"),
        # planning
        RouteSpec(
            "GET", "/planning/tasks", "planning.list_tasks", "List tasks", "planning"
        ),
        RouteSpec(
            "POST",
            "/planning/tasks",
            "planning.create_task",
            "Create a task",
            "planning",
        ),
        RouteSpec(
            "PATCH",
            "/planning/tasks/{id}",
            "planning.update_task",
            "Update a task",
            "planning",
        ),
        RouteSpec(
            "GET",
            "/planning/tickets",
            "planning.list_tickets",
            "List tickets",
            "planning",
        ),
        RouteSpec(
            "POST",
            "/planning/tickets",
            "planning.create_ticket",
            "Create a ticket",
            "planning",
        ),
        RouteSpec(
            "GET",
            "/planning/study",
            "planning.list_study_items",
            "List study items",
            "planning",
        ),
        RouteSpec(
            "POST",
            "/planning/study/{id}/review",
            "planning.review_study_item",
            "Review an item",
            "planning",
        ),
        # knowledge
        RouteSpec(
            "GET",
            "/knowledge/resources",
            "knowledge.list_resources",
            "List resources",
            "knowledge",
        ),
        RouteSpec(
            "POST",
            "/knowledge/resources",
            "knowledge.create_resource",
            "Create a resource",
            "knowledge",
        ),
        RouteSpec(
            "GET",
            "/knowledge/attachments",
            "knowledge.list_attachments",
            "List attachments",
            "knowledge",
        ),
        RouteSpec(
            "POST",
            "/knowledge/attachments",
            "knowledge.create_attachment",
            "Create an attachment",
            "knowledge",
        ),
        # search
        RouteSpec("GET", "/search", "search.search", "Permission-aware search"),
        # ai
        RouteSpec("GET", "/ai/providers", "ai.list_providers", "List providers"),
        RouteSpec("POST", "/ai/providers", "ai.create_provider", "Create a provider"),
        RouteSpec(
            "GET",
            "/ai/conversations",
            "ai.list_conversations",
            "List conversations",
        ),
        RouteSpec(
            "POST",
            "/ai/conversations/{id}/runs",
            "ai.start_run",
            "Start an AI run",
        ),
        # integrations
        RouteSpec(
            "GET",
            "/integrations/webhooks",
            "integrations.list_webhooks",
            "List webhooks",
            "integrations",
        ),
        RouteSpec(
            "POST",
            "/integrations/webhooks",
            "integrations.create_webhook",
            "Create a webhook",
            "integrations",
        ),
        RouteSpec(
            "GET",
            "/integrations/shares",
            "integrations.list_shares",
            "List share links",
            "integrations",
        ),
        # analytics / audit
        RouteSpec(
            "GET",
            "/analytics/summary",
            "analytics.tenant_summary",
            "Tenant summary",
            "analytics",
        ),
        RouteSpec("GET", "/audit", "audit.events_for", "Audit trail", "audit"),
    )


def _json_response_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "status": {"type": "string"},
            "message": {"type": "string"},
            "data": {},
            "meta": {"type": "object"},
            "error": {"type": "string"},
            "details": {"type": "object"},
        },
        "required": ["status"],
    }


def openapi_document(version: str = API_VERSION) -> dict:
    """Build an OpenAPI 3.1 document from the route registry."""
    if version != API_VERSION:
        raise ValueError(f"Unknown API version: {version}")
    response = {"200": {"description": "Standard envelope"}}
    paths: dict = {}
    for spec in route_registry():
        entry = paths.setdefault(spec.full_path, {})
        operation = {
            "operationId": spec.service,
            "summary": spec.summary or spec.service,
            "tags": [spec.tag],
            "responses": response,
        }
        if spec.auth:
            operation["security"] = [{"sessionJwt": []}]
        entry[spec.method.lower()] = operation
    return {
        "openapi": "3.1.0",
        "info": {"title": "PlanInc Django API", "version": version},
        "servers": [{"url": "/"}],
        "components": {
            "securitySchemes": {
                "sessionJwt": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "Authorization",
                }
            },
            "schemas": {"Envelope": _json_response_schema()},
        },
        "paths": paths,
    }


def create_bolt_api(version: str = API_VERSION):
    """Mount the registry on django-bolt when the package is available."""
    try:
        from bolt import BoltAPI
    except ImportError as exc:
        raise RuntimeError(
            "django-bolt is required to construct the PlanInc Bolt API."
        ) from exc
    api = BoltAPI()
    for spec in route_registry():
        handler = getattr(api, spec.method.lower(), None)
        if handler is not None:
            handler(spec.path, name=spec.service)
    return api
