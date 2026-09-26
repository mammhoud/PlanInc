from django.urls import path

from .views import context, session_token

urlpatterns = [
    path("api/tenancy/context", context, name="tenant-context"),
    path("api/auth/token", session_token, name="session-token"),
]
