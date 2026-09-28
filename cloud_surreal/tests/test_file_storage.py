import pytest

from app.domain.errors import DomainError
from app.domain.files import FileStorage


@pytest.fixture()
def storage(tmp_path) -> FileStorage:
    root = tmp_path / "files"
    root.mkdir()
    return FileStorage(root)


def _code(exc_info) -> str:
    error = exc_info.value
    assert isinstance(error, DomainError)
    return error.code


def test_resolve_accepts_nested_paths_inside_the_root(storage):
    assert storage.resolve("a/b/c.png") == storage.root / "a" / "b" / "c.png"


@pytest.mark.parametrize(
    "bad",
    [
        "../escape.txt",
        "a/../../escape.txt",
        "a/b/../../../escape.txt",
        "%2e%2e/escape.txt",
        "%2E%2E%2Fescape.txt",
        "..\\escape.txt",
    ],
)
def test_resolve_rejects_traversal(storage, bad):
    with pytest.raises(DomainError) as exc_info:
        storage.resolve(bad)
    assert _code(exc_info) == "BAD_REQUEST"


def test_resolve_rejects_absolute_paths(storage):
    with pytest.raises(DomainError) as exc_info:
        storage.resolve("/etc/passwd")
    assert _code(exc_info) == "FORBIDDEN"


def test_resolve_rejects_null_bytes(storage):
    with pytest.raises(DomainError) as exc_info:
        storage.resolve("a\x00b.png")
    assert _code(exc_info) == "BAD_REQUEST"


def test_resolve_gates_the_temp_directory(storage):
    with pytest.raises(DomainError) as exc_info:
        storage.resolve("temp/scratch.png")
    assert _code(exc_info) == "FORBIDDEN"

    allowed = storage.resolve("temp/scratch.png", allow_temp=True)
    assert allowed == storage.root / "temp" / "scratch.png"


def test_resolve_rejects_a_symlink_that_escapes_the_root(storage, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (storage.root / "link").symlink_to(outside)
    with pytest.raises(DomainError) as exc_info:
        storage.resolve("link/secret.txt")
    assert _code(exc_info) == "FORBIDDEN"


def test_save_read_delete_round_trip(storage):
    storage.save("a/b.txt", b"hello")
    assert (storage.root / "a" / "b.txt").read_bytes() == b"hello"
    assert storage.read("a/b.txt") == b"hello"
    assert storage.exists("a/b.txt") is True

    storage.delete("a/b.txt")
    assert storage.exists("a/b.txt") is False
    with pytest.raises(DomainError) as exc_info:
        storage.read("a/b.txt")
    assert _code(exc_info) == "NOT_FOUND"


def test_save_unique_suffixes_on_collision(storage):
    first = storage.save_unique("", "photo", ".png", b"one")
    assert first == "photo.png"

    second = storage.save_unique("", "photo", ".png", b"two")
    assert second != first
    assert second.startswith("photo_")
    assert second.endswith(".png")
    assert storage.read(second) == b"two"


def test_save_unique_honours_the_folder(storage):
    rel = storage.save_unique("vacation/2024", "beach", ".jpg", b"x")
    assert rel == "vacation/2024/beach.jpg"
    assert (storage.root / rel).read_bytes() == b"x"


def test_move_relocates_bytes(storage):
    storage.save("old/one.txt", b"data")
    storage.move("old/one.txt", "new/two.txt")
    assert storage.exists("old/one.txt") is False
    assert storage.read("new/two.txt") == b"data"


def test_stat_reports_size_and_refuses_missing_files(storage):
    storage.save("sized.bin", b"12345")
    size, mtime = storage.stat("sized.bin")
    assert size == 5
    assert mtime > 0

    with pytest.raises(DomainError) as exc_info:
        storage.stat("nope.bin")
    assert _code(exc_info) == "NOT_FOUND"


def test_exists_is_false_for_a_traversing_path_rather_than_raising(storage):
    assert storage.exists("../escape.txt") is False
