// Canonical deployment smoke (see playwright.canonical.config.mjs).
//
// These assertions mirror `server/__tests__/e2e/planning-features.test.ts`, but
// over a browser request context so they can run from the same command the rest
// of the suite uses. The credential-free checks must pass on any running
// deployment; the authenticated content check only runs when credentials are
// supplied, so the suite stays usable from a checkout without secrets.
import { test, expect } from '@playwright/test';
import { signIn } from '../support.mjs';

const BASE_URL = process.env.PLANINC_TEST_URL || 'http://127.0.0.1:1111';

const USER = process.env.PLANINC_TEST_USER;
const PASSWORD = process.env.PLANINC_TEST_PASSWORD;

test.describe('running deployment', () => {
  test('serves the canonical pages', async ({ request }) => {
    for (const route of ['/signin', '/dashboard', '/tickets', '/study', '/graph', '/analytics']) {
      const response = await request.get(`${BASE_URL}${route}`);
      expect(response.status(), `GET ${route}`).toBe(200);
      expect(await response.text(), `${route} body`).toContain('<title>PlanInc');
    }
  });

  test('protects ticket and study data procedures', async ({ request }) => {
    for (const procedure of ['tickets.list', 'study.list']) {
      const response = await request.get(`${BASE_URL}/api/trpc/${procedure}?input=%7B%7D`);
      expect(response.status(), `GET /api/trpc/${procedure}`).toBe(401);
    }
  });

  test('rejects invalid credentials without disclosing account details', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: 'unknown-user', password: 'invalid-password' },
    });
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'User not found' });
  });

  test.describe('authenticated pages', () => {
    test.skip(
      !USER || !PASSWORD,
      'set PLANINC_TEST_USER / PLANINC_TEST_PASSWORD to check authenticated pages',
    );

    for (const route of ['/dashboard', '/resources', '/tickets', '/graph', '/settings']) {
      test(`${route} renders content on the deployment`, async ({ page }) => {
        await signIn(page, { baseUrl: BASE_URL, user: USER, password: PASSWORD });
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(2_000);

        // Same guard as the hermetic smoke suite: a crash inside a route
        // component unmounts the whole tree, and a blank document is not a 200.
        await expect
          .poll(() => page.evaluate(() => document.querySelectorAll('#root *').length), {
            message: `${route} rendered an empty document on ${BASE_URL}`,
            timeout: 15_000,
          })
          .toBeGreaterThan(150);

        const mainText = await page.evaluate(() => {
          const main = document.querySelector('main');
          return main ? (main.textContent || '').replace(/\s+/g, ' ').trim() : null;
        });
        expect(mainText, `${route} has no <main> landmark`).not.toBeNull();
        expect((mainText || '').length, `${route} rendered an empty <main>`).toBeGreaterThan(10);
      });
    }
  });
});
