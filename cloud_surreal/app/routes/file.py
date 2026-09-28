"""``/api/file/*`` and ``/plugins/*`` routes (slice S4).

Compatible with ``server/routerExpress/file/``: authenticated upload (multipart),
upload-by-URL, delete, in-memory zip archive, and guarded file serving with
ETag/304, byte ranges and download disposition. ``/plugins/*`` serves plugin
bundles from ``.planinc/plugins``.

Deviations from the TS server, all deliberate:

* **Serving is stricter.** ``server/routerExpress/file/file.ts`` allowed any
  authenticated user to read an attachment with no ``accountId`` and no owning
  note. ``AttachmentService.can_read`` requires ownership, an owning note, a
  public share, or superadmin.
* **Thumbnails are not generated.** The TS route resizes with ``sharp``; there is
  no image dependency here, so ``?thumbnail=true`` returns the original bytes
  with a note in the docs.
* **S3 object storage is not implemented.** ``/api/s3file/*`` answers 501 with an
  explicit message rather than silently 404ing, so a misconfigured deployment is
  visible.
* **Archives are built in memory** with a size cap instead of streaming.
"""

from __future__ import annotations

import hashlib
from typing import Any
from urllib.parse import unquote, urlparse

from robyn import Response

from ..config import Settings
from ..domain import files as file_domain
from ..domain.errors import DomainError
from ..domain.files import (
    FILE_PREFIX,
    FileStorage,
    is_image,
    mime_for,
    normalize_archive_folder,
)
from ..services import AppServices
from . import http

MAX_FOLDER_SEGMENTS = 12
ARCHIVE_FILENAME = "planinc-resources.zip"


def _cors(request: Any) -> dict[str, str]:
    """The upload routes advertise CORS because the desktop shell posts cross-origin."""
    origin = http.header(request, "origin")
    if not origin:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Credentials": "true",
    }


def _etag(size: int, mtime: float) -> str:
    digest = hashlib.sha256(f"{int(mtime * 1000)}-{size}".encode()).hexdigest()
    return f'"{digest}"'


def _validate_folder(value: str, *, allow_empty: bool = True) -> str:
    folder = file_domain.normalize_folder(value)
    if folder.count("/") + 1 > MAX_FOLDER_SEGMENTS:
        raise DomainError("BAD_REQUEST", "Folder path is too deep")
    if not folder and not allow_empty:
        raise DomainError("BAD_REQUEST", "Folder is required")
    return folder


