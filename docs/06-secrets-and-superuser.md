# Secrets and Superuser (PI-007)

> Part of **PlanInc** — AI-powered card note-taking and planning

`.env` is **gitignored**. `.env.example` is the committed reference. Never commit
`.env`, and never paste real values into an issue or a doc.

## The variables that matter

| Variable | Purpose | Notes |
| --- | --- | --- |
| `PLANINC_SUPERUSER_NAME` | Bootstrap admin username | Created on first boot only |
| `PLANINC_SUPERUSER_PASSWORD` | Bootstrap admin password | Minimum 8 characters |
| `PLANINC_NEXTAUTH_SECRET` | JWT signing secret | Change before deploying |
| `PLANINC_PUBLIC_URL` | Public base URL for share links | `https://notes.structa.cloud` |
| `PLANINC_EXTERNAL_NETWORK` | Attach to an existing network | **Boolean** — see [`PI-006`](./05-deployment.md) |
| `PLANINC_NETWORK_NAME` | Which network to attach to | `common` behind the proxy |
| `PLANINC_PORT` | Host port mapping | In-container port is `PLANING_PORT` |

## Generating a password

Use a shell-safe alphabet. `make run` sources `.env` with `set -a`, so a password
containing shell metacharacters will corrupt the environment:

```bash
openssl rand -base64 36 | tr -d '/+=' | cut -c1-32
```

## Bootstrap behaviour

On every boot the server checks whether an account with
`PLANINC_SUPERUSER_NAME` exists:

- **missing** → creates it, hashes the password with bcrypt, and logs
  `[superuser] Bootstrapped superuser '<name>' from environment`
- **present** → leaves it completely alone. The password is **never** rewritten.

Deleting the account and restarting is the supported way to reset it. A password
shorter than 8 characters is rejected at boot; watch the logs.

## ⚠️ The empty-export trap

A variable can be present in `.env` and still reach the container blank.

`make` and the shell do not distinguish "unset" from "set to empty" the way
compose does. An unconditional `export PLANINC_SUPERUSER_NAME` in the Makefile
pushes an **empty** value into the child environment when the variable is not set
in the shell — and an empty environment variable **wins over `.env`** during
compose interpolation. The result: the container starts, the password is set, the
name is empty, and no superuser is created.

The Makefile therefore exports these only when they are actually supplied. If you
add a new variable to that list, preserve that guard:

```make
ifneq ($(strip $(PLANINC_SUPERUSER_NAME)),)
export PLANINC_SUPERUSER_NAME
endif
```

## Verifying

```bash
# The account exists?
docker logs planinc 2>&1 | grep -i superuser

# The account works?
curl -fsS -o /dev/null -w '%{http_code}\n' \
  -X POST https://notes.structa.cloud/api/auth/... \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
# 200 → good. 401 → wrong password. Empty name → read the trap above.
```

## Secret hygiene

- `runtime/data/` and `.env` are gitignored — keep it that way.
- The deploy-generated password exists in exactly one place: `.env`. There is no
  recovery path other than recreating the account.
- Never log the password. The bootstrap log line deliberately prints only the
  username.

## Related

- [`PI-006`](./05-deployment.md) — deployment and networks
- [`PI-010`](./09-troubleshooting.md) — the "no bootstrap log line" entry
