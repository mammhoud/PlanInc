// Knowledge-graph interactions for the active `frontend/` app.
//
// The graph lives at `frontend/src/pages/graph.tsx` and is rendered by
// `frontend/src/components/PlanIncGraph/PlanincGraph.tsx`; the d3 SVG must be
// reachable and operable without a pointer (role/tabindex/keydown), and its
// camera controls must be present. Seeded tickets/studies give the graph nodes.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from './support.mjs';

test.describe('knowledge graph interactions', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = watchConsole(page);
    await signIn(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors, `page logged errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('renders an accessible graph and camera controls', async ({ page }) => {
    await page.goto('/graph');
    // Decorative icons also render `svg[role="img"]` (with aria-hidden); the
    // graph is the one that carries a label.
    const graph = page.locator('svg[role="img"][aria-label]');
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
