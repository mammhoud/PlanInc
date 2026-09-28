from django.urls import path

from . import views

urlpatterns = [
    path("api/search", views.search, name="search"),
    path("api/search/reindex", views.reindex, name="search-reindex"),
]
