"""Application services bound to one ``SurrealClient``."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .config import Settings
from .db.surreal import SurrealClient
from .domain.collections import CommentService, TagService
from .domain.files import AttachmentService, FileStorage
from .domain.notes import NoteService
from .domain.planning import (
    PlanningCategoryService,
    PlanningFieldService,
    PlanningLinkService,
    StudyService,
    TaskService,
    TicketService,
)
from .domain.preferences import (
    AnalyticsService,
    BrandingService,
    ConfigService,
    FontService,
    NotificationService,
)
from .domain.public import PublicService
from .domain.users import UserService


@dataclass
class AppServices:
    users: UserService
    notes: NoteService
    tags: TagService
    comments: CommentService
    attachments: AttachmentService
    tickets: TicketService
    study: StudyService
    planning_links: PlanningLinkService
    planning_fields: PlanningFieldService
    planning_categories: PlanningCategoryService
    tasks: TaskService
    config: ConfigService
    analytics: AnalyticsService
    notifications: NotificationService
    branding: BrandingService
    fonts: FontService
    public: PublicService

    @classmethod
    def from_client(
        cls,
        client: Any,
        jwt_secret: str,
        upload_dir: str = "./.planinc/files",
    ) -> AppServices:
        config = ConfigService(client)
        return cls(
            users=UserService(client, jwt_secret),
            notes=NoteService(client),
            tags=TagService(client),
            comments=CommentService(client),
            attachments=AttachmentService(client, FileStorage(upload_dir)),
            tickets=TicketService(client),
            study=StudyService(client),
            planning_links=PlanningLinkService(client),
            planning_fields=PlanningFieldService(client),
            planning_categories=PlanningCategoryService(client),
            tasks=TaskService(client),
            config=config,
            analytics=AnalyticsService(client),
            notifications=NotificationService(client),
            branding=BrandingService(config),
            fonts=FontService(client),
            public=PublicService(client, config),
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> AppServices:
        return cls.from_client(
            SurrealClient(settings), settings.jwt_secret, settings.upload_dir
        )
