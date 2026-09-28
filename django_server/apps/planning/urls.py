from django.urls import path

from . import views

urlpatterns = [
    path("api/planning/categories", views.categories, name="planning-categories"),
    path("api/planning/tasks", views.tasks, name="planning-tasks"),
    path(
        "api/planning/tasks/<int:task_id>",
        views.task_detail,
        name="planning-task-detail",
    ),
    path(
        "api/planning/tasks/<int:task_id>/links",
        views.task_links,
        name="planning-task-links",
    ),
    path(
        "api/planning/links/<int:link_id>",
        views.task_link_detail,
        name="planning-task-link-detail",
    ),
    path("api/planning/tickets", views.tickets, name="planning-tickets"),
    path(
        "api/planning/tickets/<int:ticket_id>",
        views.ticket_detail,
        name="planning-ticket-detail",
    ),
    path("api/planning/study", views.study, name="planning-study"),
    path(
        "api/planning/study/<int:item_id>",
        views.study_detail,
        name="planning-study-detail",
    ),
    path(
        "api/planning/study/<int:item_id>/review",
        views.study_review,
        name="planning-study-review",
    ),
]