def register_file_routes(
    app: Any, services: AppServices, settings: Settings
) -> None:
    attachments = services.attachments
    storage = attachments.storage

    # -- serving ----------------------------------------------------------

    @app.get("/api/file/*")
    async def get_file(request):
        rel_path = http.tail(request)
        if not rel_path:
            return http.error_response(404, "File not found")
        params = http.query(request)
        want_thumbnail = params.get("thumbnail") == "true"
        want_download = params.get("download") == "true"
        in_temp = rel_path == "temp" or rel_path.startswith("temp/")
        claims = http.claims(request, settings)
        account = http.account_id(request, settings)

        if in_temp and claims is None:
            return http.error_response(401, "Unauthorized")
        if rel_path.endswith(".bko") and (
            claims is None or claims.role != "superadmin"
        ):
            return http.error_response(401, "Only superadmin can access")

        # Validate before touching the datastore so a traversal attempt is
        # rejected on its own merits rather than masked by a 404.
        try:
            size, mtime = storage.stat(rel_path, allow_temp=in_temp)
        except DomainError as err:
            if err.code in ("BAD_REQUEST", "FORBIDDEN"):
                return http.error_response(400, "Invalid path")
            return http.error_response(404, "File not found")

        # Backups (``.bko``) are superadmin-only and the temp tree is gated above;
        # everything else must resolve to an attachment the caller may read.
        if not in_temp and not rel_path.endswith(".bko"):
            try:
                attachment, note = await attachments.find_by_path(
                    f"{FILE_PREFIX}{rel_path}"
                )
            except DomainError:
                return http.error_response(404, "File not found")
            allowed = await attachments.can_read(
                attachment, note, account, http.is_superadmin(request, settings)
            )
            if not allowed:
                return http.error_response(
                    401 if claims is None else 403, "Unauthorized"
                )

        etag = _etag(size, mtime)
        headers = {"Cache-Control": "public, max-age=3600", "ETag": etag}
        if http.header(request, "if-none-match") == etag:
            return Response(status_code=304, headers={"ETag": etag}, description="")

        content_type = mime_for(rel_path)
        if want_thumbnail and is_image(rel_path):
            # No image pipeline in the Python server; the original is a valid,
            # if larger, response and keeps the URL contract intact.
            headers["X-PlanInc-Thumbnail"] = "unsupported"

        disposition = None
        if want_download:
            disposition = http.content_disposition(
                rel_path.split("/")[-1], inline=False
            )

        try:
            content = storage.read(rel_path, allow_temp=in_temp)
        except DomainError:
            return http.error_response(404, "File not found")

        start, end = _range_bounds(http.header(request, "range"), len(content))
        if start is None:
            return http.bytes_response(
                200, content, content_type, headers, disposition
            )
        headers["Content-Range"] = f"bytes {start}-{end}/{len(content)}"
        headers["Accept-Ranges"] = "bytes"
        return http.bytes_response(
            206, content[start : end + 1], content_type, headers, disposition
        )

    @app.get("/api/s3file/*")
    async def get_s3_file(request):
        return http.error_response(
            501, "S3 object storage is not implemented in cloud_surreal yet"
        )

    @app.get("/plugins/*")
    async def get_plugin_file(request):
        rel_path = http.tail(request)
        if not rel_path:
            return http.error_response(404, "Plugin not found")
        plugin_storage = FileStorage(settings.plugin_dir)
        try:
            content = plugin_storage.read(rel_path)
        except DomainError as err:
            status = 400 if err.code in ("BAD_REQUEST", "FORBIDDEN") else 404
            return http.error_response(status, "Plugin not found")
        return http.bytes_response(
            200,
            content,
            "application/javascript",
            {"Cache-Control": "public, max-age=300"},
        )

    # -- mutations --------------------------------------------------------

    @app.post("/api/file/upload")
    async def upload_file(request):
        account = http.account_id(request, settings)
        if account is None:
            return http.error_response(401, "Unauthorized")
        fields, parts = http.multipart(request)
        if not parts:
            return http.error_response(400, "No files received.")
        part = parts[0]
        try:
            folder = _validate_folder(fields.get("destinationFolder", ""))
            metadata: dict[str, Any] = {}
            if fields.get("isUserVoiceRecording") == "true":
                metadata["isUserVoiceRecording"] = True
            for key in ("audioDuration", "audioDurationSeconds"):
                if fields.get(key):
                    metadata[key] = fields[key]
            result = await attachments.save_upload(
                account,
                filename=part.filename,
                data=part.data,
                type_=part.content_type,
                destination_folder=folder,
                metadata=metadata or None,
            )
        except DomainError as err:
            status = {"BAD_REQUEST": 400, "FORBIDDEN": 403}.get(err.code, 500)
            return http.error_response(status, "Upload failed")
        return http.json_response(
            200,
            {
                "Message": "Success",
                "status": 200,
                **result,
                "type": part.content_type,
                "size": len(part.data),
            },
            _cors(request),
        )

    @app.post("/api/file/upload-by-url")
    async def upload_by_url(request):
        account = http.account_id(request, settings)
        if account is None:
            return http.error_response(401, "Unauthorized")
        if settings.is_demo:
            return http.error_response(401, "In Demo App")
        url = str(http.body(request).get("url") or "")
        if not url:
            return http.error_response(400, "No URL provided")
        try:
            filename, content_type, data = await _fetch_url(url)
        except DomainError as err:
            return http.error_response(400, err.message)
        try:
            result = await attachments.save_upload(
                account,
                filename=filename,
                data=data,
                type_=content_type,
            )
        except DomainError:
            return http.error_response(500, "Failed to upload file from URL")
        return http.json_response(
            200,
            {
                "Message": "Success",
                "status": 200,
                **result,
                "originalURL": url,
                "type": content_type,
                "size": len(data),
            },
            _cors(request),
        )

    @app.post("/api/file/delete")
    async def delete_file(request):
        account = http.account_id(request, settings)
        if account is None:
            return http.error_response(401, "Unauthorized")
        path = str(http.body(request).get("attachment_path") or "")
        if not path:
            return http.error_response(400, "Missing attachment_path parameter")
        try:
            attachment, note = await attachments.find_by_path(path)
        except DomainError:
            return http.error_response(404, "File not found")
        if not await attachments.can_read(
            attachment, note, account, http.is_superadmin(request, settings)
        ):
            return http.error_response(
                403, "Forbidden: You don't have permission to delete this file"
            )
        await attachments.delete_by_path(account, path)
        return http.json_response(200, {"Message": "Success", "status": 200})

    @app.post("/api/file/archive")
    async def archive_files(request):
        account = http.account_id(request, settings)
        if account is None:
            return http.error_response(401, "Unauthorized")
        payload = http.body(request)
        ids = [
            value
            for value in (payload.get("attachmentIds") or [])
            if isinstance(value, int)
        ][:100]
        raw_folders = [
            value
            for value in (payload.get("folderPaths") or [])
            if isinstance(value, str) and value.strip()
        ][:20]
        folders: list[str] = []
        for raw in raw_folders:
            normalized = normalize_archive_folder(raw)
            if normalized is None:
                return http.error_response(400, "Invalid folder path")
            folders.append(normalized)
        if not ids and not folders:
            return http.error_response(400, "Select at least one file or folder")
        selected = await attachments.select_for_archive(account, ids, folders)
        if not selected:
            return http.error_response(404, "No downloadable files found")
        try:
            archive = attachments.build_archive(selected)
        except DomainError as err:
            return http.error_response(400, err.message)
        return http.bytes_response(
            200,
            archive,
            "application/zip",
            {"Content-Disposition": f'attachment; filename="{ARCHIVE_FILENAME}"'},
        )


