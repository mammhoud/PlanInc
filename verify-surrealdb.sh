#!/usr/bin/env bash
# verify-surrealdb.sh — PlanInc deployment validator
# Confirms that:
#   1. The runtime uses SurrealDB in embedded file mode (no container/URL)
#   2. No forbidden PostgreSQL / legacy datastore configuration remains
#   3. Required runtime files are present
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
SOURCE_DIR="${SOURCE_DIR:-runtime}"

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

# ── 3. Confirm embedded file mode is configured in the runtime ───────────────
if ! grep -Eq 'surrealkv://|SURREALDB_FILE|createNodeEngines|@surrealdb/node' "$SOURCE_DIR/server.mjs" 2>/dev/null; then
  echo "❌ SurrealDB embedded file-mode configuration not found in runtime/server.mjs." >&2
  exit 1
fi

if ! grep -Eq 'SURREALDB_FILE|surrealkv' "$COMPOSE_FILE" 2>/dev/null; then
  echo "❌ SURREALDB_FILE not configured in Compose file." >&2
  exit 1
fi

# ── 4. Required runtime files present ────────────────────────────────────────
for f in "$SOURCE_DIR/package.json" "$SOURCE_DIR/server.mjs"; do
  if [[ ! -f "$f" ]]; then
    echo "❌ Required runtime file missing: $f" >&2
    exit 1
  fi
done

echo "✅ PlanInc runtime is SurrealDB file-mode only. No containers required."
