"""Robyn application entrypoint."""

from __future__ import annotations

from robyn import Robyn

from .config import Settings
from .domain.superuser import bootstrap_superuser
from .routers.attachment import register_attachment_router
from .routers.collection import register_collection_routers
from .routers.note import register_note_router
from .routers.planning import register_planning_routers
from .routers.preferences import register_preference_routers
from .routers.public import register_font_data_router, register_public_routers
from .routers.user import register_user_router
from .routes.auth import register_auth_routes
from .routes.file import register_file_routes
from .services import AppServices
from .transport.health import health
from .transport.trpc import Router, handle_trpc


def build_trpc_router(services: AppServices | None = None) -> Router:
    """Assemble the tRPC procedures.

    A stub ``ping`` is always present so liveness through the transport can be
    checked without touching the datastore.
    """
    router = Router()

    @router.procedure("ping")
    async def ping(_input: dict, _claims: object) -> dict:
        return {"pong": True}

    if services is not None:
        register_user_router(router, services.users)
        register_note_router(router, services.notes)
        register_collection_routers(router, services.tags, services.comments)
        register_attachment_router(router, services.attachments)
        register_planning_routers(
            router,
            services.tickets,
            services.study,
            services.planning_links,
            services.planning_fields,
            services.planning_categories,
            services.tasks,
        )
        register_preference_routers(
            router,
            services.config,
            services.analytics,
            services.notifications,
            services.branding,
            services.fonts,
        )
        register_public_routers(router, services.public)
        register_font_data_router(router, services.fonts)

    return router


def create_app(
    settings: Settings | None = None,
    router: Router | None = None,
    services: AppServices | None = None,
    bootstrap: bool = False,
) -> Robyn:
    """Assemble the application.

    ``bootstrap`` is opt-in so tests never create an admin account as a side
    effect; only :func:`main` turns it on.
    """
    resolved = settings or Settings.from_env()
    if services is None and router is None:
        services = AppServices.from_settings(resolved)
    procedures = router or build_trpc_router(services)
    app = Robyn(__file__)

    @app.get("/health")
    async def health_route(request):
        return await health(request)

    @app.post("/api/trpc/:path")
    async def trpc_post(request):
        return await handle_trpc(request, procedures, resolved)

    @app.get("/api/trpc/:path")
    async def trpc_get(request):
        return await handle_trpc(request, procedures, resolved)

    if services is not None:
        register_auth_routes(app, services.users, resolved)
        register_file_routes(app, services, resolved)

    if services is not None and bootstrap:
        # Runs inside the server's own loop, so the lazy embedded connection is
        # created on the loop that will serve requests.
        async def _bootstrap() -> None:
            result = await bootstrap_superuser(services.users, resolved, log=print)
            if result.action == "failed":
                print(f"[superuser] bootstrap failed: {result.reason}")

        app.startup_handler(_bootstrap)

    return app


def main() -> None:
    settings = Settings.from_env()
    create_app(settings, bootstrap=True).start(port=settings.port)


if __name__ == "__main__":
    main()
