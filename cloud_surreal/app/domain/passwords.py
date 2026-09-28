"""Password hashing, byte-compatible with ``server/lib/password.ts``.

That module derives keys with PBKDF2-HMAC-SHA512, 1000 iterations, 64-byte key
length, and a 16-byte random hex salt, storing ``pbkdf2:<salt>:<hex>``. Records
hashed by the TS server must verify here and vice versa, so the parameters are
pinned rather than configurable.
"""

from __future__ import annotations

import hashlib
import hmac
import os

PREFIX = "pbkdf2"
DIGEST = "sha512"
ITERATIONS = 1000
KEY_LENGTH = 64
SALT_BYTES = 16


def _derive(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        DIGEST, password.encode("utf-8"), salt.encode("utf-8"), ITERATIONS, KEY_LENGTH
    ).hex()


def hash_password(password: str) -> str:
    salt = os.urandom(SALT_BYTES).hex()
    return f"{PREFIX}:{salt}:{_derive(password, salt)}"


def verify_password(input_password: str, hashed_password: str) -> bool:
    parts = (hashed_password or "").split(":")
    if len(parts) != 3 or parts[0] != PREFIX:
        return False
    _, salt, expected = parts
    if not salt or not expected:
        return False
    return hmac.compare_digest(_derive(input_password, salt), expected)
