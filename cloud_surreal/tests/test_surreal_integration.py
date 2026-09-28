"""Real embedded-SurrealKV integration.

Runs the datastore work in a subprocess: the SDK's embedded connection can abort
at interpreter shutdown (Rust panic after data is committed), so isolating it
keeps pytest's exit clean while still proving the file persists across opens.
"""

from __future__ import annotations

import subprocess
import sys
import textwrap
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_SCRIPT = textwrap.dedent(
    """
    import asyncio, json, sys
    from app.config import Settings
    from app.db.surreal import SurrealClient

    async def main():
        db_file = sys.argv[1]
        mode = sys.argv[2]
        settings = Settings(
            db_file=db_file, db_ns="planinc", db_name="planinc",
            jwt_secret="s", port=1111,
        )
        client = SurrealClient(settings)
        if mode == "write":
            await client.create("notes", {"content": "integration"})
            # Numeric record ids must round-trip: identity allocates
            # ``accounts:<n>`` and the frontend expects the numeric id.
            await client.create("accounts:1", {"name": "root", "role": "superadmin"})
        rows = await client.query("SELECT content FROM notes;")
        accounts = await client.query("SELECT name, role FROM accounts:1;")
        print(json.dumps({"notes": rows, "accounts": accounts}))

    asyncio.run(main())
    """
)


def _run(db_file: Path, mode: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", _SCRIPT, str(db_file), mode],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )


def test_embedded_surrealkv_persists_across_opens(tmp_path, monkeypatch):
    monkeypatch.setenv("PYTHONPATH", str(PROJECT_ROOT))
    db_file = tmp_path / "planinc.db"

    write = _run(db_file, "write")
    assert "integration" in write.stdout, write.stderr
    assert "root" in write.stdout, write.stderr
    assert db_file.exists()

    read = _run(db_file, "read")
    assert "integration" in read.stdout, read.stderr
    assert "superadmin" in read.stdout, read.stderr
