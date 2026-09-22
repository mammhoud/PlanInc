"""Disposable PostgreSQL schema-isolation contract for Phase 0.

This intentionally uses psycopg directly so it can validate the database
boundary before the Django project exists. The real server must repeat this
coverage through django-tenants and request/job/WebSocket fixtures.
"""

from __future__ import annotations

import os
import sys
from urllib.parse import urlparse

try:
    import psycopg
except ImportError as exc:  # pragma: no cover - environment dependent
    raise SystemExit("Install psycopg before running this disposable test") from exc


DATABASE_URL = os.environ.get(
    "PLANINC_MIGRATION_DATABASE_URL",
    "postgresql://planinc:planinc-dev-only@127.0.0.1:55432/planinc_migration",
)


def schema_for(tenant: str) -> str:
    return f"tenant_{tenant}"


def set_search_path(connection: psycopg.Connection, schema: str) -> None:
    connection.execute("SELECT set_config('search_path', %s, false)", (schema,))


def main() -> int:
    parsed = urlparse(DATABASE_URL)
    if not parsed.hostname:
        raise SystemExit("PLANINC_MIGRATION_DATABASE_URL must include a hostname")

    with psycopg.connect(DATABASE_URL, autocommit=True) as connection:
        for tenant, value in (("alpha", "alpha-only"), ("beta", "beta-only")):
            schema = schema_for(tenant)
            connection.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
            set_search_path(connection, schema)
            connection.execute(
                "CREATE TABLE IF NOT EXISTS isolation_probe "
                "(key text PRIMARY KEY, value text NOT NULL)"
            )
            connection.execute(
                "INSERT INTO isolation_probe (key, value) VALUES (%s, %s) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                ("same-key", value),
            )

        set_search_path(connection, schema_for("alpha"))
        alpha = connection.execute(
            "SELECT value FROM isolation_probe WHERE key = %s", ("same-key",)
        ).fetchone()
        set_search_path(connection, schema_for("beta"))
        beta = connection.execute(
            "SELECT value FROM isolation_probe WHERE key = %s", ("same-key",)
        ).fetchone()

    if alpha != ("alpha-only",) or beta != ("beta-only",):
        print(f"tenant isolation failed: alpha={alpha!r}, beta={beta!r}", file=sys.stderr)
        return 1
    print("tenant isolation passed: alpha and beta schemas are isolated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
