import json

import jwt
from django.contrib.auth import get_user_model
from django.views.decorators.http import require_http_methods

from api.adapters import service_view
from api.envelopes import failure, success
from apps.tenancy.jwt import verify_session_token
from domain.errors import ErrorCode

from . import services
from .models import AccessToken
from .services import PROFILE_FIELDS


def _payload(request):
    try:
        value = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _serialize_profile(profile):
    return {
        "display_name": profile.display_name,
        "locale": profile.locale,
        "timezone": profile.timezone,
        "avatar_url": profile.avatar_url,
    }


def _serialize_token(token):
    return {
        "id": token.id,
        "name": token.name,
        "prefix": token.token_prefix,
        "scopes": token.scopes,
        "created_at": token.created_at.isoformat(),
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "revoked_at": token.revoked_at.isoformat() if token.revoked_at else None,
        "last_used_at": (
            token.last_used_at.isoformat() if token.last_used_at else None
        ),
    }


def _bearer_user(request):
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.startswith("Bearer "):
        return None
    raw = header[len("Bearer ") :].strip()
    if not raw:
        return None
    try:
        claims = verify_session_token(raw)
        return (
            get_user_model()
            .objects.filter(pk=claims.get("sub"), is_active=True)
            .first()
        )
    except (jwt.InvalidTokenError, ValueError, KeyError):
        return None


def _require_user(request):
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return None, user
    user = _bearer_user(request)
    if user is not None:
        return None, user
    return failure(ErrorCode.UNAUTHENTICATED, status=401), None


@require_http_methods(["GET", "PATCH"])
@service_view
def profile(request):
    error, user = _require_user(request)
    if error:
        return error
    if request.method == "GET":
        return success(_serialize_profile(services.ensure_profile(user)))

    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD, status=400)
    unknown = set(payload) - set(PROFILE_FIELDS)
    if unknown:
        return failure(
            ErrorCode.INVALID_PAYLOAD, "Unknown profile fields.", status=400
        )
    updated = services.update_profile(user, **payload)
    return success(_serialize_profile(updated))


@require_http_methods(["GET", "POST"])
@service_view
def tokens(request):
    error, user = _require_user(request)
    if error:
        return error
    if request.method == "GET":
        rows = AccessToken.objects.filter(user=user)
        return success([_serialize_token(row) for row in rows])

    payload = _payload(request)
    if payload is None or not isinstance(payload.get("name"), str):
        return failure(
            ErrorCode.INVALID_PAYLOAD, "name must be a string.", status=400
        )
    token, raw = services.issue_access_token(
        user,
        name=payload["name"],
        scopes=payload.get("scopes"),
        ttl_days=payload.get("ttl_days"),
    )
    data = _serialize_token(token)
    data["token"] = raw  # returned exactly once
    return success(data, status=201)


@require_http_methods(["DELETE"])
@service_view
def token_detail(request, token_id):
    error, user = _require_user(request)
    if error:
        return error
    if not services.revoke_access_token(user, token_id):
        return failure(ErrorCode.NOT_FOUND, status=404)
    return success(None)


@require_http_methods(["GET", "PUT"])
@service_view
def preferences(request):
    error, user = _require_user(request)
    if error:
        return error
    if request.method == "GET":
        return success(services.preferences_for(user))
    payload = _payload(request)
    if payload is None:
        return failure(ErrorCode.INVALID_PAYLOAD, status=400)
    return success(services.set_preferences(user, payload))
