import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "docker-compose.yml"


def test_compose_keeps_embedded_file_datastore():
    text = COMPOSE.read_text(encoding="utf-8")
    assert "PLANINC_DB_FILE: /app/data/planinc.db" in text
    assert "./data:/app/data" in text
    # No separate database container.
    assert "surrealdb/surrealdb" not in text


@pytest.mark.skipif(shutil.which("docker") is None, reason="docker not available")
def test_compose_config_is_valid():
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "config", "-q"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
