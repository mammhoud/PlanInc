from django.urls import path

from . import views

urlpatterns = [
    path("api/audit", views.audit_events, name="audit-events"),
]