async def _fetch_url(url: str) -> tuple[str, str, bytes]:
    """Download a remote file for ``upload-by-url`` without blocking the loop."""
    import asyncio
    import urllib.error
    import urllib.request

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise DomainError("BAD_REQUEST", "Failed to fetch file from URL")

    def _download() -> tuple[str, str, bytes]:
        request = urllib.request.Request(url, headers={"User-Agent": "PlanInc"})
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310
            content_type = response.headers.get("content-type", "")
            data = response.read(file_domain.MAX_UPLOAD_BYTES + 1)
        if len(data) > file_domain.MAX_UPLOAD_BYTES:
            raise DomainError("BAD_REQUEST", "File too large")
        if not data:
            raise DomainError("BAD_REQUEST", "Failed to fetch file from URL")
        name = unquote(parsed.path.rsplit("/", 1)[-1]).replace(" ", "_") or "download"
        return name, content_type, data

    try:
        return await asyncio.to_thread(_download)
    except DomainError:
        raise
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise DomainError("BAD_REQUEST", "Failed to fetch file from URL") from exc


def _range_bounds(range_header: str, total: int) -> tuple[int | None, int]:
    """Parse a single-range ``bytes=start-end`` header."""
    if not range_header or not range_header.startswith("bytes=") or total == 0:
        return None, 0
    spec = range_header[len("bytes=") :].split(",")[0].strip()
    start_text, _, end_text = spec.partition("-")
    try:
        start = int(start_text) if start_text else 0
        end = int(end_text) if end_text else total - 1
    except ValueError:
        return None, 0
    start = max(0, min(start, total - 1))
    end = max(start, min(end, total - 1))
    return start, end
