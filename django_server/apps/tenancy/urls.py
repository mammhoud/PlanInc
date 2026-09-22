from django.urls import path

from .views import context

urlpatterns = [
    path("api/tenancy/context", context, name="tenant-context"),
]
