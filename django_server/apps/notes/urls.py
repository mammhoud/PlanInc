from django.urls import path

from . import views

urlpatterns = [
    path("api/notes", views.collection, name="notes-collection"),
    path("api/notes/<int:note_id>", views.detail, name="notes-detail"),
]
