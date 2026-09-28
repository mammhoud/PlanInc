# cloud_surreal

Robyn + embedded SurrealKV server for PlanInc. This is the port described in
[`docs/plans/cloud_surreal`](../docs/plans/cloud_surreal/00-index.md).

## What is implemented

Phase 1 (foundation) is complete, and Phase 2 is partway through:

| Area | State |
| --- | --- |
| `Settings`, embedded `SurrealClient`, JWT, tRPC transport, `/health`, container | Done |
| Superuser bootstrap (`PLANINC_SUPERUSER_*`, `data/superuser.txt`) | Done |
| S1 Identity — `users.*`, `/api/auth/*`, TOTP 2FA, OAuth2 | 15/15 |
| S2 Notes — `notes.*`, `tags.*` (list + 7 mutations), `comments.list` | 23/34 |
| S3 Planning — `tickets.*`, `study.*`, `planning*.*`, `task.*` | 27/31 |
| S4 Files — `attachments.*`, `/api/file/*`, `/plugins/*` | 6/6 |
| S5 Preferences — `config.*`, `analytics.*`, `notifications.*`, `branding.*`, `fonts.*`, `public.*` | 19/22 |

The authoritative coverage table is generated, not hand-written:

```bash
python3 scripts/extract_route_matrix.py   # -> route-matrix.json + docs/plans/cloud_surreal/route-matrix.md
python3 scripts/extract_schema.py         # -> schema.json + docs/plans/cloud_surreal/schema-parity.md
```

Both scripts have gates in `tests/` that fail when the committed artifact is stale
or a symbol has no owning slice.

### Deliberate deviations from the source stack

See the module docstrings for the full reasoning; the notable ones:

- **File reads are stricter.** The source server allowed any authenticated user to
  read an attachment with no `accountId` and no owning note. Ownership, an owning
  note, a public share, or superadmin is required here.
- **No image pipeline.** `?thumbnail=true` returns the original bytes and sets
  `X-PlanInc-Thumbnail: unsupported`.
- **No S3.** `/api/s3file/*` answers `501` with an explicit message rather than a
  silent `404`.
- **Archives are built in memory** with a byte cap instead of streamed.
- **Three `S5` procedures are absent** (`branding.searchImages`, `branding.generateLogo`,
  `public.musicMetadata`) because they need an image/audio provider.

## Running

```bash
cd cloud_surreal
uv venv --python 3.11 && uv pip install -e . pytest ruff
.venv/bin/pytest -q
.venv/bin/ruff check .
.venv/bin/python -m app.main   # serves on PLANINC_PORT (default 1111)
```

Or via compose, which mounts `./data` (the same volume the source stack uses) and
forwards `PLANINC_SUPERUSER_NAME` / `PLANINC_SUPERUSER_PASSWORD`.

## Superuser bootstrap

On startup the server applies the same four branches as
`server/index.ts` → `bootstrapSuperuserFromEnv` (see `app/domain/superuser.py`):

| Environment | Outcome |
| --- | --- |
| name + password (12+ chars) | Upsert that account as `superadmin`, re-hashing the password and preserving `image`/`apiToken`/`note`/`description`/`linkAccountId` |
| password under 12 chars | Log a warning and skip — a bad env var must not create a broken admin |
| no env, no superadmin yet | Generate a shell-safe 32-char password for `PLANINC_SUPERUSER_NAME` or `admin`, create the account, write `data/superuser.txt` at `0600` |
| no env, superadmin exists | Do nothing, so unsetting the env var is not a lockout |

The credential note is written **only on a true first boot**. Failures are logged
and returned as `BootstrapResult(action="failed")` rather than raised: a bootstrap
problem must not stop the server from listening. If the note cannot be written,
the generated password is returned in the result so it is not lost.

The bootstrap runs from a Robyn startup handler (so the lazy embedded connection
is created on the loop that serves requests) and is opt-in via
`create_app(..., bootstrap=True)`, so tests never create an account as a side
effect.

## Known caveats

- The SDK's embedded connection can abort at interpreter shutdown (a Rust panic
  after data is committed). Data persists; integration tests isolate the work in a
  subprocess for that reason. Re-check on each SDK upgrade.
- Tag derivation landed in S2t (`app/domain/tagging.py`): note bodies now
  maintain `tag` + `tagsToNote` rows, so the `tags.*` mutations and
  `notes.relatedNotes` work. `notes.list`'s remaining filters and the
  history/share procedures are still pending. See
  [`docs/plans/cloud_surreal/02-feature-parity.md`](../docs/plans/cloud_surreal/02-feature-parity.md).
- The four remaining `task.*` symbols are generator (streaming) mutations, which
  the tRPC transport does not support yet.
