"""Credential-at-rest port.

Provider, webhook, and SSO secrets are encrypted here and decrypted only inside
the owning service/port boundary. Nothing outside a service may call
:func:`decrypt_secret`, and no serializer ever receives a plaintext secret.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

from domain.errors import ConfigurationError, ValidationError


def _key_setting() -> str:
    return getattr(settings, "PLANINC_ENCRYPTION_KEY", "") or getattr(
        settings, "PLANINC_AI_ENCRYPTION_KEY", ""
    )


def _fernet() -> Fernet:
    key = _key_setting()
    if not key:
        raise ConfigurationError(
            "PLANINC_ENCRYPTION_KEY is required to store credentials."
        )
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError):
        # Derive a stable key from a passphrase if operators set one instead
        # of a Fernet key.
        digest = hashlib.sha256(key.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        raise ValidationError("A credential value is required.")
    return _fernet().encrypt(raw.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    if not token:
        raise ValidationError("No stored credential is available.")
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as err:
        raise ConfigurationError("The stored credential cannot be decrypted.") from err
