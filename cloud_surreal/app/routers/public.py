"""``public.*`` procedures (slice S5).

Unauthenticated, matching ``server/routerTrpc/public.ts``. The frontend calls
``public.siteInfo`` on boot to render the site name/avatar and
``public.oauthProviders`` to decide which social buttons to show, so these must
work without a token.
"""

from __future__ import annotations

from typing import Any

from ..auth.jwt import TokenClaims
from ..domain.public import PublicService
from ..transport.trpc import Router


def register_public_routers(router: Router, service: PublicService) -> None:
    @router.procedure("public.serverVersion")
    async def server_version(_input: dict, _claims: TokenClaims | None) -> str:
        return await service.server_version()

    @router.procedure("public.latestClientVersion")
    async def latest_client_version(_input: dict, _claims: TokenClaims | None) -> str:
        return await service.latest_client_version()

    @router.procedure("public.latestServerVersion")
    async def latest_server_version(_input: dict, _claims: TokenClaims | None) -> str:
        return await service.latest_server_version()

    @router.procedure("public.oauthProviders")
    async def oauth_providers(_input: dict, _claims: TokenClaims | None) -> list[dict]:
        return await service.oauth_providers()

    @router.procedure("public.siteInfo")
    async def site_info(input_: dict, _claims: TokenClaims | None) -> dict:
        requested = input_.get("id")
        return await service.site_info(None if requested is None else requested)

    @router.procedure("public.hubList")
    async def hub_list(_input: dict, _claims: TokenClaims | None) -> list[dict]:
        return await service.hub_list()

    @router.procedure("public.hubSiteList")
    async def hub_site_list(input_: dict, _claims: TokenClaims | None) -> list[dict]:
        return await service.hub_site_list(bool(input_.get("refresh")))

    @router.procedure("public.linkPreview")
    async def link_preview(input_: dict, _claims: TokenClaims | None) -> dict:
        return await service.link_preview(str(input_.get("url") or ""))

    @router.procedure("public.testHttpProxy")
    async def test_http_proxy(input_: dict, _claims: TokenClaims | None) -> dict:
        return await service.test_http_proxy(input_.get("url"))


def register_font_data_router(router: Router, service: Any) -> None:
    @router.procedure("fonts.getFontData")
    async def get_font_data(input_: dict, _claims: TokenClaims | None) -> dict:
        return await service.get_font_data(str(input_.get("name") or ""))
