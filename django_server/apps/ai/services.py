"""AI use cases: providers, agents, conversations, runs, usage, and embeddings."""

from __future__ import annotations

import time

from django.db import transaction
from django.utils import timezone

from apps.operations.services import enqueue_event
from domain.errors import ConfigurationError, ValidationError
from domain.events.types import (
    AI_AGENT_CREATED,
    AI_CONVERSATION_CREATED,
    AI_MESSAGE_ADDED,
    AI_PROVIDER_CONFIGURED,
    AI_RUN_COMPLETED,
    AI_RUN_FAILED,
    AI_RUN_STARTED,
    EMBEDDING_INDEXED,
)
from domain.policies.tenant import require_same_tenant, require_tenant_scope
from domain.ports import ai as ai_port
from domain.ports import secrets as secrets_port

from .models import (
    Agent,
    AgentTool,
    AIConversation,
    AIMessage,
    AIModel,
    AIProvider,
    AIRun,
    AIUsage,
    Embedding,
)

PROVIDER_KINDS = {choice for choice, _ in AIProvider.KIND_CHOICES}
MESSAGE_ROLES = {choice for choice, _ in AIMessage.ROLE_CHOICES}


def _actor_pk(actor):
    return actor.pk if getattr(actor, "pk", None) else None


# --------------------------------------------------------------------------- #
# Providers and models
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_provider(
    *, tenant, name: str, kind: str = "openai", api_key: str = "", base_url: str = ""
) -> AIProvider:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A provider name is required.")
    if kind not in PROVIDER_KINDS:
        raise ValidationError("Unknown provider kind.")
    provider = AIProvider.objects.create(
        tenant=tenant,
        name=name,
        kind=kind,
        base_url=base_url,
        encrypted_api_key=secrets_port.encrypt_secret(api_key) if api_key else "",
    )
    enqueue_event(
        tenant=tenant,
        event_type=AI_PROVIDER_CONFIGURED,
        aggregate_type="ai_provider",
        aggregate_id=provider.pk,
        payload={"name": provider.name, "kind": provider.kind},
        idempotency_key=f"ai.provider.configured:{provider.pk}",
    )
    return provider


@transaction.atomic
def update_provider(*, provider: AIProvider, **fields) -> AIProvider:
    require_tenant_scope(provider.tenant)
    if fields.get("kind") is not None:
        if fields["kind"] not in PROVIDER_KINDS:
            raise ValidationError("Unknown provider kind.")
        provider.kind = fields["kind"]
    if fields.get("name") is not None:
        name = str(fields["name"]).strip()
        if not name:
            raise ValidationError("A provider name is required.")
        provider.name = name
    if fields.get("base_url") is not None:
        provider.base_url = str(fields["base_url"])
    if fields.get("api_key"):
        provider.encrypted_api_key = secrets_port.encrypt_secret(fields["api_key"])
    if fields.get("is_active") is not None:
        provider.is_active = bool(fields["is_active"])
    provider.save()
    return provider


def provider_secret(provider: AIProvider) -> str:
    """Decrypt a provider credential. Only the AI port/serializer boundary uses it."""
    require_tenant_scope(provider.tenant)
    return secrets_port.decrypt_secret(provider.encrypted_api_key)


