// PlanInc frontend e2e — drives the `src/` application (React frontend + Bun/Express/tRPC server).
//
//   cd src && bunx playwright test
//
// The React app has no end-to-end harness of its own; this one boots the real server, which serves
// the Vite frontend on the same port (`vite-express`), so the suite exercises the shipped stack
// rather than a mock. Seeded data and credentials come from the environment — see
// `e2e/resources-drag.spec.mjs`, which skips with an explicit message when they are absent.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLANINC_E2E_PORT || 1111);
const BASE_URL = process.env.PLANINC_E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Same entry point the app's own `dev` script uses.
    command: 'bun --env-file ../.env index.ts',
    cwd: './server',
    url: `${BASE_URL}/signin`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
