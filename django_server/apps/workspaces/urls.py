from django.urls import path

from . import views

urlpatterns = [
    path("api/workspaces", views.collection, name="workspace-collection"),
    path("api/workspaces/<int:workspace_id>", views.detail, name="workspace-detail"),
]

