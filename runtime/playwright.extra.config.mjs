import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Dedicated config for suites that must not share the main server: the
// appearance/graph specs seed their own bootstrap admin, and tickets.spec.mjs
// registers via the API — both break on the main config where the auth suite
// already owns "first admin". Splitting gives each group its own server +
// SurrealDB namespace pair. Runs sequentially via `npm test`; ports/names are
// distinct so even parallel invocations cannot collide.
const port = 1114;
process.env.PLANING_PW_RUN ||= `${Date.now()}-appearance-${process.pid}`;
const testNamespace = `planing_test_${process.env.PLANING_PW_RUN}`;
// Embedded surrealkv store, disposable per run (see playwright.config.mjs): the
// runtime opens the file itself, so this config needs no engine container and
// must never point at the deployment volume.
const embeddedDir = path.join(os.tmpdir(), `planing_pw_embedded_${process.env.PLANING_PW_RUN}`);
const embeddedFile = path.join(embeddedDir, 'planinc.db');
// Same disposable context fixtures as the main config, under this run's id.
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

export default defineConfig({
  testDir: './tests',
  testMatch: '**/{appearance-and-graph,tickets}.spec.mjs',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices['Desktop Chrome'] },
  webServer: [
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
