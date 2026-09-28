import json

from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.tenancy.models import Tenant
from domain.errors import ErrorCode
from middleware.tenant import require_tenant

from . import services
from .models import Agent, AIConversation, AIModel, AIProvider, AIRun, Embedding


def _tenant_for_request(request):
    missing = require_tenant(request)
    if missing:
        return missing, None
    try:
        return None, Tenant.objects.get(
            slug=request.tenant_context.slug, is_active=True
        )
    except Tenant.DoesNotExist:
        return (
            failure(
                ErrorCode.TENANT_NOT_FOUND,
                "Tenant is unknown or inactive.",
                status=404,
            ),
            None,
        )


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _actor(request):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user


def _pagination(request):
    try:
        page = int(request.GET.get("page", "1"))
        page_size = int(request.GET.get("page_size", "30"))
    except (TypeError, ValueError):
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size invalid.")
    if page < 1 or page_size < 1 or page_size > 100:
        return None, failure(ErrorCode.INVALID_PAYLOAD, "page/page_size out of range.")
    return (page, page_size), None


def _paginate(queryset, request):
    paging, error = _pagination(request)
    if error:
        return None, error
    page, page_size = paging
    total = queryset.count()
    rows = queryset[(page - 1) * page_size : page * page_size]
    return ((rows, {"page": page, "page_size": page_size, "total": total}), None)


# ------------------------------------------------------------------ serializers
def _serialize_provider(provider):
    return {
        "id": provider.id,
        "name": provider.name,
        "kind": provider.kind,
        "base_url": provider.base_url,
        "is_active": provider.is_active,
        "has_credentials": bool(provider.encrypted_api_key),
        "created_at": provider.created_at.isoformat(),
    }


def _serialize_model(model):
    return {
        "id": model.id,
        "provider_id": model.provider_id,
        "name": model.name,
        "context_window": model.context_window,
        "is_active": model.is_active,
    }


def _serialize_agent(agent):
    return {
        "id": agent.id,
        "name": agent.name,
        "description": agent.description,
        "system_prompt": agent.system_prompt,
        "model_id": agent.model_id,
        "is_active": agent.is_active,
        "tools": [
            {"id": tool.id, "name": tool.name, "is_enabled": tool.is_enabled}
            for tool in agent.tools.all()
        ],
    }


def _serialize_conversation(conversation):
    return {
        "id": conversation.id,
        "title": conversation.title,
        "agent_id": conversation.agent_id,
        "user_id": conversation.user_id,
        "created_at": conversation.created_at.isoformat(),
        "updated_at": conversation.updated_at.isoformat(),
    }


def _serialize_message(message):
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


def _serialize_run(run):
    return {
        "id": run.id,
        "conversation_id": run.conversation_id,
        "model_id": run.model_id,
        "status": run.status,
        "output": run.output,
        "error": run.error,
        "provider_metadata": run.provider_metadata,
        "usage": [
            {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
                "latency_ms": usage.latency_ms,
            }
            for usage in run.usage_records.all()
        ],
        "created_at": run.created_at.isoformat(),
    }


def _serialize_embedding(embedding):
    return {
        "id": embedding.id,
        "object_type": embedding.object_type,
        "object_id": embedding.object_id,
        "model": embedding.model,
        "dimensions": embedding.dimensions,
    }


