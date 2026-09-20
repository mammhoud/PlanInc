# Troubleshooting (PI-010)

> Part of **PlanInc** — AI-powered card note-taking and planning

Symptom → cause → fix. Every entry here is a failure that actually happened.

---

## Note creation fails with "Unable to save note"

**Cause.** A `RecordId` did not serialise. `surrealdb@2.0.8` keeps a `RecordId`'s
table in a private field, so `inlineValue()`'s `"tb" in value` duck-typing test
failed and fell through to the object branch, emitting `{}` for every record
link. Notes with tags hit it first because they write link values.

**Fix.** Handle `RecordId` explicitly before the object branch in `inlineValue()`
(`runtime/server.mjs`). Guarded by the note-creation test.

---

## Creating a workspace reports success, but the workspace never appears

**Cause.** The embedded engine follows SurrealDB 2.x semantics: `UPDATE` only
touches **existing** records, so `upsertEdge()` silently no-opped and no
membership or invite edge was ever created. The API returned success because
nothing errored.

**Fix.** `upsertEdge()` uses `RELATE` with an explicit id to create-or-update.
Guarded by the workspace create-and-switch test.

---

## Settings save, then come back empty

**Cause.** A bare `option<array>` field is coerced to `[]` on **every** write by
the embedded engine. Only concretely-typed arrays persist. Fields with a typed
`.*` child (`notes.tags`) are unaffected, which is what makes this look random.

**Fix.** Give the field a concrete element type (`array<string>`, `set<string>`).
Affected: `ai_allowed_providers`, `context_roots`, `context_files`,
`ticket_field.options`.

---

## A button is labelled with the wrong text

**Cause.** A duplicate key in the same object literal in `runtime/public/i18n.mjs`
— the later declaration wins, discarding the earlier one silently.
`viewRecycle`/`viewArchive` collided between the toolbar and live-filter groups.

**Fix.** Remove the duplicate. Key uniqueness is now asserted by the i18n spec.

---

## No superuser is created, though `PLANINC_SUPERUSER_PASSWORD` is set

**Cause.** The name reached the container **empty**. An unconditional `export` in
the Makefile pushes an empty value into the child environment when the variable
is unset, and an empty environment variable wins over `.env` during compose
interpolation.

**Fix.** Export only when non-empty. See [`PI-007`](./06-secrets-and-superuser.md).

---

## `docker compose` fails with `invalid boolean: common`

**Cause.** `PLANINC_EXTERNAL_NETWORK` was set to the network *name*, but it is a
boolean toggle; the name belongs in `PLANINC_NETWORK_NAME`.

**Fix.** `PLANINC_EXTERNAL_NETWORK=true` + `PLANINC_NETWORK_NAME=common`.

---

## `notes.structa.cloud` returns 502 / 503

**Cause.** Traefik resolves backends by container name on the shared `common`
network. If `planinc` is only on `planinc-network`, the backend does not resolve.

**Fix.** Deploy with `PLANINC_EXTERNAL_NETWORK=true PLANINC_NETWORK_NAME=common`
(and `docker network create common` once, if it does not exist). Verify from a
peer container:

```bash
docker run --rm --network common curlimages/curl -fsS http://planinc:1111/health
```

Note that a brief 502→503 sequence **during** a container recreate is the health
check catching up, not a config problem. Confirm with `docker ps` before digging.

---

## A browser warns about the certificate on a `.localhost` host

**Cause.** The host is missing from the proxy Makefile's `LOCAL_CERT_SANS` list,
so Traefik falls back to its default certificate.

**Fix.** Add the host to `LOCAL_HOSTS`/`LOCAL_CERT_SANS` and run
`make proxy-certs-selfsigned`. `configs/traefik/dynamic/certs.yml`'s comment
documents the two lists as a pair to keep in sync.

---

## The test suite hangs or mutates real data

**Cause.** A Playwright config was pointed at the default `SURREALDB_FILE`
(`runtime/data/planinc.db`). The running instance holds that file locked, so the
suite either blocks or clobbers deployment state.

**Fix.** Keep the disposable store under `os.tmpdir()` per run. See
[`PI-008`](./07-testing.md).

---

## `/fragments/*` returns HTML where JSON was expected

**Not a bug.** `/fragments/*` renders HTML by design for partial updates. The
JSON surface is `/api/*`.

---

## Related

- [`PI-004`](./03-runtime-http-api.md) — the HTTP surface
- [`PI-005`](./04-database-and-schema.md) — engine semantics in depth
- [`PI-008`](./07-testing.md) — the regression guards
