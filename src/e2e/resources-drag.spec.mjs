// Covers the drag-and-drop port (product-plan.md §2, task A4): the resources page must be wired to
// dnd-kit, and dropping a file onto a folder must move it.
//
// Why this shape:
//   * The drag contracts belong to the `src/` app, so the suite drives that app through the real
//     server rather than a component runner that does not exist for this package.
//   * The session is obtained from the real `/api/auth/login` endpoint and injected as the store's
//     persisted token (`store/user.ts` → StorageState key `planincToken`). That avoids depending on
//     translated form labels, which are not stable across locales.
//   * The interaction half needs a seeded folder, so it is skipped — with a message — when the
//     environment does not provide one. The wiring half always runs.
import { test, expect } from '@playwright/test';

const USER = process.env.PLANINC_E2E_USER;
const PASSWORD = process.env.PLANINC_E2E_PASSWORD;
const FOLDER = process.env.PLANINC_E2E_FOLDER;
const BASE_URL = process.env.PLANINC_E2E_BASE_URL || 'http://127.0.0.1:1111';

const credentialsMissing = !USER || !PASSWORD;

test.describe('resources drag and drop (dnd-kit)', () => {
  test.skip(credentialsMissing, 'Set PLANINC_E2E_USER and PLANINC_E2E_PASSWORD to run this suite.');

  test.beforeEach(async ({ page }) => {
    const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: { username: USER, password: PASSWORD },
    });
    expect(response.ok(), `POST /api/auth/login returned ${response.status()}`).toBeTruthy();

    const body = await response.json();
    const tokenData = body?.tokenData?.token ? body.tokenData : { ...body, token: body?.token };
    expect(tokenData?.token, 'login response carried no token').toBeTruthy();

    // Same persistence the app itself uses, applied before the app boots.
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
      ['planincToken', tokenData],
    );
  });

  test('resource items are wired as dnd-kit draggables', async ({ page }) => {
    await page.goto('/resources');

    // dnd-kit's default draggable attributes: `aria-roledescription="draggable"` is only present
    // when useDraggable is active on the element, which is exactly what the port replaced.
    const draggables = page.locator('[aria-roledescription="draggable"]');
    await expect.poll(async () => draggables.count(), {
      message: 'no dnd-kit draggables found on /resources — the port is not wired, or the instance has no files',
      timeout: 30_000,
    }).toBeGreaterThan(0);
  });

  test('dragging a file onto a folder moves it into that folder', async ({ page }) => {
    test.skip(!FOLDER, 'Set PLANINC_E2E_FOLDER to the name of a seeded folder to run the drop assertion.');

    const moveRequests = [];
    page.on('request', (request) => {
      const url = request.url();
      if (['POST', 'PATCH', 'PUT'].includes(request.method()) && url.includes('move')) {
        moveRequests.push(url);
      }
    });

    await page.goto('/resources');

    const draggable = page.locator('[aria-roledescription="draggable"]').first();
    await expect(draggable).toBeVisible({ timeout: 30_000 });

    const folder = page.getByText(FOLDER, { exact: true }).first();
    await expect(folder, `folder "${FOLDER}" is not on /resources — seed it first`).toBeVisible({
      timeout: 30_000,
    });

    // dnd-kit's PointerSensor uses a distance activation constraint, so the drag needs a movement
    // past that threshold before the drop target is tracked.
    const source = await draggable.boundingBox();
    const target = await folder.boundingBox();
    expect(source, 'draggable has no bounding box').toBeTruthy();
    expect(target, 'folder has no bounding box').toBeTruthy();

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 20, source.y + source.height / 2 + 20, { steps: 5 });
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => moveRequests.length, {
      message: 'no move request was issued after dropping a file onto a folder',
      timeout: 15_000,
    }).toBeGreaterThan(0);
  });
});
