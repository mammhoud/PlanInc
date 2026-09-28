#!/usr/bin/env python3
"""Extract the canonical PlanInc schema from the TypeScript server.

Phase 6 Task X1 (see docs/plans/cloud_surreal/06-cutover-parity-and-sync.md).

Sources of truth, read-only:
  - server/db.ts                  -> DEFINE FIELD / DEFINE INDEX + field arrays
  - shared/lib/recordSchemas.ts   -> zod object schemas

Emits:
  - cloud_surreal/schema.json                       (machine-readable)
  - docs/plans/cloud_surreal/schema-parity.md       (human gap matrix)

Run:  python3 cloud_surreal/scripts/extract_schema.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
DB_TS = REPO / "server" / "db.ts"
RECORD_SCHEMAS = REPO / "shared" / "lib" / "recordSchemas.ts"
OUT_JSON = REPO / "cloud_surreal" / "schema.json"
OUT_MD = REPO / "docs" / "plans" / "cloud_surreal" / "schema-parity.md"

# Which Phase 2 slice owns each table (02-feature-parity.md).
SLICE_BY_TABLE = {
    "account": "S1",
    "accounts": "S1",
    "user": "S1",
    "users": "S1",
    "config": "S5",
    "cache": "S5",
    "fonts": "S5",
    "branding": "S5",
    "notifications": "S5",
    "notification": "S5",
    "notes": "S2",
    "note": "S2",
    "tag": "S2",
    "tagsToNote": "S2",
    "noteReference": "S2",
    "noteInternalShare": "S2",
    "history": "S2",
    "comments": "S2",
    "comment": "S2",
    "attachments": "S4",
    "folders": "S4",
    "tickets": "S3",
    "studyItems": "S3",
    "skills": "S3",
    "planningLinks": "S3",
    "planningFormFields": "S3",
    "planningCategories": "S3",
    "task": "S3",
    "follows": "S6",
    "shareApprovals": "S6",
    "conversations": "S6",
    "conversation": "S6",
    "message": "S6",
    "agentDirectories": "S6",
    "mcpServers": "S7",
    "plugins": "S7",
    "rss": "S7",
    "aiProviders": "S8",
    "aiModels": "S8",
    "agents": "S8",
    "agent": "S8",
    "aiScheduledTask": "S8",
    "plugin": "S7",
    "widget": "S5",
    "tasks": "S3",
    "customOpenAIConfigs": "S8",
    "rssFeeds": "S7",
    "webhooks": "S7",
    "settings": "S5",
    "userPreferences": "S1",
    "sessions": "S1",
}

FIELD_ARRAY_RE = re.compile(
    r"const\s+(\w+)Fields:\s*Array<\[string,\s*string\]>\s*=\s*\[(.*?)\];",
    re.DOTALL,
)
FIELD_PAIR_RE = re.compile(r"\['([^']+)',\s*'([^']+)'\]")
ON_TABLE_RE = re.compile(r"\bON\s+TABLE\s+([A-Za-z0-9_]+)")
DEFINE_FIELD_RE = re.compile(
    r"\bDEFINE\s+FIELD\s+(?:IF\s+NOT\s+EXISTS\s+|OVERWRITE\s+)?([A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_]+)"
)
ZOD_OBJECT_RE = re.compile(
    r"export const (\w+?)Schema = z\.object\(\{(.*?)\n\}\)(?:\.strict\(\))?", re.DOTALL
)
ZOD_KEY_RE = re.compile(r"^\s{2}([A-Za-z0-9_]+):", re.MULTILINE)
# Projection schemas (…Select / …Include) describe a query shape, not a table;
# fold their fields into the base table instead of listing them separately.
PROJECTION_SUFFIXES = ("Select", "Include")


def _read(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f"missing source file: {path}")
    return path.read_text(encoding="utf-8")


def extract_db_ts(text: str) -> dict[str, dict[str, Any]]:
    tables: dict[str, dict[str, Any]] = {}

    def table(name: str) -> dict[str, Any]:
        return tables.setdefault(
            name, {"fields": {}, "sources": set()}
        )

    # Field arrays (notes/tag/attachments/shareApprovals in ensureSurrealSchema).
    for array_name, body in FIELD_ARRAY_RE.findall(text):
        pairs = FIELD_PAIR_RE.findall(body)
        if not pairs:
            continue
        # The array name maps to a table by convention; the ON clause confirms it.
        target = _array_table(array_name, text) or array_name
        entry = table(target)
        entry["sources"].add(f"db.ts:{array_name}Fields")
        for field, ftype in pairs:
            entry["fields"].setdefault(field, ftype)

    for field, target in DEFINE_FIELD_RE.findall(text):
        entry = table(target)
        entry["sources"].add("db.ts:DEFINE FIELD")
        entry["fields"].setdefault(field, "declared")

    for target in ON_TABLE_RE.findall(text):
        entry = table(target)
        entry["sources"].add("db.ts:DEFINE INDEX")

    return tables


def _array_table(array_name: str, text: str) -> str | None:
    # e.g. noteFields -> `ON notes` appears in the same function.
    singular = array_name[:-1] if array_name.endswith("s") else array_name
    for candidate in (f"{array_name}", f"{singular}", f"{singular}s"):
        if re.search(rf"\bON\s+{re.escape(candidate)}\b", text):
            return candidate
    return None


def extract_record_schemas(text: str) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for name, body in ZOD_OBJECT_RE.findall(text):
        keys = ZOD_KEY_RE.findall(body)
        if not keys:
            continue
        base = name
        for suffix in PROJECTION_SUFFIXES:
            if base.endswith(suffix):
                base = base[: -len(suffix)]
                break
        entry = out.setdefault(base, {"fields": {}, "sources": set()})
        entry["fields"].update({k: "zod" for k in keys})
        entry["sources"].add(f"recordSchemas.ts:{name}Schema")
    return out


def merge(*sources: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for source in sources:
        for table, data in source.items():
            entry = merged.setdefault(table, {"fields": {}, "sources": set()})
            entry["fields"].update(data["fields"])
            entry["sources"].update(data["sources"])
    return merged


def owning_slice(table: str) -> str:
    if table in SLICE_BY_TABLE:
        return SLICE_BY_TABLE[table]
    lowered = table.lower()
    for key, value in SLICE_BY_TABLE.items():
        if key.lower() == lowered:
            return value
    return "UNMAPPED"


def main() -> None:
    db_tables = extract_db_ts(_read(DB_TS))
    schema_tables = extract_record_schemas(_read(RECORD_SCHEMAS))
    tables = merge(db_tables, schema_tables)

    payload = {
        "generatedFrom": [
            str(DB_TS.relative_to(REPO)),
            str(RECORD_SCHEMAS.relative_to(REPO)),
        ],
        "tables": {
            name: {
                "fields": data["fields"],
                "sources": sorted(data["sources"]),
                "owningSlice": owning_slice(name),
            }
            for name, data in sorted(tables.items())
        },
    }
    OUT_JSON.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    unmapped = [
        name
        for name, data in payload["tables"].items()
        if data["owningSlice"] == "UNMAPPED"
    ]
    rows = [
        "| table | fields | source | owning slice | status |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, data in payload["tables"].items():
        rows.append(
            f"| `{name}` | {len(data['fields'])} | "
            f"{', '.join(data['sources'])} | "
            f"{data['owningSlice']} | missing |"
        )

    doc = [
        "# cloud_surreal Schema Parity (Phase 6 Task X1)",
        "",
        "> Generated by `cloud_surreal/scripts/extract_schema.py`. Do not hand-edit;",
        "> re-run the script. Every row is `missing` until the owning Phase 2 "
        "slice lands.",
        "",
        f"**Sources:** `{payload['generatedFrom'][0]}`, "
        f"`{payload['generatedFrom'][1]}`.",
        f"**Tables:** {len(payload['tables'])}. **Unmapped:** {len(unmapped)}.",
        "",
        "## Gap matrix",
        "",
        *rows,
        "",
        "## Unmapped tables",
        "",
    ]
    if unmapped:
        doc.extend(
            f"- `{name}` — needs an owning slice in `02-feature-parity.md`."
            for name in unmapped
        )
    else:
        doc.append("- none")
    doc.append("")

    # Exact expected shapes (Phase 6 Task X2): the field list each Phase 2 slice
    # must reproduce, copied verbatim from the TS sources.
    doc.extend(["## Expected field shapes", ""])
    for name, data in payload["tables"].items():
        if not data["fields"]:
            continue
        doc.append(f"### `{name}` ({data['owningSlice']})")
        doc.append("")
        doc.append("```text")
        for field, ftype in sorted(data["fields"].items()):
            doc.append(f"{field}: {ftype}")
        doc.append("```")
        doc.append("")
    OUT_MD.write_text("\n".join(doc), encoding="utf-8")

    print(f"wrote {OUT_JSON.relative_to(REPO)} ({len(payload['tables'])} tables)")
    print(f"wrote {OUT_MD.relative_to(REPO)} (unmapped: {len(unmapped)})")


if __name__ == "__main__":
    main()
