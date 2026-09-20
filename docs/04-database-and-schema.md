# Database and Schema (PI-005)

> Part of **PlanInc** — AI-powered card note-taking and planning

The runtime uses an **embedded SurrealDB** over `surrealkv://`, opened from
`SURREALDB_FILE` (default `runtime/data/planinc.db`). There is no database
container: `@surrealdb/node` runs the engine in-process.

⚠️ **This makes running the test suite against a live database a real risk.**
The Playwright configs deliberately point at a disposable store under `/tmp` per
run. Never change them back to the default path.

## Schema bootstrap

Table, field, index and analyzer definitions live in the `DEFINE` block of
`runtime/server.mjs` and are applied on boot by an idempotent helper. Two
consequences:

1. **Booting twice is safe**, including on an existing database — the bootstrap
   converges the schema rather than failing on already-defined objects.
2. **Schema changes are additive.** To change a field's type you must account for
   existing rows; a tightened type will not rewrite them.

## Engine semantics that bite

The embedded engine follows SurrealDB 2.x semantics, which differ from what
casual SurrealQL suggests. Four behaviours have caused real outages here. Each
now has a regression guard in the test suite.

### 1. `UPDATE` only touches existing records

`UPDATE` silently no-ops when the record does not exist. Anything that must
create-or-update — memberships, invitations, every relation edge — has to use
`RELATE` (with an explicit id) instead. The `upsertEdge()` helper does this.

**Symptom:** creating a workspace reports success, but the workspace never
appears and switching to it fails.

### 2. Bare `array` fields always store `[]`

An untyped `option<array>` field is coerced to an empty array on **every** write.
Only concretely-typed arrays (`array<string>`, `set<string>`) persist. Fields
with a typed `.*` child (like `notes.tags`) are unaffected — which is what makes
this so easy to miss.

**Symptom:** settings that look saved — AI allowed providers, context roots,
context files, ticket field options — come back empty after a reload.

### 3. Record links must be serialised explicitly

`surrealdb@2.0.8` keeps a `RecordId`'s table in a private field, so duck-typing
with `"tb" in value` fails and record links serialise as `{}`. `inlineValue()`
handles `RecordId` before falling through to the object branch.

**Symptom:** `POST /api/notes` with tags returns "Unable to save note"; audit
actors and all inline record links render as `{}`.

### 4. Duplicate keys in an object literal silently win

Not an engine issue, but it lives in the same blast radius: a duplicate key in
`public/i18n.mjs` means the later declaration wins and the earlier label
disappears. The i18n spec asserts key uniqueness.

**Symptom:** a toolbar button is labelled with another area's text.

## Inspecting the store

```bash
# Where the data actually is
ls -la runtime/data/

# Confirm the engine opens cleanly (used by make up/build as a pre-flight)
make verify-surrealdb
```

## Related

- [`PI-010`](./09-troubleshooting.md) — the same failures as symptom → cause → fix
- [`PI-008`](./07-testing.md) — the regression guards
