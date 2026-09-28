"""File storage and attachment mutations (slice S4).

``FileStorage`` is the only module that touches the upload root; every path is
validated segment-by-segment before use and then re-checked with a resolved-path
containment test, so a request can never escape the root even if a symlink or a
percent-encoded ``..`` slips through the first pass.

Attachment records are scoped the way the TS router scopes them: owned directly
(``accountId``) *or* via a note the account owns (``noteId``). Serving a file is
stricter than the TS server: the owner check in ``server/routerExpress/file/``
allowed any authenticated user to read a note-less attachment, which leaked files
between accounts. ``can_read`` implements the intended rule (owner, note owner,
public shared note, or superadmin).
"""

from __future__ import annotations

import io
import mimetypes
import re
import shutil
import time
import zipfile
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from ..db.ids import next_id
from .errors import DomainError
from .store import normalize_record
from .users import normalize_id

ATTACHMENT = "attachments"
NOTE = "notes"
FILE_PREFIX = "/api/file/"
S3_PREFIX = "/api/s3file/"

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f\x80-\x9f]")
RESERVED = re.compile(r"[<>:\"/\\|?*]")
COLLAPSE_DOTS = re.compile(r"\.{2,}")
COLLAPSE_UNDERSCORES = re.compile(r"_+")
TRIM_EDGES = re.compile(r"^[.\s_]+|[.\s_]+$")
WHITESPACE = re.compile(r"\s+")
SEGMENT_SPLIT = re.compile(r"[\\/]+")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")

MAX_NAME_LENGTH = 200
MAX_WRITE_ATTEMPTS = 20
MAX_UPLOAD_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 5_000


def sanitize_upload_filename(name: str) -> str:
    """Reproduce ``sanitizeUploadFileName`` from ``server/lib/files.ts``.

    Whitespace becomes underscores *before* control characters are stripped (so
    a tab does not collapse two words), reserved characters become underscores,
    runs of dots collapse, and the result is truncated to stay well under the
    255-byte filesystem limit while leaving room for a timestamp suffix.
    """
    sanitized = WHITESPACE.sub("_", str(name or ""))
    sanitized = CONTROL_CHARS.sub("", sanitized)
    sanitized = RESERVED.sub("_", sanitized)
    sanitized = COLLAPSE_DOTS.sub(".", sanitized)
    sanitized = COLLAPSE_UNDERSCORES.sub("_", sanitized)
    sanitized = TRIM_EDGES.sub("", sanitized)
    return sanitized[:MAX_NAME_LENGTH] or "unnamed_file"


def normalize_folder(value: str | None) -> str:
    """Normalise a user-supplied destination folder (``a/b`` or ``a\\b``).

    ``.`` and ``..`` segments are dropped rather than rejected, matching the TS
    upload route, so a folder cannot be used to climb out of the root.
    """
    segments = (segment.strip() for segment in SEGMENT_SPLIT.split(str(value or "")))
    return "/".join(s for s in segments if s and s not in (".", ".."))


def normalize_archive_folder(value: str) -> str | None:
    """Validate an archive folder path, returning the comma form or ``None``.

    Unlike uploads, a traversal segment is a hard rejection here: the caller is
    asking us to *select* records by prefix, so silently rewriting the prefix
    would widen the selection.
    """
    raw = str(value or "").replace(",", "/")
    segments = [s.strip() for s in SEGMENT_SPLIT.split(raw) if s.strip()]
    if not segments or any(s in (".", "..") for s in segments):
        return None
    return ",".join(segments)


def safe_archive_segment(value: str) -> str:
    """Neutralise a segment so a crafted name cannot write outside the zip."""
    return COLLAPSE_DOTS.sub("_", RESERVED.sub("_", str(value)))


def is_image(name: str) -> bool:
    return str(name).lower().endswith(IMAGE_EXTENSIONS)


def mime_for(path: str) -> str:
    return mimetypes.guess_type(str(path))[0] or "application/octet-stream"