@transaction.atomic
def add_model(
    *, provider: AIProvider, name: str, context_window: int = 0
) -> AIModel:
    require_tenant_scope(provider.tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A model name is required.")
    return AIModel.objects.create(
        provider=provider, name=name, context_window=context_window
    )


# --------------------------------------------------------------------------- #
# Agents
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_agent(
    *, tenant, name: str, system_prompt: str = "", model: AIModel | None = None
) -> Agent:
    require_tenant_scope(tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("An agent name is required.")
    if model is not None:
        require_same_tenant(tenant=tenant, resource=model.provider)
    agent = Agent.objects.create(
        tenant=tenant,
        name=name,
        system_prompt=system_prompt,
        model=model,
    )
    enqueue_event(
        tenant=tenant,
        event_type=AI_AGENT_CREATED,
        aggregate_type="ai_agent",
        aggregate_id=agent.pk,
        payload={"name": agent.name},
        idempotency_key=f"ai.agent.created:{agent.pk}",
    )
    return agent


@transaction.atomic
def add_agent_tool(*, agent: Agent, name: str, config: dict | None = None) -> AgentTool:
    require_tenant_scope(agent.tenant)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A tool name is required.")
    tool, _ = AgentTool.objects.update_or_create(
        agent=agent,
        name=name,
        defaults={"config": config or {}},
    )
    return tool


# --------------------------------------------------------------------------- #
# Conversations and messages
# --------------------------------------------------------------------------- #
@transaction.atomic
def create_conversation(
    *, tenant, user=None, title: str = "", agent=None
) -> AIConversation:
    require_tenant_scope(tenant)
    if agent is not None:
        require_same_tenant(tenant=tenant, resource=agent)
    conversation = AIConversation.objects.create(
        tenant=tenant,
        user=_actor_pk(user),
        title=title,
        agent=agent,
    )
    enqueue_event(
        tenant=tenant,
        event_type=AI_CONVERSATION_CREATED,
        aggregate_type="ai_conversation",
        aggregate_id=conversation.pk,
        payload={"title": conversation.title},
        idempotency_key=f"ai.conversation.created:{conversation.pk}",
    )
    return conversation


@transaction.atomic
def add_message(*, conversation: AIConversation, role: str, content: str) -> AIMessage:
    require_tenant_scope(conversation.tenant)
    if role not in MESSAGE_ROLES:
        raise ValidationError("Unknown message role.")
    if not (content or "").strip():
        raise ValidationError("A message requires content.")
    message = AIMessage.objects.create(
        conversation=conversation, role=role, content=content
    )
    AIConversation.objects.filter(pk=conversation.pk).update(updated_at=timezone.now())
    enqueue_event(
        tenant=conversation.tenant,
        event_type=AI_MESSAGE_ADDED,
        aggregate_type="ai_conversation",
        aggregate_id=conversation.pk,
        payload={"message_id": message.pk, "role": role},
        idempotency_key=f"ai.message.added:{message.pk}",
    )
    return message


# --------------------------------------------------------------------------- #
# Runs and usage
# --------------------------------------------------------------------------- #
@transaction.atomic
def start_run(*, conversation: AIConversation, model: AIModel | None = None) -> AIRun:
    require_tenant_scope(conversation.tenant)
    if model is None and conversation.agent is not None:
        model = conversation.agent.model
    run = AIRun.objects.create(
        conversation=conversation,
        model=model,
        status="queued",
    )
    enqueue_event(
        tenant=conversation.tenant,
        event_type=AI_RUN_STARTED,
        aggregate_type="ai_run",
        aggregate_id=run.pk,
        payload={"conversation_id": conversation.pk},
        idempotency_key=f"ai.run.started:{run.pk}",
    )
    return run


def _resolve_provider(*, tenant, run: AIRun) -> AIProvider:
    if run.model is not None and run.model.provider.is_active:
        return run.model.provider
    if run.conversation.agent is not None and run.conversation.agent.model is not None:
        provider = run.conversation.agent.model.provider
        if provider.is_active:
            return provider
    provider = AIProvider.objects.filter(tenant=tenant, is_active=True).first()
    if provider is None:
        raise ConfigurationError("No active AI provider is configured for this tenant.")
    return provider


@transaction.atomic
def execute_run(*, run: AIRun) -> AIRun:
    """Execute a queued run through the provider port and record usage.

    The provider credential is decrypted inside this function only and is never
    placed on ``run.provider_metadata`` or any response.
    """
    require_tenant_scope(run.conversation.tenant)
    if run.status in ("succeeded", "failed"):
        return run
    provider = _resolve_provider(tenant=run.conversation.tenant, run=run)
    secret = (
        secrets_port.decrypt_secret(provider.encrypted_api_key)
        if provider.encrypted_api_key
        else ""
    )
    messages = []
    agent = run.conversation.agent
    if agent is not None and agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})
    messages.extend(
        {"role": message.role, "content": message.content}
        for message in run.conversation.messages.all()
    )
    model_name = run.model.name if run.model is not None else ""
    run.status = "running"
    run.started_at = timezone.now()
    run.save(update_fields=["status", "started_at"])
    started = time.monotonic()
    try:
        result = ai_port.complete(
            provider=provider,
            secret=secret,
            model=model_name,
            messages=messages,
        )
    except Exception as err:  # noqa: BLE001 - record any transport failure
        run.status = "failed"
        run.error = str(err)
        run.finished_at = timezone.now()
        run.save(update_fields=["status", "error", "finished_at"])
        enqueue_event(
            tenant=run.conversation.tenant,
            event_type=AI_RUN_FAILED,
            aggregate_type="ai_run",
            aggregate_id=run.pk,
            payload={"error": run.error},
            idempotency_key=f"ai.run.failed:{run.pk}",
        )
        return run
    latency_ms = int((time.monotonic() - started) * 1000)
    usage = result.get("usage", {})
    prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
    completion_tokens = int(usage.get("completion_tokens", 0) or 0)
    run.output = result.get("content", "")
    run.provider_metadata = {
        "provider": provider.name,
        "kind": provider.kind,
        "model": result.get("model", model_name),
    }
    run.status = "succeeded"
    run.finished_at = timezone.now()
    run.save()
    AIUsage.objects.create(
        run=run,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=prompt_tokens + completion_tokens,
        latency_ms=latency_ms,
    )
    enqueue_event(
        tenant=run.conversation.tenant,
        event_type=AI_RUN_COMPLETED,
        aggregate_type="ai_run",
        aggregate_id=run.pk,
        payload={"total_tokens": prompt_tokens + completion_tokens},
        idempotency_key=f"ai.run.completed:{run.pk}",
    )
    return run


@transaction.atomic
def fail_run(*, run: AIRun, error: str) -> AIRun:
    require_tenant_scope(run.conversation.tenant)
    run.status = "failed"
    run.error = error
    run.finished_at = timezone.now()
    run.save()
    enqueue_event(
        tenant=run.conversation.tenant,
        event_type=AI_RUN_FAILED,
        aggregate_type="ai_run",
        aggregate_id=run.pk,
        payload={"error": error},
        idempotency_key=f"ai.run.failed:{run.pk}",
    )
    return run


# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #
@transaction.atomic
def upsert_embedding(
    *, tenant, object_type: str, object_id, vector, model: str = ""
) -> Embedding:
    require_tenant_scope(tenant)
    if not isinstance(vector, list):
        raise ValidationError("The embedding vector must be a list.")
    embedding, _ = Embedding.objects.update_or_create(
        tenant=tenant,
        object_type=object_type,
        object_id=object_id,
        model=model,
        defaults={"vector": vector, "dimensions": len(vector)},
    )
    enqueue_event(
        tenant=tenant,
        event_type=EMBEDDING_INDEXED,
        aggregate_type="embedding",
        aggregate_id=embedding.pk,
        payload={"object_type": object_type, "object_id": str(object_id)},
        idempotency_key=f"ai.embedding.indexed:{object_type}:{object_id}:{model}",
    )
    return embedding
