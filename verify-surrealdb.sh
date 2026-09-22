#!/usr/bin/env bash
# verify-surrealdb.sh — PlanInc deployment validator
# Confirms that:
#   1. The deployed source stack uses SurrealDB in embedded file mode (no container/URL)
#   2. No forbidden PostgreSQL / legacy datastore configuration remains
#   3. Required runtime files are present
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
if [[ "$COMPOSE_FILE" != /* ]]; then
  COMPOSE_FILE="$SCRIPT_DIR/$COMPOSE_FILE"
fi
SOURCE_DIR="${SOURCE_DIR:-$SCRIPT_DIR}"
if [[ "$SOURCE_DIR" != /* ]]; then
  SOURCE_DIR="$SCRIPT_DIR/$SOURCE_DIR"
fi

# ── 1. Forbidden legacy datastore check ──────────────────────────────────────
if grep -Eq 'postgres|postgresql|DATABASE_URL' "$SOURCE_DIR/package.json" "$COMPOSE_FILE" 2>/dev/null; then
  echo "❌ Forbidden relational database configuration found in runtime." >&2
  grep -Ein 'postgres|postgresql|DATABASE_URL' "$SOURCE_DIR/package.json" "$COMPOSE_FILE" >&2 || true
  exit 1
fi

if grep -Eq '@prisma/client|pg-boss|pgBoss' "$SOURCE_DIR/package.json" 2>/dev/null; then
  echo "❌ Forbidden legacy datastore dependency found in runtime package.json." >&2
  exit 1
fi

# ── 2. Confirm SurrealDB network server is gone from Compose ─────────────────
if grep -Eq 'surrealdb/surrealdb|SURREALDB_URL|SURREALDB_PASS|SURREALDB_PORT' "$COMPOSE_FILE" 2>/dev/null; then
  echo "❌ Compose still references a SurrealDB network server or container." >&2
  grep -Ein 'surrealdb/surrealdb|SURREALDB_URL|SURREALDB_PASS|SURREALDB_PORT' "$COMPOSE_FILE" >&2 || true
  exit 1
fi

# ── 3. Confirm embedded file mode is configured in the source stack ───────────
if ! grep -REq 'surrealkv://|PLANINC_DB_FILE|createNodeEngines|@surrealdb/node' "$SOURCE_DIR/server" "$SOURCE_DIR/dockerfile" 2>/dev/null; then
  echo "❌ SurrealDB embedded file-mode configuration not found in the source server." >&2
  exit 1
fi

if ! grep -Eq 'PLANINC_DB_FILE|surrealkv' "$COMPOSE_FILE" 2>/dev/null; then
  echo "❌ PLANINC_DB_FILE not configured in Compose file." >&2
  exit 1
fi

# ── 4. Required runtime files present ────────────────────────────────────────
for f in "$SOURCE_DIR/server/package.json" "$SOURCE_DIR/server/surreal.ts" "$SOURCE_DIR/dockerfile"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ Required runtime file missing: $f" >&2
    exit 1
  fi
done

echo "✅ PlanInc source deployment is SurrealDB file-mode only. No database container required."