def record_path_to_rel(path: str) -> str:
    """Strip the ``/api/file/`` (or s3) prefix to get a storage-relative path."""
    for prefix in (S3_PREFIX, FILE_PREFIX):
        if path.startswith(prefix):
            return path[len(prefix) :]
    return str(path).lstrip("/")


class FileStorage:
    """Reads/writes under one root, rejecting any traversing path."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def resolve(self, rel_path: str, allow_temp: bool = False) -> Path:
        raw = unquote(str(rel_path or "")).replace("\\", "/").strip()
        if CONTROL_CHARS.search(raw):
            raise DomainError("BAD_REQUEST", "dangerous characters in path")
        if raw.startswith("/"):
            raise DomainError("FORBIDDEN", "absolute paths are not allowed")
        parts = [part for part in raw.split("/") if part not in ("", ".")]
        if any(part == ".." for part in parts):
            raise DomainError("BAD_REQUEST", "path traversal detected")
        if parts and parts[0] == "temp" and not allow_temp:
            raise DomainError("FORBIDDEN", "temp directory access not allowed")
        resolved = (self.root / Path(*parts)).resolve()
        if resolved != self.root and self.root not in resolved.parents:
            raise DomainError("FORBIDDEN", "path outside allowed directory")
        return resolved

    def save(self, rel_path: str, data: bytes) -> Path:
        target = self.resolve(rel_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return target

    def save_unique(
        self, folder: str, base_name: str, extension: str, data: bytes
    ) -> str:
        """Write ``base.ext``, falling back to ``base_<epoch_ms>.ext`` on collision.

        Mirrors ``FileService.writeFileSafe``: the first attempt uses the plain
        name, and each retry suffixes the current epoch in milliseconds.
        """
        prefix = f"{folder.strip('/')}/" if folder.strip("/") else ""
        for attempt in range(MAX_WRITE_ATTEMPTS):
            suffix = "" if attempt == 0 else f"_{int(time.time() * 1000)}"
            rel_path = f"{prefix}{base_name}{suffix}{extension}"
            if self.exists(rel_path):
                continue
            self.save(rel_path, data)
            return rel_path
        raise DomainError("INTERNAL_SERVER_ERROR", "could not allocate a file name")

    def read(self, rel_path: str, allow_temp: bool = False) -> bytes:
        target = self.resolve(rel_path, allow_temp=allow_temp)
        if not target.is_file():
            raise DomainError("NOT_FOUND", "File not found")
        return target.read_bytes()

    def delete(self, rel_path: str) -> None:
        target = self.resolve(rel_path)
        if target.is_file():
            target.unlink()
        elif target.is_dir():
            shutil.rmtree(target, ignore_errors=True)

    def move(self, old_rel: str, new_rel: str) -> None:
        source = self.resolve(old_rel)
        target = self.resolve(new_rel)
        if not source.exists():
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        source.replace(target)

    def exists(self, rel_path: str) -> bool:
        try:
            return self.resolve(rel_path).is_file()
        except DomainError:
            return False

    def stat(self, rel_path: str, allow_temp: bool = False) -> tuple[int, float]:
        target = self.resolve(rel_path, allow_temp=allow_temp)
        if not target.is_file():
            raise DomainError("NOT_FOUND", "File not found")
        info = target.stat()
        return info.st_size, info.st_mtime


class AttachmentService:
    def __init__(self, client: Any, storage: FileStorage) -> None:
        self._client = client
        self._storage = storage

    @property
    def storage(self) -> FileStorage:
        return self._storage

    # -- scoping ----------------------------------------------------------

    async def _rows(self) -> list[dict]:
        return [normalize_record(row) for row in await self._client.select(ATTACHMENT)]

    async def _notes(self) -> dict[int, dict]:
        return {
            normalize_id(row.get("id")): row
            for row in await self._client.select(NOTE)
        }

    async def _owned_note_ids(self, account_id: int) -> set[int]:
        return {
            normalize_id(row.get("id"))
            for row in await self._client.select(NOTE)
            if normalize_id(row.get("accountId")) == account_id
        }

    async def _scoped(self, account_id: int) -> list[dict]:
        owned_notes = await self._owned_note_ids(account_id)
        return [
            row
            for row in await self._rows()
            if row.get("accountId") == account_id or row.get("noteId") in owned_notes
        ]

    async def list_for_account(
        self, account_id: int, note_id: Any | None = None
    ) -> list[dict]:
        rows = await self._scoped(account_id)
        if note_id is not None:
            target = normalize_id(note_id)
            rows = [row for row in rows if normalize_id(row.get("noteId")) == target]
        rows.sort(key=lambda row: (row.get("sortOrder") or 0, row.get("name") or ""))
        return rows

    async def _get(self, account_id: int, attachment_id: Any) -> dict:
        target = normalize_id(attachment_id)
        for row in await self._scoped(account_id):
            if row["id"] == target:
                return row
        raise DomainError("NOT_FOUND", "Attachment not found")

    async def find_by_path(self, path: str) -> tuple[dict, dict | None]:
        """Look up any attachment by its stored ``/api/file/...`` path."""
        wanted = str(path)
        for row in await self._rows():
            if row.get("path") == wanted:
                note = None
                note_id = normalize_id(row.get("noteId"))
                if note_id is not None:
                    note = (await self._notes()).get(note_id)
                return row, note
        raise DomainError("NOT_FOUND", "File not found")

    async def can_read(
        self,
        attachment: dict,
        note: dict | None,
        account_id: int | None,
        is_superadmin: bool = False,
    ) -> bool:
        """Whether the caller may read the stored bytes.

        Order: superadmin, public share, direct owner, owning-note owner.
        """
        if is_superadmin:
            return True
        if note is not None and note.get("isShare"):
            return True
        if account_id is None:
            return False
        if attachment.get("accountId") == account_id:
            return True
        return note is not None and note.get("accountId") == account_id

    # -- mutations --------------------------------------------------------

    def _attachment_record(
        self,
        account_id: int,
        rel_path: str,
        name: str,
        size: int,
        type_: str,
        note_id: Any | None = None,
        metadata: dict | None = None,
    ) -> dict:
        parts = [part for part in str(rel_path).split("/") if part]
        prefix = ",".join(parts[:-1])
        return {
            "accountId": account_id,
            "noteId": normalize_id(note_id),
            "path": f"{FILE_PREFIX}{rel_path}",
            "name": name,
            "size": size,
            "type": type_,
            "perfixPath": prefix,
            "depth": len(parts) - 1,
            "isShare": False,
            "sharePassword": "",
            "sortOrder": 0,
            **({"metadata": metadata} if metadata else {}),
        }

    async def _insert(self, record: dict) -> dict:
        new_id = await next_id(self._client, ATTACHMENT)
        created = await self._client.create(f"{ATTACHMENT}:{new_id}", record)
        if isinstance(created, list):
            created = created[0] if created else record
        return normalize_record({**record, **(created or {})})

    async def save_upload(
        self,
        account_id: int,
        *,
        filename: str,
        data: bytes,
        type_: str,
        destination_folder: str = "",
        metadata: dict | None = None,
        note_id: Any | None = None,
        custom_path: str = "",
    ) -> dict:
        """Sanitize, store, and register one uploaded file.

        Returns the ``{filePath, fileName}`` payload the Express upload routes
        return, so the frontend contract is unchanged.
        """
        if not data:
            raise DomainError("BAD_REQUEST", "No files received.")
        if len(data) > MAX_UPLOAD_BYTES:
            raise DomainError("BAD_REQUEST", "File too large")
        extension = Path(filename).suffix
        base_name = sanitize_upload_filename(Path(filename).stem or filename)
        folder = "/".join(
            part for part in (normalize_folder(custom_path), normalize_folder(
                destination_folder
            )) if part
        )
        rel_path = self._storage.save_unique(folder, base_name, extension, data)
        stored_name = Path(rel_path).name
        record = self._attachment_record(
            account_id,
            rel_path,
            stored_name,
            len(data),
            type_,
            note_id=note_id,
            metadata=metadata,
        )
        await self._insert(record)
        return {
            "filePath": f"{FILE_PREFIX}{rel_path}",
            "fileName": stored_name,
        }

    async def record_upload(
        self,
        account_id: int,
        rel_path: str,
        name: str,
        size: int,
        type_: str,
        note_id: Any | None = None,
        metadata: dict | None = None,
    ) -> dict:
        return await self._insert(
            self._attachment_record(
                account_id, rel_path, name, size, type_, note_id, metadata
            )
        )

    async def create_folder(
        self, account_id: int, folder_name: str, parent_folder: str | None = None
    ) -> dict:
        name = str(folder_name or "").strip()
        if not name or any(char in name for char in ("/", "\\")) or name in (".", ".."):
            raise DomainError("BAD_REQUEST", "invalid folder name")
        parent = normalize_folder(parent_folder).replace("/", ",")
        prefix = f"{parent},{name}" if parent else name
        parent_path = parent.replace(",", "/")
        folder_path = f"{parent_path}/{name}" if parent else name
        rel_path = f"{folder_path}/.folder"
        await self.record_upload(
            account_id,
            rel_path,
            ".folder",
            0,
            "folder",
        )
        # ``record_upload`` derives ``perfixPath`` from the path; folders carry
        # the comma form explicitly, matching the TS createFolder response.
        return {"success": True, "folderName": name, "folderPath": prefix}

    async def rename(self, account_id: int, data: dict) -> dict:
        new_name = str(data.get("newName") or "").strip()
        if not new_name:
            raise DomainError("BAD_REQUEST", "newName is required")
        is_folder = bool(data.get("isFolder"))
        if not is_folder and any(char in new_name for char in ("/", "\\")):
            raise DomainError(
                "BAD_REQUEST", "File names cannot contain path separators"
            )
        if is_folder and data.get("oldFolderPath"):
            return await self._rename_folder(
                account_id, str(data["oldFolderPath"]), new_name
            )
        attachment = await self._get(account_id, data.get("id"))
        old_rel = record_path_to_rel(attachment["path"])
        new_rel = (
            old_rel.rsplit("/", 1)[0] + "/" + new_name if "/" in old_rel else new_name
        )
        self._storage.move(old_rel, new_rel)
        await self._client.update(
            f"{ATTACHMENT}:{attachment['id']}",
            {"name": new_name, "path": f"{FILE_PREFIX}{new_rel}"},
        )
        return {"success": True}

    async def _rename_folder(
        self, account_id: int, old_prefix: str, new_name: str
    ) -> dict:
        rows = [
            row
            for row in await self._scoped(account_id)
            if str(row.get("perfixPath") or "") == old_prefix
            or str(row.get("perfixPath") or "").startswith(f"{old_prefix},")
        ]
        old_slash = old_prefix.replace(",", "/")
        for row in rows:
            old_rel = record_path_to_rel(row["path"])
            new_prefix = new_name + str(row.get("perfixPath") or "")[len(old_prefix) :]
            new_rel = new_name + old_rel[len(old_slash) :]
            self._storage.move(old_rel, new_rel)
            await self._client.update(
                f"{ATTACHMENT}:{row['id']}",
                {
                    "perfixPath": new_prefix,
                    "path": f"{FILE_PREFIX}{new_rel}",
                    "depth": new_prefix.count(",") + 1,
                },
            )
        return {"success": True}

    async def move(self, account_id: int, source_ids: list, target_folder: str) -> dict:
        target = normalize_folder(target_folder).replace("/", ",")
        moved = 0
        for attachment_id in source_ids or []:
            try:
                attachment = await self._get(account_id, attachment_id)
            except DomainError:
                continue
            old_rel = record_path_to_rel(attachment["path"])
            new_rel = (
                f"{target.replace(',', '/')}/{attachment['name']}"
                if target
                else attachment["name"]
            )
            self._storage.move(old_rel, new_rel)
            await self._client.update(
                f"{ATTACHMENT}:{attachment['id']}",
                {
                    "perfixPath": target,
                    "depth": target.count(",") + 1 if target else 0,
                    "path": f"{FILE_PREFIX}{new_rel}",
                },
            )
            moved += 1
        if moved == 0:
            raise DomainError("NOT_FOUND", "Attachments not found")
        return {"success": True, "message": "Files moved successfully"}

    async def delete(
        self,
        account_id: int,
        attachment_id: Any | None = None,
        is_folder: bool = False,
        folder_path: str | None = None,
    ) -> dict:
        if is_folder and folder_path:
            folder = normalize_folder(str(folder_path).replace(",", "/")).replace(
                "/", ","
            )
            rows = [
                row
                for row in await self._scoped(account_id)
                if str(row.get("perfixPath") or "") == folder
                or str(row.get("perfixPath") or "").startswith(f"{folder},")
            ]
            for row in rows:
                self._storage.delete(record_path_to_rel(row["path"]))
                await self._client.delete(f"{ATTACHMENT}:{row['id']}")
            return {"success": True, "message": "Folder and its contents deleted"}
        attachment = await self._get(account_id, attachment_id)
        self._storage.delete(record_path_to_rel(attachment["path"]))
        await self._client.delete(f"{ATTACHMENT}:{attachment['id']}")
        return {"success": True, "message": "File deleted successfully"}

    async def delete_many(self, account_id: int, ids: list) -> dict:
        for attachment_id in ids or []:
            try:
                attachment = await self._get(account_id, attachment_id)
            except DomainError:
                continue
            self._storage.delete(record_path_to_rel(attachment["path"]))
            await self._client.delete(f"{ATTACHMENT}:{attachment['id']}")
        return {"success": True, "message": "Files deleted successfully"}

    async def delete_by_path(self, account_id: int, path: str) -> dict:
        """Delete a record *and* its bytes by stored path (``/api/file/delete``)."""
        attachment, _note = await self.find_by_path(path)
        if attachment.get("accountId") != account_id:
            raise DomainError(
                "FORBIDDEN", "You don't have permission to delete this file", 403
            )
        self._storage.delete(record_path_to_rel(attachment["path"]))
        await self._client.delete(f"{ATTACHMENT}:{attachment['id']}")
        return {"Message": "Success", "status": 200}

    async def select_for_archive(
        self, account_id: int, attachment_ids: list, folder_paths: list[str]
    ) -> list[dict]:
        """Account-owned attachments matching the ids or folder prefixes."""
        wanted_ids: set[int] = set()
        for value in attachment_ids:
            resolved = normalize_id(value)
            if resolved is not None:
                wanted_ids.add(resolved)
        folders = set(folder_paths)
        rows = [
            row
            for row in await self._scoped(account_id)
            if row["id"] in wanted_ids
            or any(
                str(row.get("perfixPath") or "") == folder
                or str(row.get("perfixPath") or "").startswith(f"{folder},")
                for folder in folders
            )
        ]
        return [
            row
            for row in rows
            if row.get("name") != ".folder" and str(row.get("path") or "").strip()
        ]

    def build_archive(self, attachments: list[dict]) -> bytes:
        """Zip the given attachments in memory, mirroring the Express route."""
        if len(attachments) > MAX_ARCHIVE_ENTRIES:
            raise DomainError("BAD_REQUEST", "Too many files to archive")
        total = 0
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            for attachment in attachments:
                rel_path = record_path_to_rel(str(attachment["path"]))
                if rel_path.startswith("temp/"):
                    continue
                try:
                    content = self._storage.read(rel_path)
                except DomainError:
                    continue
                total += len(content)
                if total > MAX_ARCHIVE_BYTES:
                    raise DomainError("BAD_REQUEST", "Archive too large")
                folder = str(attachment.get("perfixPath") or "")
                prefix = (
                    "/".join(safe_archive_segment(part) for part in folder.split(","))
                    + "/"
                    if folder
                    else ""
                )
                archive.writestr(
                    f"{prefix}{safe_archive_segment(attachment['name'])}", content
                )
        return buffer.getvalue()
