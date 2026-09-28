"""Preference procedures (slice S5).

``config.*``, ``analytics.*``, ``notifications.*``, ``branding.*``, ``fonts.*``.
"""

from __future__ import annotations

from ..auth.jwt import TokenClaims
from ..domain import policies
from ..domain.preferences import (
    AnalyticsService,
    BrandingService,
    ConfigService,
    FontService,
    NotificationService,
)
from ..transport.trpc import Router


def _optional_account_id(claims: TokenClaims | None) -> int:
    if claims is None:
        return 0
    return policies.current_account_id(claims)


def register_preference_routers(
    router: Router,
    config: ConfigService,
    analytics: AnalyticsService,
    notifications: NotificationService,
    branding: BrandingService,
    fonts: FontService,
) -> None:
    # -- config -----------------------------------------------------------

    @router.procedure("config.list")
    async def list_config(_input: dict, claims: TokenClaims | None) -> list[dict]:
        return await config.list(_optional_account_id(claims))

    @router.procedure("config.update")
    async def update_config(input_: dict, claims: TokenClaims | None) -> dict:
        account_id = policies.current_account_id(claims)
        return await config.update(
            account_id, str(input_.get("key") or ""), input_.get("value")
        )

    @router.procedure("config.setPluginConfig")
    async def set_plugin_config(input_: dict, claims: TokenClaims | None) -> dict:
        account_id = policies.current_account_id(claims)
        return await config.set_plugin_config(
            account_id, str(input_.get("pluginId") or ""), input_.get("value")
        )

    @router.procedure("config.getPluginConfig")
    async def get_plugin_config(input_: dict, claims: TokenClaims | None) -> dict:
        account_id = policies.current_account_id(claims)
        value = await config.get_plugin_config(
            account_id, str(input_.get("pluginId") or "")
        )
        return {"value": value}

    @router.procedure("config.ai")
    async def ai_config(_input: dict, _claims: TokenClaims | None) -> dict:
        return await config.ai_config()

    # -- analytics --------------------------------------------------------

    @router.procedure("analytics.dailyNoteCount")
    async def daily_note_count(_input: dict, claims: TokenClaims | None) -> list[dict]:
        return await analytics.daily_note_count(policies.current_account_id(claims))

    @router.procedure("analytics.monthlyStats")
    async def monthly_stats(input_: dict, claims: TokenClaims | None) -> dict:
        return await analytics.monthly_stats(
            policies.current_account_id(claims), input_.get("month")
        )

    @router.procedure("analytics.insights")
    async def insights(input_: dict, claims: TokenClaims | None) -> dict:
        return await analytics.insights(
            policies.current_account_id(claims), input_.get("month")
        )

    # -- notifications ----------------------------------------------------

    @router.procedure("notifications.list")
    async def list_notifications(
        _input: dict, claims: TokenClaims | None
    ) -> list[dict]:
        return await notifications.list_notifications(
            policies.current_account_id(claims)
        )

    @router.procedure("notifications.create")
    async def create_notification(input_: dict, claims: TokenClaims | None) -> dict:
        return await notifications.create_notification(
            policies.current_account_id(claims), input_
        )

    @router.procedure("notifications.markAsRead")
    async def mark_as_read(input_: dict, claims: TokenClaims | None) -> dict:
        return await notifications.mark_as_read(
            policies.current_account_id(claims), input_.get("id")
        )

    @router.procedure("notifications.unreadCount")
    async def unread_count(_input: dict, claims: TokenClaims | None) -> int:
        return await notifications.unread_count(policies.current_account_id(claims))

    @router.procedure("notifications.delete")
    async def delete_notification(input_: dict, claims: TokenClaims | None) -> dict:
        await notifications.delete(
            input_.get("id"), policies.current_account_id(claims)
        )
        return {"success": True}

    # -- branding ---------------------------------------------------------

    @router.procedure("branding.get")
    async def get_branding(_input: dict, claims: TokenClaims | None) -> dict:
        return await branding.get(policies.current_account_id(claims))

    @router.procedure("branding.setLogo")
    async def set_logo(input_: dict, claims: TokenClaims | None) -> dict:
        account_id = policies.current_account_id(claims)
        return await branding.set_logo(account_id, str(input_.get("url") or ""))

    # -- fonts ------------------------------------------------------------

    @router.procedure("fonts.list")
    async def list_fonts(_input: dict, _claims: TokenClaims | None) -> list[dict]:
        return await fonts.list_fonts()

    @router.procedure("fonts.getByName")
    async def get_font_by_name(
        input_: dict, _claims: TokenClaims | None
    ) -> dict | None:
        return await fonts.get_by_name(str(input_.get("name") or ""))
