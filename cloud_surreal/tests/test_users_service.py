import jwt
import pytest

from app.domain.errors import DomainError
from app.domain.passwords import verify_password
from app.domain.users import UserService, normalize_id
from tests.fakes import FakeDb

SECRET = "x" * 32


def _service() -> tuple[UserService, FakeDb]:
    db = FakeDb()
    return UserService(db, SECRET), db


def test_normalize_id_handles_record_ids():
    assert normalize_id("accounts:7") == 7
    assert normalize_id(7) == 7
    assert normalize_id(None) is None
    assert normalize_id("nope") is None
    assert normalize_id(True) is None


def test_create_allocates_sequential_numeric_ids():
    import asyncio

    service, _ = _service()

    async def run():
        first = await service.create(name="a", password="p1")
        second = await service.create(name="b", password="p2")
        return first, second

    first, second = asyncio.run(run())
    assert first["id"] == 1
    assert second["id"] == 2
    assert first["role"] == "user"


def test_login_issues_and_stores_an_api_token():
    import asyncio

    service, _ = _service()

    async def run():
        await service.create(name="alice", password="s3cret", role="superadmin")
        return await service.login("alice", "s3cret")

    result = asyncio.run(run())
    assert result["name"] == "alice"
    claims = jwt.decode(result["token"], SECRET, algorithms=["HS256"])
    assert claims["sub"] == "1"
    assert claims["role"] == "superadmin"

    async def stored():
        return await service.by_id(1)

    assert asyncio.run(stored())["apiToken"] == result["token"]


def test_authenticate_rejects_bad_password_and_unknown_user():
    import asyncio

    service, _ = _service()

    async def run():
        await service.create(name="bob", password="right")
        with pytest.raises(DomainError) as wrong:
            await service.authenticate("bob", "wrong")
        with pytest.raises(DomainError) as missing:
            await service.authenticate("nobody", "x")
        return wrong, missing

    wrong, missing = asyncio.run(run())
    assert wrong.value.code == "UNAUTHORIZED"
    assert missing.value.code == "NOT_FOUND"


def test_can_register_is_true_only_for_first_user_or_when_allowed():
    import asyncio

    service, db = _service()

    async def run():
        assert await service.can_register() is True
        await service.create(name="first", password="p")
        assert await service.can_register() is False
        db.seed("config", 1, {"key": "isAllowRegister", "config": {"value": True}})
        assert await service.can_register() is True

    asyncio.run(run())


def test_login_requires_two_factor_when_enabled():
    import asyncio

    service, db = _service()
    db.seed("config", 1, {"key": "twoFactorEnabled", "config": {"value": True}})

    async def run():
        await service.create(name="carol", password="pw")
        with pytest.raises(DomainError) as err:
            await service.login("carol", "pw")
        return err

    err = asyncio.run(run())
    assert err.value.code == "PRECONDITION_FAILED"
    assert err.value.user_id == 1


def test_find_or_create_oauth_user_creates_then_reuses():
    import asyncio

    service, _ = _service()
    profile = {
        "providerId": "github",
        "externalId": "7",
        "username": "octo",
        "name": "Octo",
        "image": "a.png",
        "email": None,
    }

    async def run():
        first = await service.find_or_create_oauth_user(profile)
        second = await service.find_or_create_oauth_user({**profile, "image": "b.png"})
        return first, second

    first, second = asyncio.run(run())
    assert first["id"] == second["id"]
    assert first["loginType"] == "oauth"
    assert "password" not in first
    assert second["image"] == "b.png"


def test_stored_password_is_a_verifiable_hash_not_the_plaintext():
    import asyncio

    service, _ = _service()

    async def run():
        return await service.create(name="d", password="pw")

    created = asyncio.run(run())
    assert created["password"].startswith("pbkdf2:")
    assert created["password"] != "pw"
    assert verify_password("pw", created["password"]) is True
