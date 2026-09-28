import hashlib

from app.domain.passwords import hash_password, verify_password


def test_hash_uses_the_ts_format():
    hashed = hash_password("hunter2")
    prefix, salt, digest = hashed.split(":")
    assert prefix == "pbkdf2"
    assert len(salt) == 32  # 16 random bytes, hex encoded
    assert len(digest) == 128  # 64-byte key, hex encoded


def test_roundtrip_and_rejection():
    hashed = hash_password("hunter2")
    assert verify_password("hunter2", hashed) is True
    assert verify_password("hunter3", hashed) is False


def test_verifies_an_independently_computed_pbkdf2_hash():
    # Same parameters server/lib/password.ts uses: PBKDF2-HMAC-SHA512,
    # 1000 iterations, 64-byte key, 16-byte hex salt.
    salt = "00112233445566778899aabbccddeeff"
    digest = hashlib.pbkdf2_hmac(
        "sha512", b"correct horse", salt.encode(), 1000, 64
    ).hex()
    assert verify_password("correct horse", f"pbkdf2:{salt}:{digest}") is True


def test_rejects_malformed_hashes():
    assert verify_password("x", "") is False
    assert verify_password("x", "plain") is False
    assert verify_password("x", "bcrypt:deadbeef:ff") is False
    assert verify_password("x", "pbkdf2::") is False
