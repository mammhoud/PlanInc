import { test, expect } from '@playwright/test';

const canonicalBaseUrl = process.env.PLANINC_TEST_URL || 'http://127.0.0.1:1111';

test.describe('canonical PlanInc planning surfaces', () => {
  test.use({ baseURL: canonicalBaseUrl });

  test('serves dashboard and related planning pages', async ({ page }) => {
    for (const route of ['/dashboard', '/tickets', '/study', '/graph', '/analytics']) {
      await page.goto(route);
      await expect(page).toHaveTitle('PlanInc');
    }
  });

  test('keeps protected planning pages behind authentication', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/signin$/);
  });
});
