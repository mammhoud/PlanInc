import asyncio
import dataclasses
import stat

import pytest

from app.config import Settings
from app.domain.passwords import verify_password
from app.domain.superuser import (
    MIN_PASSWORD_LENGTH,
    BootstrapResult,
    bootstrap_superuser,
    generate_shell_safe_password,
    resolve_credentials_path,
    write_credentials,
)
from app.domain.users import UserService
from tests.fakes import FakeDb

SECRET = "auth-secret-that-is-long-enough!!"
LONG_PASSWORD = "a-sufficiently-long-password"


def _settings(tmp_path, **overrides) -> Settings:
    base = Settings(
        db_file=str(tmp_path / "data" / "planinc.db"),
        db_ns="planinc",
        db_name="planinc",
        jwt_secret=SECRET,
        port=1111,
        data_dir=str(tmp_path / "data"),
    )
    return dataclasses.replace(base, **overrides)


@pytest.fixture()
def db() -> FakeDb:
    return FakeDb()


def _run(service, settings, messages=None):
    logger = messages.append if messages is not None else None
    return asyncio.run(bootstrap_superuser(service, settings, log=logger))


# -- pure helpers ---------------------------------------------------------


def test_generated_password_is_shell_safe_and_uniform():
    password = generate_shell_safe_password(32)
    assert len(password) == 32
    assert password.isalnum()
    assert all(ch.isascii() for ch in password)
    assert len({generate_shell_safe_password(32) for _ in range(20)}) == 20


def test_credentials_path_sits_beside_the_database_file(tmp_path):
    settings = _settings(tmp_path)
    assert resolve_credentials_path(settings.db_file) == (
        tmp_path / "data" / "superuser.txt"
    )


def test_write_credentials_creates_a_0600_file(tmp_path):
    path = tmp_path / "nested" / "superuser.txt"
    assert write_credentials(path, "admin", "s3cret", generated=False) is True
    assert path.exists()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    body = path.read_text()
    assert "username: admin" in body
    assert "password: s3cret" in body


def test_write_credentials_reports_failure_instead_of_raising(tmp_path):
    # A directory where the file should be makes the write impossible.
    blocked = tmp_path / "superuser.txt"
    blocked.mkdir()
    assert write_credentials(blocked, "admin", "s3cret", generated=True) is False


# -- branch 1: env credentials -------------------------------------------


def test_env_credentials_create_the_superadmin_and_write_the_note(tmp_path, db):
    service = UserService(db, SECRET)
    settings = _settings(
        tmp_path, superuser_name="root", superuser_password=LONG_PASSWORD
    )
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "created"
    assert result.username == "root"
    assert result.account_id == 1
    assert result.wrote_credentials is True
    assert any("Bootstrapped superuser" in message for message in messages)

    account = asyncio.run(service.by_name("root"))
    assert account["role"] == "superadmin"
    assert verify_password(LONG_PASSWORD, account["password"])

    note = tmp_path / "data" / "superuser.txt"
    assert note.exists()
    assert "username: root" in note.read_text()


def test_env_credentials_update_an_existing_account_and_preserve_fields(
    tmp_path, db
):
    service = UserService(db, SECRET)
    db.seed(
        "accounts",
        1,
        {
            "name": "root",
            "nickname": "Old Nick",
            "password": "old-hash",
            "role": "user",
            "image": "avatar.png",
            "apiToken": "existing-token",
            "note": 7,
            "description": "kept",
            "linkAccountId": 3,
        },
    )
    db.seed("config", 1, {"key": "k", "config": {"value": 1}})
    settings = _settings(
        tmp_path, superuser_name="root", superuser_password="a-new-long-secret-1"
    )
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "updated"
    assert result.account_id == 1
    assert any("Updated superuser" in message for message in messages)

    account = asyncio.run(service.by_name("root"))
    assert account["role"] == "superadmin"
    assert verify_password("a-new-long-secret-1", account["password"])
    assert account["image"] == "avatar.png"
    assert account["apiToken"] == "existing-token"
    assert account["note"] == 7
    assert account["description"] == "kept"
    assert account["linkAccountId"] == 3

    # The note is first-boot-only, so rotating must not rewrite it.
    assert not (tmp_path / "data" / "superuser.txt").exists()


def test_env_credentials_do_not_rewrite_the_note_when_a_superadmin_exists(
    tmp_path, db
):
    service = UserService(db, SECRET)
    db.seed("accounts", 1, {"name": "someone", "role": "superadmin"})
    settings = _settings(
        tmp_path, superuser_name="admin", superuser_password=LONG_PASSWORD
    )

    result = _run(service, settings)

    assert result.action == "created"
    assert result.wrote_credentials is False
    assert not (tmp_path / "data" / "superuser.txt").exists()


