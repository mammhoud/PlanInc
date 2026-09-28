from django.urls import include, path

from api import views as api_views

urlpatterns = [
    path("api/openapi.json", api_views.openapi, name="openapi"),
    path(
        "api/<str:version>/openapi.json",
        api_views.openapi,
        name="openapi-versioned",
    ),
    path("", include("apps.health.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.accounts.urls")),
    path("", include("apps.workspaces.urls")),
    path("", include("apps.notes.urls")),
    path("", include("apps.planning.urls")),
    path("", include("apps.knowledge.urls")),
    path("", include("apps.search.urls")),
    path("", include("apps.ai.urls")),
    path("", include("apps.integrations.urls")),
    path("", include("apps.audit.urls")),
    path("", include("apps.analytics.urls")),
    path("", include("apps.fragments.urls")),
    path("accounts/", include("allauth.urls")),
]
