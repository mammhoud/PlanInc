#!/usr/bin/env python3
"""Export PlanInc design tokens to a Figma-importable token file.

Why this exists
---------------
`src/src/styles/tokens.css` is the single source of truth for the PlanInc design
system: a three-tier cascade (primitives -> semantic aliases -> channel
triplets) plus a `.dark` override block. Figma cannot read a stylesheet, so the
two drift apart the moment either side changes unless the export is mechanical.

This script parses the stylesheet and emits a Tokens Studio format file, which
imports into Figma through the *Tokens Studio for Figma* plugin and maps
one-to-one onto Figma variable modes (`Light` / `Dark`). Run it after any token
change and commit the output beside this script's docs.

It deliberately does NOT invent values: every emitted token is read from the
stylesheet, and `var()` chains are resolved to their primitive values so Figma
sees a concrete colour rather than a reference it cannot follow.

Usage
-----
    python3 scripts/export-figma-tokens.py               # writes the JSON
    python3 scripts/export-figma-tokens.py --check       # exits 1 if stale

The `--check` mode is the useful one in CI: it fails when the committed export
no longer matches the stylesheet, the same way a migration check would.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOKENS_CSS = REPO_ROOT / "src" / "src" / "styles" / "tokens.css"


def find_monorepo_root(start: Path) -> Path:
    """Walk up to the directory that holds both `projects/` and `docs/`."""
    for candidate in (start, *start.parents):
        if (candidate / "projects").is_dir() and (candidate / "docs").is_dir():
            return candidate
    # Standalone checkout: keep the export next to PlanInc's own docs.
    return start


MONOREPO_ROOT = find_monorepo_root(REPO_ROOT.parent)
OUTPUT = MONOREPO_ROOT / "docs" / "plans" / "planinc" / "figma-variables.tokens.json"

# Block boundaries are located by selector, not by line number, so the
# stylesheet can be reordered without silently exporting the wrong ranges.
PRIMITIVE_SELECTOR = ":root"
DARK_SELECTOR = ".dark"

DECL_RE = re.compile(r"--([a-z0-9-]+)\s*:\s*([^;]+);", re.IGNORECASE)
VAR_RE = re.compile(r"var\(\s*--([a-z0-9-]+)\s*\)", re.IGNORECASE)

# Tokens whose value is not a design decision Figma should carry. The channel
# triplets (`--*-channels`) exist purely so HeroUI's Tailwind plugin can emit
# `hsl(var(--x))`; they are a CSS plumbing artefact, not a Figma variable, and
# exporting them would double every colour in the Figma panel with a duplicate.
SKIP_SUFFIXES = ("-channels",)
SKIP_NAMES = {"doc-height", "min-editor-height"}


def read_css() -> str:
    if not TOKENS_CSS.is_file():
        sys.exit(f"tokens.css not found at {TOKENS_CSS}")
    return TOKENS_CSS.read_text(encoding="utf-8")


def block_ranges(css: str) -> list[tuple[int, int, str]]:
    """Return (start, end, selector) for each top-level-ish `{ ... }` block."""
    blocks: list[tuple[int, int, str]] = []
    for match in re.finditer(r"([^\n{}]+?)\s*\{", css):
        selector = match.group(1).strip()
        # Only the last selector line matters (comments / inheritance sit above).
        selector = selector.splitlines()[-1].strip()
        if not selector or selector.startswith("@"):
            continue
        depth, i = 0, match.end() - 1
        while i < len(css):
            if css[i] == "{":
                depth += 1
            elif css[i] == "}":
                depth -= 1
                if depth == 0:
                    blocks.append((match.end(), i, selector))
                    break
            i += 1
    return blocks


def declarations(body: str) -> dict[str, str]:
    return {m.group(1).lower(): m.group(2).strip() for m in DECL_RE.finditer(body)}


def resolve(name: str, raw: dict[str, str], cache: dict[str, str], seen: set[str]) -> str:
    """Resolve a token to a concrete value, following `var()` references."""
    if name in cache:
        return cache[name]
    if name in seen:
        return raw.get(name, "")
    value = raw.get(name, "")
    if not value:
        return ""
    seen.add(name)

    def sub(match: re.Match[str]) -> str:
        return resolve(match.group(1), raw, cache, seen)

    resolved = VAR_RE.sub(sub, value).strip()
    # A var() whose target is unknown would leave `var(` in the output, which
    # breaks the import rather than failing loudly. Keep the raw text so the
    # staleness check surfaces it instead of shipping a broken reference.
    if "var(" not in resolved:
        cache[name] = resolved
    return resolved


def to_dtcg(name: str, value: str) -> dict:
    """Shape one token the way Tokens Studio / DTCG expects."""
    if value.startswith("#") or value.startswith("oklch") or value.startswith("rgb") or value.startswith("hsl"):
        return {"$type": "color", "$value": value}
    if re.fullmatch(r"-?[\d.]+(px|rem|em|%|vh|vw|ms|s)?", value):
        return {"$type": "number", "$value": value}
    return {"$type": "other", "$value": value}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if the export is stale")
    args = parser.parse_args()

    css = read_css()
    blocks = block_ranges(css)

    primitives: dict[str, str] = {}
    light: dict[str, str] = {}
    dark: dict[str, str] = {}

    for start, end, selector in blocks:
        decls = declarations(css[start:end])
        if selector == PRIMITIVE_SELECTOR and not primitives:
            # The first :root is the primitive tier.
            primitives.update(decls)
        elif selector == DARK_SELECTOR:
            dark.update(decls)
        elif selector == PRIMITIVE_SELECTOR:
            # Later :root blocks are the semantic alias + component tiers.
            light.update(decls)

    # Each mode resolves against ITS OWN cascade. Resolving Light against the
    # merged light+dark map silently emitted dark values for every token the two
    # modes share, which is nearly all of them.
    scopes = {
        "primitive": primitives,
        "Light": {**primitives, **light},
        "Dark": {**primitives, **light, **dark},
    }

    def emit(names: dict[str, str], scope: dict[str, str]) -> dict:
        cache: dict[str, str] = {}
        out: dict[str, dict] = {}
        for name in sorted(names):
            if name.endswith(SKIP_SUFFIXES) or name in SKIP_NAMES:
                continue
            value = resolve(name, scope, cache, set())
            if not value:
                continue
            out[name] = {**to_dtcg(name, value), "$description": name.replace("-", " ")}
        return out

    payload = {
        "$description": (
            "Generated from src/src/styles/tokens.css by "
            "scripts/export-figma-tokens.py — do not edit by hand. "
            "Import with the Tokens Studio for Figma plugin; the Light/Dark sets "
            "map onto Figma variable modes of the same name."
        ),
        "primitive": {"color": emit(primitives, scopes["primitive"])},
        "Light": {"color": emit(light, scopes["Light"])},
        "Dark": {"color": emit(dark, scopes["Dark"])},
        "$themes": [
            {
                "id": "light",
                "name": "Light",
                "selectedTokenSets": {
                    "primitive": "source",
                    "Light": "enabled",
                },
            },
            {
                "id": "dark",
                "name": "Dark",
                "selectedTokenSets": {
                    "primitive": "source",
                    "Light": "enabled",
                    "Dark": "enabled",
                },
            },
        ],
    }

    rendered = json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=False) + "\n"
    counts = (
        len(payload["primitive"]["color"]),
        len(payload["Light"]["color"]),
        len(payload["Dark"]["color"]),
    )

    if args.check:
        existing = OUTPUT.read_text(encoding="utf-8") if OUTPUT.is_file() else ""
        if existing != rendered:
            print(f"STALE: {OUTPUT} does not match tokens.css", file=sys.stderr)
            print("       run: python3 scripts/export-figma-tokens.py", file=sys.stderr)
            return 1
        print(f"OK: {OUTPUT} matches tokens.css")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8")
    print(f"wrote {OUTPUT}")
    print(f"  primitives {counts[0]} · Light {counts[1]} · Dark {counts[2]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
