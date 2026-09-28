from django.urls import path

from . import views

urlpatterns = [
    path("api/account/profile", views.profile, name="account-profile"),
    path("api/account/tokens", views.tokens, name="account-tokens"),
    path(
        "api/account/tokens/<int:token_id>",
        views.token_detail,
        name="account-token-detail",
    ),
    path(
        "api/account/preferences",
        views.preferences,
        name="account-preferences",
    ),
]
