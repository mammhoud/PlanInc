// PlanInc canonical deployment smoke — proves a *running* instance answers and
// serves the expected contract. Unlike `playwright.config.mjs` this boots no
// server and touches no store: it only makes requests against `PLANINC_TEST_URL`
// (default `http://127.0.0.1:1111`).
//
//   make test-canonical
//   PLANINC_TEST_URL=https://notes.structa.cloud make test-canonical
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLANINC_TEST_URL || `http://127.0.0.1:${process.env.PLANINC_PORT || 1111}`;

process.env.PLANINC_TEST_URL = BASE_URL;

export default defineConfig({
  testDir: './e2e/canonical',
  outputDir: './e2e/.artifacts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
