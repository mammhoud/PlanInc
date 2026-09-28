"""Account use cases: profile, preferences, and personal access tokens.

These are transport-agnostic; ``api.adapters`` renders their ``ServiceError``
failures for the HTTP surfaces. Access tokens are stored as SHA-256 hashes and
the plaintext is returned only once, from :func:`issue_access_token`.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from domain.errors import AuthenticationError, ValidationError

from .models import AccessToken, UserPreference, UserProfile

PROFILE_FIELDS = ("display_name", "locale", "timezone", "avatar_url")


def _require_user(user):
    if user is None or not getattr(user, "is_authenticated", False) or user.pk is None:
        raise AuthenticationError("An authenticated user is required.")
    return user


def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


def hash_access_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@transaction.atomic
def ensure_profile(user) -> UserProfile:
    _require_user(user)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def update_profile(
    user,
    *,
    display_name: str | None = None,
    locale: str | None = None,
    timezone: str | None = None,
    avatar_url: str | None = None,
) -> UserProfile:
    profile = ensure_profile(user)
    changed = False
    for field, value in {
        "display_name": display_name,
        "locale": locale,
        "timezone": timezone,
        "avatar_url": avatar_url,
    }.items():
        if value is not None:
            setattr(profile, field, value)
            changed = True
    if changed:
        profile.save(update_fields=[*PROFILE_FIELDS, "updated_at"])
    return profile


def get_preference(user, key: str, default=None):
    _require_user(user)
    row = UserPreference.objects.filter(user=user, key=key).first()
    return row.value if row is not None else default


def preferences_for(user) -> dict:
    _require_user(user)
    return {row.key: row.value for row in UserPreference.objects.filter(user=user)}


@transaction.atomic
def set_preference(user, key: str, value):
    _require_user(user)
    key = (key or "").strip()
    if not key:
        raise ValidationError("A preference key is required.")
    row, _ = UserPreference.objects.update_or_create(
        user=user,
        key=key,
        defaults={"value": value},
    )
    return row


@transaction.atomic
def set_preferences(user, values: dict) -> dict:
    if not isinstance(values, dict):
        raise ValidationError("Preferences must be an object.")
    for key, value in values.items():
        set_preference(user, key, value)
    return preferences_for(user)


@transaction.atomic
def issue_access_token(
    user,
    *,
    name: str,
    scopes: list | None = None,
    ttl_days: int | None = None,
):
    """Create a token, returning ``(token, plaintext)``.

    The plaintext is the only time the secret is available; only its hash is
    persisted.
    """
    _require_user(user)
    name = (name or "").strip()
    if not name:
        raise ValidationError("A token name is required.")
    if scopes is not None and not isinstance(scopes, list):
        raise ValidationError("scopes must be a list.")
    expires_at = None
    if ttl_days is not None:
        if isinstance(ttl_days, bool) or not isinstance(ttl_days, int) or ttl_days < 1:
            raise ValidationError("ttl_days must be a positive integer.")
        expires_at = timezone.now() + timedelta(days=ttl_days)
    raw = generate_access_token()
    token = AccessToken.objects.create(
        user=user,
        name=name,
        token_prefix=raw[:8],
        token_hash=hash_access_token(raw),
        scopes=list(scopes or []),
        expires_at=expires_at,
    )
    return token, raw


def authenticate_access_token(raw: str):
    """Return the active token for a plaintext secret, or ``None``."""
    raw = (raw or "").strip()
    if not raw:
        return None
    token = AccessToken.objects.filter(token_hash=hash_access_token(raw)).first()
    if token is None or not token.is_active:
        return None
    token.last_used_at = timezone.now()
    token.save(update_fields=["last_used_at"])
    return token


@transaction.atomic
def revoke_access_token(user, token_id) -> bool:
    _require_user(user)
    token = AccessToken.objects.filter(pk=token_id, user=user).first()
    if token is None:
        return False
    if token.revoked_at is None:
        token.revoked_at = timezone.now()
        token.save(update_fields=["revoked_at"])
    return True
