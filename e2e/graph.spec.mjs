import { test, expect } from '@playwright/test';

const USER = process.env.PLANINC_E2E_USER;
const PASSWORD = process.env.PLANINC_E2E_PASSWORD;
const BASE_URL = process.env.PLANINC_E2E_BASE_URL || 'http://127.0.0.1:1111';

test.describe('knowledge graph interactions', () => {
  test.skip(!USER || !PASSWORD, 'Set PLANINC_E2E_USER and PLANINC_E2E_PASSWORD to run the graph suite.');

  test.beforeEach(async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: USER, password: PASSWORD },
    });
    expect(response.ok(), `POST /api/auth/login returned ${response.status()}`).toBeTruthy();
    const body = await response.json();
    const tokenData = body?.tokenData?.token ? body.tokenData : { ...body, token: body?.token };
    expect(tokenData?.token, 'login response carried no token').toBeTruthy();
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
      ['planincToken', tokenData],
    );
  });

  test('renders an accessible graph and camera controls', async ({ page }) => {
    await page.goto('/graph');
    const graph = page.locator('svg[role="img"]');
    await expect(graph).toBeVisible({ timeout: 30_000 });
    await expect(graph).toHaveAttribute('aria-label');
    await expect(page.getByRole('button', { name: 'Fit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  test('supports keyboard activation for graph nodes', async ({ page }) => {
    await page.goto('/graph');
    const node = page.locator('svg g[role="button"]').first();
    await expect(node).toBeVisible({ timeout: 30_000 });
    await node.focus();
    await expect(node).toBeFocused();
    await node.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
