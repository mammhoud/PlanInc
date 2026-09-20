import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const port = 1112;
// One id per run, shared by the config and the specs. Playwright re-evaluates
// this module inside worker processes (and after a test failure), so the id
// must be inherited rather than recomputed, otherwise the test namespace and
// the seeded admin account would diverge mid-run.
process.env.PLANING_PW_RUN ||= `${Date.now()}-${process.pid}`;
const testNamespace = `planing_test_${process.env.PLANING_PW_RUN}`;
// The runtime opens SurrealDB embedded (`surrealkv://`) and no longer reads
// SURREALDB_URL, so there is no engine container to start: isolation comes from
// pointing SURREALDB_FILE (and UPLOAD_DIR) at a disposable directory instead of
// the deployment store at runtime/data, which the served instance has locked.
const embeddedDir = path.join(os.tmpdir(), `planing_pw_embedded_${process.env.PLANING_PW_RUN}`);
const embeddedFile = path.join(embeddedDir, 'planinc.db');
// Chat context roots point at disposable fixtures so the suite never reads the
// deployed project tree or writes into real documents.
const contextFixture = path.join(os.tmpdir(), `planing_pw_context_${process.env.PLANING_PW_RUN}`);
const fixtureDirs = {
  project: path.join(contextFixture, 'project'),
  documents: path.join(contextFixture, 'documents'),
  notes: path.join(contextFixture, 'notes'),
};
for (const dir of Object.values(fixtureDirs)) fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(fixtureDirs.project, 'nested'), { recursive: true });
fs.writeFileSync(path.join(fixtureDirs.project, 'README.md'), '# Fixture project\n\nThis file is attached to a chat as context.\n');
fs.writeFileSync(path.join(fixtureDirs.project, 'nested', 'deep-notes.md'), '# Deep notes\n\nNested fixture file.\n');
// Binary context fixtures (a PDF with a real text stream and a PNG) are copied
// into the documents root so the suite can attach them like a member would.
const fixtureSource = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tests', 'fixtures');
for (const name of fs.existsSync(fixtureSource) ? fs.readdirSync(fixtureSource) : []) {
  fs.copyFileSync(path.join(fixtureSource, name), path.join(fixtureDirs.documents, name));
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  // Suites that seed their own bootstrap admin (appearance/graph) or register
  // via the API (tickets) run under playwright.extra.config.mjs with their own
  // server + store — they share no "first admin" premise with this config.
  // canonical-planinc targets an already-deployed instance on :1111, so it runs
  // under playwright.canonical.config.mjs and is excluded here to keep this
  // config hermetic.
  testIgnore: '**/{appearance-and-graph,tickets,canonical-planinc}.spec.mjs',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices['Desktop Chrome'] },
  // Web servers launch in array order and each must be ready before the next
  // starts. Tests must never touch the deployed store: the embedded file lives
  // under the run's own temp directory.
  webServer: [
    {
      command: 'node tests/mock-llm.mjs',
      port: 11434,
      reuseExistingServer: false,
      timeout: 15_000,
    },
    {
      command: 'node server.mjs',
      url: `http://127.0.0.1:${port}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        PLANING_PORT: String(port),
        SURREALDB_FILE: embeddedFile,
        SURREALDB_NS: testNamespace,
        SURREALDB_DB: 'auth',
        NEXTAUTH_SECRET: 'playwright-secret',
        UPLOAD_DIR: path.join(embeddedDir, 'uploads'),
        PLANING_CONTEXT_PROJECT_DIR: fixtureDirs.project,
        PLANING_CONTEXT_DOCUMENTS_DIR: fixtureDirs.documents,
        PLANING_CONTEXT_NOTES_DIR: fixtureDirs.notes,
      },
    },
  ],
});
