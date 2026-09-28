"""Environment-driven settings for cloud_surreal."""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_DB_FILE = "./data/planinc.db"
DEFAULT_DB_NS = "planinc"
DEFAULT_DB_NAME = "planinc"
DEFAULT_PORT = 1111
# Mirrors ``shared/lib/pathConstant.ts``: runtime data lives under ``.planinc``
# unless ``PLANINC_DATA_DIR`` relocates the whole tree.
DEFAULT_DATA_DIR = ".planinc"
UPLOAD_SUBDIR = "files"
PLUGIN_SUBDIR = "plugins"


@dataclass(frozen=True)
class Settings:
    """Runtime configuration resolved once at process start."""

    db_file: str
    db_ns: str
    db_name: str
    jwt_secret: str
    port: int
    data_dir: str = DEFAULT_DATA_DIR
    is_demo: bool = False
    superuser_name: str = ""
    superuser_password: str = ""

    @property
    def db_url(self) -> str:
        """Embedded SurrealKV URL for the existing data file."""
        return f"surrealkv://{self.db_file}"

    @property
    def upload_dir(self) -> str:
        """Root the file routes may read and write inside."""
        return os.path.join(self.data_dir, UPLOAD_SUBDIR)

    @property
    def temp_dir(self) -> str:
        """Staging area for AI/tool artifacts; requires auth to read."""
        return os.path.join(self.upload_dir, "temp")

    @property
    def plugin_dir(self) -> str:
        """Directory plugin bundles are served from (``/plugins/*``)."""
        return os.path.join(self.data_dir, PLUGIN_SUBDIR)

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        source = os.environ if env is None else env
        return cls(
            db_file=source.get("PLANINC_DB_FILE", DEFAULT_DB_FILE),
            db_ns=source.get("PLANINC_DB_NS", DEFAULT_DB_NS),
            db_name=source.get("PLANINC_DB_NAME", DEFAULT_DB_NAME),
            jwt_secret=source.get("NEXTAUTH_SECRET", ""),
            port=int(source.get("PLANINC_PORT", str(DEFAULT_PORT))),
            data_dir=source.get("PLANINC_DATA_DIR", DEFAULT_DATA_DIR),
            is_demo=bool(source.get("IS_DEMO")),
            superuser_name=source.get("PLANINC_SUPERUSER_NAME", ""),
            superuser_password=source.get("PLANINC_SUPERUSER_PASSWORD", ""),
        )
