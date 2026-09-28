"""RFC 6238 TOTP, matching ``otplib``'s defaults.

``server/lib/helper.ts`` uses otplib's ``authenticator`` with no custom options,
so the parameters are pinned to its defaults: SHA-1, 6 digits, 30-second period,
and a 20-byte base32 secret. Implemented with the standard library so no TOTP
dependency is needed.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import struct
import time
from urllib.parse import quote

ALGORITHM = "SHA1"
DIGITS = 6
PERIOD = 30
SECRET_BYTES = 20
ISSUER = "PlanInc"


def generate_secret(length: int = SECRET_BYTES) -> str:
    """Return a base32 (unpadded, uppercase) secret.

    Matches ``authenticator.generateSecret``.
    """
    return base64.b32encode(os.urandom(length)).decode("ascii").rstrip("=")


def key_uri(username: str, secret: str, issuer: str = ISSUER) -> str:
    """Build the ``otpauth://`` URI ``authenticator.keyuri`` returns."""
    label = quote(f"{issuer}:{username}")
    return (
        f"otpauth://totp/{label}?secret={secret}"
        f"&issuer={quote(issuer)}&algorithm={ALGORITHM}&digits={DIGITS}&period={PERIOD}"
    )


def _decode_secret(secret: str) -> bytes:
    padded = secret.strip().upper()
    padded += "=" * (-len(padded) % 8)
    return base64.b32decode(padded, casefold=True)


def _hotp(key: bytes, counter: int) -> str:
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = (
        (digest[offset] & 0x7F) << 24
        | digest[offset + 1] << 16
        | digest[offset + 2] << 8
        | digest[offset + 3]
    )
    return str(binary % (10**DIGITS)).zfill(DIGITS)


def generate_at(secret: str, timestamp: float) -> str:
    return _hotp(_decode_secret(secret), int(timestamp // PERIOD))


def generate(secret: str) -> str:
    return generate_at(secret, time.time())


def verify(token: str, secret: str, window: int = 0) -> bool:
    """Verify ``token`` within ``window`` periods of drift (otplib default 0)."""
    if not token or not secret:
        return False
    counter = int(time.time() // PERIOD)
    try:
        key = _decode_secret(secret)
    except Exception:  # noqa: BLE001 - a malformed secret must fail closed
        return False
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_hotp(key, counter + offset), str(token)):
            return True
    return False
