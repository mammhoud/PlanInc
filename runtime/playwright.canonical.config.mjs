import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'canonical-planinc.spec.mjs',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLANINC_TEST_URL || 'http://127.0.0.1:1111',
    headless: true,
  },
});
