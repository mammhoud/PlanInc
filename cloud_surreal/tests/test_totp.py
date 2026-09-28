import time

from app.domain import totp

# RFC 6238 test secret (ASCII "12345678901234567890") in base32.
RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def test_matches_rfc6238_vectors_at_six_digits():
    assert totp.generate_at(RFC_SECRET, 59) == "287082"
    assert totp.generate_at(RFC_SECRET, 1111111109) == "081804"


def test_generate_secret_is_32_char_base32():
    secret = totp.generate_secret()
    assert len(secret) == 32
    assert secret == secret.upper()
    assert "=" not in secret
    # Decodable, i.e. a valid base32 secret.
    totp._decode_secret(secret)


def test_verify_accepts_current_code_and_rejects_wrong():
    secret = totp.generate_secret()
    assert totp.verify(totp.generate(secret), secret) is True
    assert totp.verify("000000", secret) is False


def test_verify_honours_the_drift_window():
    secret = totp.generate_secret()
    previous = totp.generate_at(secret, time.time() - totp.PERIOD)
    assert totp.verify(previous, secret, window=0) is False
    assert totp.verify(previous, secret, window=1) is True


def test_verify_fails_closed_on_malformed_secret():
    assert totp.verify("123456", "not!base32") is False
    assert totp.verify("", "") is False


def test_key_uri_has_the_expected_shape():
    uri = totp.key_uri("alice", "ABCDEF")
    assert uri.startswith("otpauth://totp/PlanInc%3Aalice?")
    assert "secret=ABCDEF" in uri
    assert "issuer=PlanInc" in uri
