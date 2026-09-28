"""Gate for Phase 2 Task P2-G: every frontend ``api.*`` call is owned."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_spec = importlib.util.spec_from_file_location(
    "extract_route_matrix", ROOT / "scripts" / "extract_route_matrix.py"
)
route_matrix = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(route_matrix)


def _artifact() -> dict:
    path = ROOT / "route-matrix.json"
    assert path.is_file(), "run scripts/extract_route_matrix.py"
    return json.loads(path.read_text(encoding="utf-8"))


def test_every_frontend_call_has_an_owning_slice():
    payload = route_matrix.build_matrix()
    assert payload["symbols"], "route matrix found no frontend calls"
    unmapped = [
        name
        for name, data in payload["symbols"].items()
        if data["owningSlice"] == "UNMAPPED"
    ]
    assert unmapped == [], f"frontend calls with no owning Phase 2 slice: {unmapped}"


def test_committed_artifact_is_current():
    assert _artifact() == route_matrix.build_matrix(), (
        "route-matrix.json is stale; run scripts/extract_route_matrix.py"
    )


def test_slice_s1_is_fully_implemented():
    payload = _artifact()
    missing = [
        name
        for name, data in payload["symbols"].items()
        if data["owningSlice"] == "S1" and not data["implemented"]
    ]
    assert missing == [], f"S1 symbols without a cloud_surreal procedure: {missing}"


def test_route_matrix_doc_has_no_unmapped_rows():
    doc = ROOT.parent / "docs" / "plans" / "cloud_surreal" / "route-matrix.md"
    assert doc.is_file()
    text = doc.read_text(encoding="utf-8")
    assert "**Unmapped:** 0." in text
    assert "- none" in text
