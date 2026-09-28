from django.urls import path

from . import views

urlpatterns = [
    path("api/analytics/summary", views.summary, name="analytics-summary"),
    path("api/analytics/metrics", views.metrics, name="analytics-metrics"),
]
