# Progress

## 2026-09-19

- Initialized a persistent implementation plan and ticket map.
- Confirmed the canonical nested repository and current `generic` branch.
- Confirmed current worktree contains source edits plus untracked local database
  data; no generated database files will be added.
- Started the planning/history and navigation audit.
- Completed the history audit: committed `planing/` contains no implementation;
  only the legacy runtime tests provide behavioral references for tickets and
  graphs.
- Confirmed the canonical frontend already depends on Mermaid and has analytics,
  AI-agent, note, and responsive navigation surfaces to extend.
- Added first-class `tickets` and `studyItems` SurrealDB tables with authenticated
  CRUD tRPC procedures.
- Added Work/Learn sidebar lanes plus responsive Tickets, Study, and Graph pages.
- The initial standalone frontend type-check exhausted its default Node heap;
  the package's production build script provides a 4 GB heap fallback.
- Backend and frontend production builds passed.
- HTTP smoke checks passed for `/health`, `/tickets`, `/study`, and `/graph`;
  authenticated tRPC correctly returned `401 Unauthorized` without a token.
- Larger-heap standalone TypeScript checks remained resource-bound and were
  stopped after no output; this is recorded as a validation limitation.
- Replaced the graph page's categorized card grid with a responsive SVG node/link
  graph and rebuilt the frontend successfully.
- Completed ticket/study edit, delete, status, loading, and error interactions.
- Added graph node links and explicit loading/error handling.
- Added canonical planning smoke tests for page serving and unauthenticated data
  protection.
- Replaced graph route selection based on translated labels with explicit node
  kinds and a stable root node.
- Final verification passed: planning smoke tests (2/2), backend build,
  frontend build with the configured 4 GB heap, and `git diff --check`.
- Authenticated browser verification passed with a provisioned superuser:
  sign-in redirected to `/`, then `/tickets`, `/study`, and `/graph` rendered
  with their authenticated navigation.
- Removed plaintext password persistence from the sign-in page and added the
  documented `create:superuser` provisioning command.
- The legacy Playwright suite remains blocked when Docker is unavailable; the
  integrated browser runner also lacks its configured Chrome binary.
