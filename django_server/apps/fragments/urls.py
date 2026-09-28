from django.urls import path

from . import views

urlpatterns = [
    path("fragments/notes", views.notes_table, name="fragment-notes-table"),
    path(
        "fragments/notes/<int:note_id>/comments",
        views.note_comments,
        name="fragment-note-comments",
    ),
]