# --------------------------------------------------------------------- providers
@require_http_methods(["GET", "POST"])
@service_view
def providers(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        rows = AIProvider.objects.filter(tenant=tenant)
        return success([_serialize_provider(row) for row in rows])
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    provider = services.create_provider(
        tenant=tenant,
        name=payload["name"],
        kind=str(payload.get("kind", "openai")),
        api_key=str(payload.get("api_key", "")),
        base_url=str(payload.get("base_url", "")),
    )
    return success(_serialize_provider(provider), status=201)


def _get_provider(tenant, provider_id):
    return AIProvider.objects.filter(id=provider_id, tenant=tenant).first()


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def provider_detail(request, provider_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    provider = _get_provider(tenant, provider_id)
    if provider is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(_serialize_provider(provider))
    if request.method == "DELETE":
        provider.delete()
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    services.update_provider(
        provider=provider,
        name=payload.get("name"),
        kind=payload.get("kind"),
        base_url=payload.get("base_url"),
        api_key=payload.get("api_key"),
        is_active=payload.get("is_active"),
    )
    return success(_serialize_provider(provider))


@require_http_methods(["GET", "POST"])
@service_view
def models(request, provider_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    provider = _get_provider(tenant, provider_id)
    if provider is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(
            [_serialize_model(row) for row in provider.models.all()]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    model = services.add_model(
        provider=provider,
        name=payload["name"],
        context_window=int(payload.get("context_window", 0) or 0),
    )
    return success(_serialize_model(model), status=201)


# ------------------------------------------------------------------------ agents
@require_http_methods(["GET", "POST"])
@service_view
def agents(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        rows = Agent.objects.filter(tenant=tenant).prefetch_related("tools")
        return success([_serialize_agent(row) for row in rows])
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    model = None
    if payload.get("model_id") is not None:
        model = AIModel.objects.filter(
            id=payload["model_id"], provider__tenant=tenant
        ).first()
        if model is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown model.", status=404)
    agent = services.create_agent(
        tenant=tenant,
        name=payload["name"],
        system_prompt=str(payload.get("system_prompt", "")),
        model=model,
    )
    return success(_serialize_agent(agent), status=201)


@require_http_methods(["GET", "PATCH", "DELETE"])
@service_view
def agent_detail(request, agent_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    agent = Agent.objects.filter(id=agent_id, tenant=tenant).first()
    if agent is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(_serialize_agent(agent))
    if request.method == "DELETE":
        agent.delete()
        return success(None)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    for field in ("name", "system_prompt", "is_active"):
        if payload.get(field) is not None:
            setattr(agent, field, payload[field])
    if payload.get("model_id") is not None:
        model = AIModel.objects.filter(
            id=payload["model_id"], provider__tenant=tenant
        ).first()
        if model is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown model.", status=404)
        agent.model = model
    agent.save()
    return success(_serialize_agent(agent))


@require_http_methods(["GET", "POST"])
@service_view
def agent_tools(request, agent_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    agent = Agent.objects.filter(id=agent_id, tenant=tenant).first()
    if agent is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(
            [
                {"id": tool.id, "name": tool.name, "is_enabled": tool.is_enabled}
                for tool in agent.tools.all()
            ]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("name"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "name must be a string.")
    tool = services.add_agent_tool(
        agent=agent, name=payload["name"], config=payload.get("config")
    )
    return success(
        {"id": tool.id, "name": tool.name, "is_enabled": tool.is_enabled}, status=201
    )


# ---------------------------------------------------------------- conversations
@require_http_methods(["GET", "POST"])
@service_view
def conversations(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = AIConversation.objects.filter(tenant=tenant)
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_conversation(c) for c in rows], meta=meta)
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD)
    agent = None
    if payload.get("agent_id") is not None:
        agent = Agent.objects.filter(
            id=payload["agent_id"], tenant=tenant
        ).first()
        if agent is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown agent.", status=404)
    conversation = services.create_conversation(
        tenant=tenant,
        user=_actor(request),
        title=str(payload.get("title", "")),
        agent=agent,
    )
    return success(_serialize_conversation(conversation), status=201)


def _get_conversation(tenant, conversation_id):
    return AIConversation.objects.filter(id=conversation_id, tenant=tenant).first()


@require_http_methods(["GET", "DELETE"])
@service_view
def conversation_detail(request, conversation_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    conversation = _get_conversation(tenant, conversation_id)
    if conversation is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "DELETE":
        conversation.delete()
        return success(None)
    data = _serialize_conversation(conversation)
    data["messages"] = [
        _serialize_message(message) for message in conversation.messages.all()
    ]
    return success(data)


@require_http_methods(["GET", "POST"])
@service_view
def messages(request, conversation_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    conversation = _get_conversation(tenant, conversation_id)
    if conversation is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(
            [_serialize_message(m) for m in conversation.messages.all()]
        )
    payload = _payload(request)
    if not payload or not isinstance(payload.get("content"), str):
        return failure(ErrorCode.INVALID_PAYLOAD, "content must be a string.")
    message = services.add_message(
        conversation=conversation,
        role=str(payload.get("role", "user")),
        content=payload["content"],
    )
    return success(_serialize_message(message), status=201)


@require_http_methods(["GET", "POST"])
@service_view
def runs(request, conversation_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    conversation = _get_conversation(tenant, conversation_id)
    if conversation is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    if request.method == "GET":
        return success(
            [_serialize_run(run) for run in conversation.runs.all()]
        )
    payload = _payload(request) or {}
    model = None
    if payload.get("model_id") is not None:
        model = AIModel.objects.filter(
            id=payload["model_id"], provider__tenant=tenant
        ).first()
        if model is None:
            return failure(ErrorCode.NOT_FOUND, "Unknown model.", status=404)
    run = services.start_run(conversation=conversation, model=model)
    if payload.get("execute", True):
        run = services.execute_run(run=run)
    return success(_serialize_run(run), status=201)


@require_http_methods(["POST"])
@service_view
def run_complete(request, run_id):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    run = AIRun.objects.filter(
        id=run_id, conversation__tenant=tenant
    ).first()
    if run is None:
        return failure(ErrorCode.NOT_FOUND, status=404)
    run = services.execute_run(run=run)
    return success(_serialize_run(run))


# -------------------------------------------------------------------- embeddings
@require_http_methods(["GET", "POST"])
@service_view
def embeddings(request):
    error, tenant = _tenant_for_request(request)
    if error:
        return error
    if request.method == "GET":
        queryset = Embedding.objects.filter(tenant=tenant)
        object_type = (request.GET.get("object_type") or "").strip()
        if object_type:
            queryset = queryset.filter(object_type=object_type)
        result, error = _paginate(queryset, request)
        if error:
            return error
        rows, meta = result
        return success([_serialize_embedding(e) for e in rows], meta=meta)
    payload = _payload(request)
    if not payload or not isinstance(payload.get("vector"), list):
        return failure(ErrorCode.INVALID_PAYLOAD, "vector must be a list.")
    embedding = services.upsert_embedding(
        tenant=tenant,
        object_type=str(payload.get("object_type", "note")),
        object_id=payload.get("object_id"),
        vector=payload["vector"],
        model=str(payload.get("model", "")),
    )
    return success(_serialize_embedding(embedding), status=201)
