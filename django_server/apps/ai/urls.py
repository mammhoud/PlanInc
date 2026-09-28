from django.urls import path

from . import views

urlpatterns = [
    path("api/ai/providers", views.providers, name="ai-providers"),
    path(
        "api/ai/providers/<int:provider_id>",
        views.provider_detail,
        name="ai-provider-detail",
    ),
    path(
        "api/ai/providers/<int:provider_id>/models",
        views.models,
        name="ai-provider-models",
    ),
    path("api/ai/agents", views.agents, name="ai-agents"),
    path("api/ai/agents/<int:agent_id>", views.agent_detail, name="ai-agent-detail"),
    path(
        "api/ai/agents/<int:agent_id>/tools",
        views.agent_tools,
        name="ai-agent-tools",
    ),
    path("api/ai/conversations", views.conversations, name="ai-conversations"),
    path(
        "api/ai/conversations/<int:conversation_id>",
        views.conversation_detail,
        name="ai-conversation-detail",
    ),
    path(
        "api/ai/conversations/<int:conversation_id>/messages",
        views.messages,
        name="ai-conversation-messages",
    ),
    path(
        "api/ai/conversations/<int:conversation_id>/runs",
        views.runs,
        name="ai-conversation-runs",
    ),
    path(
        "api/ai/runs/<int:run_id>/complete",
        views.run_complete,
        name="ai-run-complete",
    ),
    path("api/ai/embeddings", views.embeddings, name="ai-embeddings"),
]