# -- branch 2: bad env password ------------------------------------------


def test_short_env_password_is_skipped_with_a_warning(tmp_path, db):
    service = UserService(db, SECRET)
    settings = _settings(tmp_path, superuser_name="admin", superuser_password="short")
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "skipped"
    assert result.reason == "password too short"
    assert any(str(MIN_PASSWORD_LENGTH) in message for message in messages)
    assert asyncio.run(service.by_name("admin")) is None


@pytest.mark.parametrize("length", [0, 5, MIN_PASSWORD_LENGTH - 1])
def test_passwords_below_the_minimum_are_never_accepted(tmp_path, db, length):
    service = UserService(db, SECRET)
    settings = _settings(
        tmp_path, superuser_name="admin", superuser_password="x" * length
    )
    result = _run(service, settings)
    # A blank password means "no env password", which falls through to branch 3.
    assert result.action in ("skipped", "generated")


# -- branch 3: no env, fresh install -------------------------------------


def test_first_run_without_env_generates_a_password_and_writes_the_note(tmp_path, db):
    service = UserService(db, SECRET)
    settings = _settings(tmp_path)
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "generated"
    assert result.username == "admin"
    assert result.wrote_credentials is True
    assert result.generated_password is None
    assert any("generated password" in message for message in messages)

    note = tmp_path / "data" / "superuser.txt"
    assert stat.S_IMODE(note.stat().st_mode) == 0o600
    password = next(
        line.split(": ", 1)[1] for line in note.read_text().splitlines()
        if line.startswith("password:")
    )
    account = asyncio.run(service.by_name("admin"))
    assert account["role"] == "superadmin"
    assert verify_password(password, account["password"])


def test_first_run_honours_the_env_username_without_a_password(tmp_path, db):
    service = UserService(db, SECRET)
    settings = _settings(tmp_path, superuser_name="operator")
    result = _run(service, settings)
    assert result.action == "generated"
    assert result.username == "operator"
    assert asyncio.run(service.by_name("operator")) is not None


def test_generated_password_is_returned_when_the_note_cannot_be_written(
    tmp_path, db
):
    service = UserService(db, SECRET)
    settings = _settings(tmp_path)
    # Make the credential path unusable by pre-creating a directory there.
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data" / "superuser.txt").mkdir()

    result = _run(service, settings)

    assert result.action == "generated"
    assert result.wrote_credentials is False
    # Without the note the password must reach the operator through the result.
    assert result.generated_password
    account = asyncio.run(service.by_name("admin"))
    assert verify_password(result.generated_password, account["password"])


# -- branch 4: no env, superadmin already present ------------------------


def test_existing_superadmin_is_left_untouched(tmp_path, db):
    service = UserService(db, SECRET)
    db.seed(
        "accounts",
        1,
        {
            "name": "admin",
            "password": "untouched-hash",
            "role": "superadmin",
        },
    )
    settings = _settings(tmp_path)
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "unchanged"
    assert messages == []
    account = asyncio.run(service.by_name("admin"))
    assert account["password"] == "untouched-hash"
    assert not (tmp_path / "data" / "superuser.txt").exists()


def test_bootstrap_is_idempotent_across_boots(tmp_path, db):
    service = UserService(db, SECRET)
    settings = _settings(
        tmp_path, superuser_name="admin", superuser_password=LONG_PASSWORD
    )

    first = _run(service, settings)
    second = _run(service, settings)

    assert first.action == "created"
    assert second.action == "updated"
    assert first.account_id == second.account_id == 1
    # Exactly one account, and the password still verifies.
    assert len(asyncio.run(service.all())) == 1
    stored = asyncio.run(service.by_name("admin"))
    assert verify_password(LONG_PASSWORD, stored["password"])


# -- failure handling -----------------------------------------------------


def test_failures_are_reported_not_raised(tmp_path, db):
    class Exploding(UserService):
        async def by_name(self, name):
            raise RuntimeError("datastore down")

    service = Exploding(db, SECRET)
    settings = _settings(
        tmp_path, superuser_name="admin", superuser_password=LONG_PASSWORD
    )
    messages: list[str] = []

    result = _run(service, settings, messages)

    assert result.action == "failed"
    assert "datastore down" in result.reason
    assert any("bootstrap failed" in message for message in messages)
    assert isinstance(result, BootstrapResult)
