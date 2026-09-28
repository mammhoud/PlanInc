from django.urls import path

from . import views

urlpatterns = [
    path("api/knowledge/resources", views.resources, name="knowledge-resources"),
    path(
        "api/knowledge/resources/<int:resource_id>",
        views.resource_detail,
        name="knowledge-resource-detail",
    ),
    path(
        "api/knowledge/resources/<int:resource_id>/relations",
        views.relations,
        name="knowledge-relations",
    ),
    path(
        "api/knowledge/relations/<int:relation_id>",
        views.relation_detail,
        name="knowledge-relation-detail",
    ),
    path("api/knowledge/attachments", views.attachments, name="knowledge-attachments"),
    path(
        "api/knowledge/attachments/<int:attachment_id>",
        views.attachment_detail,
        name="knowledge-attachment-detail",
    ),
    path(
        "api/knowledge/attachments/<int:attachment_id>/previews",
        views.previews,
        name="knowledge-attachment-previews",
    ),
    path(
        "api/knowledge/attachments/<int:attachment_id>/extraction",
        views.extraction,
        name="knowledge-attachment-extraction",
    ),
]
