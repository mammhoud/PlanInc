from django.urls import include, path

urlpatterns = [
    path("", include("apps.health.urls")),
    path("", include("apps.tenancy.urls")),
    path("", include("apps.workspaces.urls")),
    path("", include("apps.notes.urls")),
    path("accounts/", include("allauth.urls")),
]
