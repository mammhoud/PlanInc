"""Gate for Phase 6 Task X1/X2: every canonical table has an owning slice."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_spec = importlib.util.spec_from_file_location(
    "extract_schema", ROOT / "scripts" / "extract_schema.py"
)
# The script is a plain module; importing it must not run main().
extract_schema = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(extract_schema)


def _tables() -> dict:
    db_tables = extract_schema.extract_db_ts(extract_schema._read(extract_schema.DB_TS))
    schema_tables = extract_schema.extract_record_schemas(
        extract_schema._read(extract_schema.RECORD_SCHEMAS)
    )
    return extract_schema.merge(db_tables, schema_tables)


def test_every_canonical_table_has_an_owning_slice():
    tables = _tables()
    assert tables, "schema extraction found no tables"
    unmapped = [
        name
        for name in tables
        if extract_schema.owning_slice(name) == "UNMAPPED"
    ]
    assert unmapped == [], f"tables with no owning Phase 2 slice: {unmapped}"


def test_schema_artifact_matches_no_unmapped():
    artifact = ROOT / "schema.json"
    assert artifact.is_file(), "run scripts/extract_schema.py"
    data = json.loads(artifact.read_text(encoding="utf-8"))
    assert data["tables"]
    assert all(
        entry["owningSlice"] != "UNMAPPED" for entry in data["tables"].values()
    )


def test_parity_doc_is_generated():
    doc = (ROOT.parent / "docs" / "plans" / "cloud_surreal" / "schema-parity.md")
    assert doc.is_file()
    assert "**Unmapped:** 0." in doc.read_text(encoding="utf-8")
