// Core-surface smoke: every route an authenticated user can reach must render
// *content*, not merely avoid throwing, and the appearance layer must be applied.
//
// Two guards, because they catch different failures:
//   * the console guard is the executable form of "no errors in the logs" — a
//     throw during render or a rejected promise shows up here rather than only in
//     a browser console nobody is watching;
//   * the content guard catches the quieter failure this suite was extended for:
//     a page that throws inside a route component unmounts the *entire* tree, so
//     "no console errors" is not enough — `/dashboard` rendered a completely
//     blank document (0 elements) and passed a check that only asserted
//     `body` was visible, because a blank page still has a body.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './support.mjs';

// Every `ProtectedRoute` destination in `App.tsx`, plus the unauthenticated
// entry points. Routes that need a record id (`/detail/*`, `/share/:id`,
// `/ai-share/:id`) and the Tauri quick windows (`/quicknote`, `/quickai`,
// `/quicktool`) are covered elsewhere or not part of the web shell.
const ROUTES = [
  '/',
  '/dashboard',
  '/hub',
  '/ai',
  '/resources',
  '/review',
  '/settings',
  '/plugin',
  '/analytics',
  '/tickets',
  '/study',
  '/graph',
  '/all',
];

test.describe('core surfaces', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = watchConsole(page);
    await signIn(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors, `page logged errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  for (const route of ROUTES) {
    test(`renders ${route} with content`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
      // Give the async stores a beat to settle so late errors are caught too.
      await page.waitForTimeout(2_000);

      // A crash inside the route component unmounts the whole tree, so the
      // shell itself disappears — that is the blank-page signature.
      await expect
        .poll(() => page.evaluate(() => document.querySelectorAll('#root *').length), {
          message: `${route} rendered an empty document — the app shell is gone (crash or redirect loop)`,
          timeout: 15_000,
        })
        .toBeGreaterThan(150);

      // …and the routed content inside the shell must not be blank either.
      const mainText = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return null;
        return (main.textContent || '').replace(/\s+/g, ' ').trim();
      });
      expect(mainText, `${route} has no <main> landmark`).not.toBeNull();
      expect((mainText || '').length, `${route} rendered an empty <main>`).toBeGreaterThan(10);
    });
  }

  test('applies the appearance attributes to <html>', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });

    const root = page.locator('html');
    // Written by lib/appearance.ts from the settings registry (PI-011 · P3).
    await expect(root).toHaveAttribute('data-density', /comfortable|compact/);
    await expect(root).toHaveAttribute('data-line-height', /compact|normal|relaxed/);
    await expect(root).toHaveAttribute('data-shadow-style', /flat|soft|strong/);
    await expect(root).toHaveAttribute('data-corner-style', /sharp|rounded/);
    await expect(root).toHaveAttribute('dir', /ltr|rtl/);
  });
});
