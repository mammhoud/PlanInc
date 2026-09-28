from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self):
        from django.contrib.auth import get_user_model
        from django.db.models.signals import post_save

        from .signals import create_user_profile

        post_save.connect(
            create_user_profile,
            sender=get_user_model(),
            dispatch_uid="accounts.create_user_profile",
        )
