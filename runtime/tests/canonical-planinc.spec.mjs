// Smoke coverage for an already-running deployment (docker compose, or
// `make run` on http://localhost:1111). The runtime serves one SPA shell for
// every path and routes client-side, so each planning deep link must answer 200
// with the shell and then gate its content behind the account form until a
// session exists. It needs a live instance and therefore runs under
// playwright.canonical.config.mjs, not inside the hermetic `npm test` config.
import { test, expect } from '@playwright/test';

const canonicalBaseUrl = process.env.PLANINC_TEST_URL || 'http://127.0.0.1:1111';

test.describe('canonical PlanInc planning surfaces', () => {
  test.use({ baseURL: canonicalBaseUrl });

  test('serves the shell for every planning route', async ({ page }) => {
    for (const route of ['/dashboard', '/tickets', '/study', '/graph', '/analytics', '/resources']) {
      const response = await page.goto(route);
      expect(response, `no response for ${route}`).toBeTruthy();
      expect(response.status(), `unexpected status for ${route}`).toBe(200);
      // The shell is what the route resolves to; workspace content stays closed.
      await expect(page.locator('#auth-panel')).toBeVisible();
      await expect(page.locator('#app-panel')).toBeHidden();
    }
  });

  test('keeps protected planning pages behind authentication', async ({ page }) => {
    await page.goto('/dashboard');
    // The form itself decides between "create your admin" and "sign in" from
    // whether the instance already has an account, so only the credentials
    // fields are asserted here.
    await expect(page.locator('#auth-form')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#app-panel')).toBeHidden();
  });
});
