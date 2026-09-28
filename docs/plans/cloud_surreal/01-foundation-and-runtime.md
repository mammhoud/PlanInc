# Phase 1: cloud_surreal Foundation and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `cloud_surreal/` as a runnable Robyn service that connects to the existing SurrealKV file, verifies the existing JWTs, and answers a batched superjson tRPC call to a stub router.

**Architecture:** One Robyn process. A supervised `surreal` child process owns the file; `SurrealClient` is the only module that talks to it. Transport, auth, and domain are separate packages under `app/`.

**Tech Stack:** Python 3.11+, Robyn, `surrealdb`, `PyJWT`, `pytest`, Robyn's test client.

**Spec:** [`00-index.md`](./00-index.md)

**Status:** Implemented and green in `cloud_surreal/` — 23 tests pass, `ruff` clean.
Task 3 was revised during execution: the Python SDK's `AsyncEmbeddedSurrealConnection`
embeds SurrealKV in-process, so no `surreal` binary or child process is used.

## Global Constraints

- Robyn only; no Django, no ORM.
- Datastore is the existing file `PLANINC_DB_FILE` (default `/app/data/planinc.db`); no DB container.
- JWT claims `sub`, `name`, `role`, `exp`, `iat`, signed with `NEXTAUTH_SECRET`.
- Frontend contract: `/api/trpc`, superjson, batched (`{"0":…}`), `Authorization: Bearer`.
- Port `1111`.

## File Structure

- `cloud_surreal/pyproject.toml` — deps + pytest config
- `cloud_surreal/app/__init__.py`
- `cloud_surreal/app/config.py` — `Settings` from env
- `cloud_surreal/app/db/surreal.py` — `SurrealClient` (embedded SurrealKV)
- `cloud_surreal/app/auth/jwt.py` — token verify/issue
- `cloud_surreal/app/transport/trpc.py` — tRPC-compatible handler + procedure registry
- `cloud_surreal/app/transport/health.py` — `/health`
- `cloud_surreal/app/main.py` — Robyn app wiring
- `cloud_surreal/tests/` — pytest suite
- `cloud_surreal/dockerfile`, `cloud_surreal/docker-compose.yml`, `cloud_surreal/Makefile`

## Interfaces (fixed for later plans)

```python
# app/config.py
@dataclass(frozen=True)
class Settings:
    db_file: str        # PLANINC_DB_FILE
    db_ns: str          # PLANINC_DB_NS, default "planinc"
    db_name: str        # PLANINC_DB_NAME, default "planinc"
    jwt_secret: str     # NEXTAUTH_SECRET
    port: int           # PLANINC_PORT, default 1111
    @property
    def db_url(self) -> str:  # f"surrealkv://{self.db_file}"
    @classmethod
    def from_env(cls, env=None) -> "Settings": ...

# app/db/surreal.py
class SurrealClient:
    async def connect(self) -> None: ...
    async def close(self) -> None: ...
    async def query(self, sql: str, params: dict | None = None) -> list[dict]: ...
    async def create(self, table: str, data: dict) -> dict: ...
    async def select(self, table: str, where: str | None = None) -> list[dict]: ...
    async def update(self, record: str, data: dict) -> dict: ...
    async def delete(self, record: str) -> None: ...

# app/auth/jwt.py
@dataclass(frozen=True)
class TokenClaims:
    sub: str
    name: str
    role: str
    exp: int
    iat: int
def verify_token(token: str, secret: str) -> TokenClaims: ...  # raises AuthError
def issue_token(claims: TokenClaims, secret: str) -> str: ...

# app/transport/trpc.py
Procedure = Callable[[dict, TokenClaims | None], Awaitable[Any]]
class Router:
    def procedure(self, name: str) -> Callable[[Procedure], Procedure]: ...
def build_trpc_router() -> Router: ...
```

---

### Task 1: Scaffold the service

**Files:**
- Create: `cloud_surreal/pyproject.toml`, `cloud_surreal/app/__init__.py`, `cloud_surreal/app/config.py`, `cloud_surreal/tests/__init__.py`
- Test: `cloud_surreal/tests/test_config.py`

**Interfaces:**
- Produces: `Settings`, `Settings.from_env()`

- [ ] **Step 1: Write the failing test**

```python
def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("PLANINC_DB_FILE", "/tmp/x.db")
    monkeypatch.setenv("NEXTAUTH_SECRET", "s")
    s = Settings.from_env()
    assert s.db_file == "/tmp/x.db"
    assert s.port == 1111
    assert s.db_ns == "planinc"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cloud_surreal && .venv/bin/pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError` / `ImportError: cannot import name 'Settings'`.

- [ ] **Step 3: Implement** `pyproject.toml` (deps `robyn`, `surrealdb`, `pyjwt`; dev `pytest`, `ruff`) and `Settings` in `app/config.py` reading the env names above with the stated defaults.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cloud_surreal && .venv/bin/pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cloud_surreal/pyproject.toml cloud_surreal/app cloud_surreal/tests
git commit -m "feat(cloud_surreal): scaffold service and settings"
```

---

### Task 2: Robyn app and `/health`

**Files:**
- Create: `cloud_surreal/app/main.py`, `cloud_surreal/app/transport/health.py`
- Test: `cloud_surreal/tests/test_health.py`

**Interfaces:**
- Consumes: nothing from Task 1 except `Settings`.
- Produces: `def create_app(settings: Settings) -> Robyn`.

- [ ] **Step 1: Write the failing test** — hit `GET /health` via Robyn's test client, assert status 200 and body `{"status": "ok"}`.

- [ ] **Step 2: Run test to verify it fails** — `pytest tests/test_health.py -v`; expected FAIL (app import missing).

- [ ] **Step 3: Implement** `create_app()` returning a Robyn app with `GET /health`.

- [ ] **Step 4: Run test to verify it passes.**

- [ ] **Step 5: Commit.**

---

### Task 3: Embedded SurrealKV connection (revised)

**Files:**
- Create: `cloud_surreal/app/db/surreal.py` (shared with Task 4)
- Test: `cloud_surreal/tests/test_surreal_integration.py`

**Revised during execution.** `surrealdb` 2.0 provides
`AsyncEmbeddedSurrealConnection(url)`, which embeds SurrealKV in-process. The
original "supervised `surreal` binary" design was replaced because it is
unnecessary: this satisfies "Robyn" + "embedded file, no container" directly.

- [x] **Step 1: Verify the embedded connection** — create, select, and query
  against `surrealkv://<tmp>/planinc.db`; data persists across separate opens.
  Expected: rows returned and the file exists (verified).
