// PlanInc frontend e2e — drives the real `frontend/` app plus the Bun/Express
// (`server/`) runtime over HTTP.
//
//   cd . && bunx playwright test
//
// The hermetic suite boots its own server. Two details matter:
//
//   * Isolation comes from the SurrealKV *file path* (`PLANINC_DB_FILE`), not a
//     container, so every run gets a throwaway store under `os.tmpdir()`. The
//     suite can never touch `data/planinc.db`, which the running deployment
//     holds locked.
//   * The chosen port is passed to the spawned server (`PLANINC_PORT`). The
//     default is 1112 rather than the deployment's 1111, and
//     `reuseExistingServer` is off, so an already-running instance is never
//     silently tested. Set `PLANINC_E2E_BASE_URL` (and `reuseExistingServer`
//     via `PLANINC_E2E_REUSE=1`) only when you *mean* to target an existing
//     deployment — that is what `playwright.canonical.config.mjs` is for.
import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PLANINC_E2E_PORT || 1112);
const BASE_URL = process.env.PLANINC_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

const USER = process.env.PLANINC_E2E_USER || 'planinc-e2e';
const PASSWORD = process.env.PLANINC_E2E_PASSWORD || 'planinc-e2e-password';
const FOLDER = process.env.PLANINC_E2E_FOLDER || 'e2e-folder';
const ROOT_FILE = process.env.PLANINC_E2E_ROOT_FILE || 'e2e-root-note.txt';

// Playwright re-evaluates this module inside every worker, so assigning the
// resolved values here is what makes the credentials and folder visible to the
// spec files (`process.env.*`) without them each re-deriving defaults.
process.env.PLANINC_E2E_PORT = String(PORT);
process.env.PLANINC_E2E_BASE_URL = BASE_URL;
process.env.PLANINC_E2E_USER = USER;
process.env.PLANINC_E2E_PASSWORD = PASSWORD;
process.env.PLANINC_E2E_FOLDER = FOLDER;
process.env.PLANINC_E2E_ROOT_FILE = ROOT_FILE;

// One namespace per run, inherited by the webServer and every worker.
const RUN_ID = process.env.PLANINC_E2E_RUN || `${Date.now()}-${process.pid}`;
process.env.PLANINC_E2E_RUN = RUN_ID;
const STORE_DIR = path.join(os.tmpdir(), `planinc_e2e_${RUN_ID}`);
mkdirSync(STORE_DIR, { recursive: true });

const DB_FILE = path.join(STORE_DIR, 'planinc.db');

export default defineConfig({
  testDir: './e2e',
  // `e2e/canonical/` targets a running deployment (see the canonical config);
  // it must not run against the isolated instance.
  testIgnore: ['canonical/**'],
  outputDir: './e2e/.artifacts',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Seeds the isolated store (a root file and a folder) before the specs run.
    { name: 'setup', testMatch: /seed\.setup\.mjs/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      // Project-level testIgnore replaces the config-level one, so the canonical
      // suite exclusion has to be repeated here.
      testIgnore: [/seed\.setup\.mjs/, 'canonical/**'],
    },
  ],
  webServer: {
    // The superuser and planning fixtures must be written *before* the server
    // opens the file — SurrealKV holds a file lock, so this cannot be a later
    // HTTP step. `exec` keeps the server as the shell's only child so Playwright
    // can shut it down cleanly.
    command:
      'bun --env-file ../.env scripts/create-superuser.ts' +
      ' && bun --env-file ../.env scripts/seed-planning-fixtures.ts' +
      ' && exec bun --env-file ../.env index.ts',
    cwd: './server',
    url: `${BASE_URL}/signin`,
    env: {
      PLANINC_PORT: String(PORT),
      PLANINC_DB_FILE: DB_FILE,
      // Relocates uploads/backups/vectors too, so the run never writes into the
      // checkout (`shared/lib/pathConstant.ts`).
      PLANINC_DATA_DIR: STORE_DIR,
      PLANINC_SUPERUSER_NAME: USER,
      PLANINC_SUPERUSER_PASSWORD: PASSWORD,
    },
    reuseExistingServer: process.env.PLANINC_E2E_REUSE === '1',
    timeout: 180_000,
  },
});
