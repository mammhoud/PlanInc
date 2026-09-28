from django.urls import path

from . import views

urlpatterns = [
    path("api/notes", views.collection, name="notes-collection"),
    path("api/notes/<int:note_id>", views.detail, name="notes-detail"),
    path("api/notes/<int:note_id>/history", views.history, name="note-history"),
    path("api/notes/<int:note_id>/versions", views.versions, name="note-versions"),
    path(
        "api/notes/<int:note_id>/versions/<int:version_id>/restore",
        views.restore,
        name="note-version-restore",
    ),
    path("api/notes/<int:note_id>/comments", views.comments, name="note-comments"),
    path(
        "api/notes/<int:note_id>/comments/<int:comment_id>",
        views.comment_detail,
        name="note-comment-detail",
    ),
    path("api/notes/<int:note_id>/tags", views.note_tags, name="note-tags"),
    path(
        "api/notes/<int:note_id>/tags/<int:tag_id>",
        views.note_tag_detail,
        name="note-tag-detail",
    ),
    path("api/notes/<int:note_id>/links", views.links, name="note-links"),
    path(
        "api/notes/<int:note_id>/links/<int:link_id>",
        views.link_detail,
        name="note-link-detail",
    ),
    path(
        "api/notes/<int:note_id>/backlinks",
        views.backlinks,
        name="note-backlinks",
    ),
    path("api/tags", views.tags, name="tags-collection"),
]