- [x] **Step 2: Wire the connection factory** into `SurrealClient` so tests can
  inject a fake (`connection=` / `connection_factory=`).
- [x] **Step 3: Add the review test** for **Review Focus 3**: a subprocess writes,
  a second subprocess reads the same file and sees the record. Isolated because
  the embedded connection can abort at interpreter shutdown (data unaffected).
- [ ] **Step 4: Commit.**

---

### Task 4: `SurrealClient`

**Files:**
- Create: `cloud_surreal/app/db/surreal.py`
- Test: `cloud_surreal/tests/test_surreal_client.py`

**Interfaces:**
- Produces: `SurrealClient` per the Interfaces block.

- [ ] **Step 1: Write the failing test** — inject a fake SDK connection; assert `create("notes", {"content": "x"})` issues `CREATE notes CONTENT $data` with `params={"data": {"content": "x"}}`, and `select("notes", "accountId = 1")` appends the `WHERE` clause.

- [ ] **Step 2: Run test to verify it fails.**

- [ ] **Step 3: Implement** against the `surrealdb` async API; select the namespace/database from `Settings`. Every public method awaits `connect()` lazily at most once.

- [ ] **Step 4: Run test to verify it passes.**

- [ ] **Step 5: Commit.**

---

### Task 5: JWT verify/issue

**Files:**
- Create: `cloud_surreal/app/auth/jwt.py`
- Test: `cloud_surreal/tests/test_jwt.py`

**Interfaces:**
- Produces: `TokenClaims`, `verify_token`, `issue_token`, `AuthError`.

- [ ] **Step 1: Write the failing test** — issue a token with `issue_token`, verify it back and assert all five claims. Add a **Review Focus 2** test: an expired token and a tampered token each raise `AuthError`.

- [ ] **Step 2: Run test to verify it fails.**

- [ ] **Step 3: Implement** HS256 with the exact claim names; `exp`/`iat` as integer seconds.

- [ ] **Step 4: Run test to verify it passes.**

- [ ] **Step 5: Commit.**

---

### Task 6: tRPC-compatible transport

**Files:**
- Create: `cloud_surreal/app/transport/trpc.py`
- Create: `cloud_surreal/tests/fixtures/trpc/*.json` (captured wire fixtures)
- Test: `cloud_surreal/tests/test_trpc.py`

**Interfaces:**
- Produces: `Router`, `build_trpc_router()`, and a Robyn handler registered at `POST|GET /api/trpc/{path:path}`.

- [ ] **Step 1: Capture fixtures.** Start the current TS server and record raw request/response bodies for: a single non-batched call (`skipBatch`), a two-call batch, a batch where index 1 errors, and an empty batch. Save under `tests/fixtures/trpc/`. These pin superjson's exact `{json, meta}` envelope; do not guess it.

- [ ] **Step 2: Write the failing test** — for each fixture, feed the request body to the handler (with a stub `ping` procedure registered) and assert the response JSON is byte-equivalent in shape to the captured response (same keys, same nesting). This covers **Review Focus 1**.

- [ ] **Step 3: Run test to verify it fails.**

- [ ] **Step 4: Implement** the handler: parse `?batch=1`, deserialize inputs with the superjson envelope, dispatch to the `Router` procedure, wrap results/errors per fixture shape, and return HTTP 200 even when an element errors.

- [ ] **Step 5: Run test to verify it passes.**

- [ ] **Step 6: Wire auth** — read `Authorization: Bearer`, call `verify_token`, attach `TokenClaims` to the procedure context; unauthenticated or invalid tokens fail closed. Add the **Review Focus 2** HTTP test (expired token → error envelope, not 500).

- [ ] **Step 7: Commit.**

---

### Task 7: Container and compose

**Files:**
- Create: `cloud_surreal/dockerfile`, `cloud_surreal/docker-compose.yml`, `cloud_surreal/Makefile`

**Interfaces:**
- Consumes: `create_app`, `SurrealProcess`.

- [ ] **Step 1: Write the failing check** — a shell test asserting `docker compose -f cloud_surreal/docker-compose.yml config -q` exits 0 and that the compose file sets `PLANINC_DB_FILE=/app/data/planinc.db` and mounts `./data:/app/data`.

- [ ] **Step 2: Run it to verify it fails.**

- [ ] **Step 3: Write the dockerfile** installing the `surreal` binary and the Python deps, starting the supervised process then Robyn on `1111`. Compose mounts the same `./data` volume as the root `docker-compose.yml`.

- [ ] **Step 4: Run the check to verify it passes.**

- [ ] **Step 5: Commit.**

## Exit Gate

- `pytest` green.
- A batched superjson call to a stub router round-trips against captured fixtures.
- `/health` returns 200 with the file-backed datastore running.
- `docker compose config -q` passes and the compose file keeps the embedded-file constraint.
