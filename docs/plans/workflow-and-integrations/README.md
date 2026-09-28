# `docs/plans/workflow-and-integrations`

> Part of **PlanInc** — AI-powered card note-taking and planning

Program plan for three integrations on the current stack: a first-party Docker
plugin, a workflow canvas (design + load/run scripts, opened from a plugin page
that adds nodes), and a one-click MCP server installation flow.

## Contents

- `00-index.md` — master plan: deliverables, phases, constraints, review focus, open decisions
- `01-docker-plugin.md` — admin-only curated Docker route plus a declared-capability plugin
- `02-workflow-canvas.md` — workflow data model, canvas over `PlanIncGraph`, node add, loading scripts, `/workflow` page
- `03-mcp-installation.md` — bundled MCP preset catalog and one-click install via the existing validation

## Related

- Python-server cutover, schema parity, and bidirectional data sync live in
  [`../cloud_surreal/06-cutover-parity-and-sync.md`](../cloud_surreal/06-cutover-parity-and-sync.md).
- Plugin capability declarations/warnings (PI-024 I2) are implemented in
  `frontend/src/store/plugin/` and `shared/lib/types.ts`.

## Usage

No executable entry point; read `00-index.md` first, then the phase plan you are
executing.
