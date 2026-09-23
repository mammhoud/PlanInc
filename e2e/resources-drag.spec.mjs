// Drag-and-drop port coverage for the active `frontend/` app: the resources page
// (`frontend/src/pages/resources.tsx` + `PlanIncResource/ResourceItem.tsx`) must
// be wired to dnd-kit, and dropping a file onto a folder must move it.
//
// Why this shape:
//   * The drag contracts belong to `frontend/`, so the suite drives the app
//     through the real server rather than a component runner that does not exist
//     for this package.
//   * The seed project (`e2e/seed.setup.mjs`) uploads a *root* file
//     (`PLANINC_E2E_ROOT_FILE`) and a folder (`PLANINC_E2E_FOLDER`), so the drag
//     has an unambiguous source: the root file is the one that must change parent,
//     and asserting placement (not just "a request went out") is what catches the
//     server rejecting the move with "Attachments not found".
import { test, expect } from '@playwright/test';
import { FOLDER, ROOT_FILE, ROOT_FILE_BASE, signIn, watchConsole } from './support.mjs';

test.describe('resources drag and drop (dnd-kit)', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = watchConsole(page);
    await signIn(page);
  });

  test.afterEach(async () => {
    expect(consoleErrors, `page logged errors:\n${consoleErrors.join('\n')}`).toEqual([]);
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
    await page.goto('/resources');

    // Target the seeded root file by name: `.first()` would sometimes pick the
    // file that already lives in the folder, making the assertion vacuous.
    const draggable = page
      .locator('[aria-roledescription="draggable"]')
      .filter({ hasText: ROOT_FILE_BASE })
      .first();
    await expect(draggable, `"${ROOT_FILE}" is not on /resources — seed it first`).toBeVisible({
      timeout: 30_000,
    });

    const folder = page.getByText(FOLDER, { exact: true }).first();
    await expect(folder, `folder "${FOLDER}" is not on /resources — seed it first`).toBeVisible({
      timeout: 30_000,
    });

    // The move is a tRPC mutation; waiting on its response (rather than on "some
    // request happened") is what proves the server accepted it.
    const moveResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('attachments.move'),
      { timeout: 30_000 },
    );

    // dnd-kit's PointerSensor uses a distance activation constraint, so the drag needs a movement
    // past that threshold before the drop target is tracked.
    await draggable.scrollIntoViewIfNeeded();
    const source = await draggable.boundingBox();
    const target = await folder.boundingBox();
    expect(source, 'draggable has no bounding box').toBeTruthy();
    expect(target, 'folder has no bounding box').toBeTruthy();

    const from = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
    const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    // Clear the PointerSensor's 8px activation constraint before steering.
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
    await page.waitForTimeout(150);
    // Walk to the folder in small increments so dnd-kit re-measures the pointer
    // on every move instead of teleporting (which can skip the drop target).
    for (let step = 1; step <= 12; step += 1) {
      const t = step / 12;
      await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(250);
    await page.mouse.up();

    const response = await moveResponse;
    expect(
      response.ok(),
      `POST ${response.url()} failed with ${response.status()} — the server rejected the move`,
    ).toBeTruthy();

    // Placement, not just acceptance: the file must now be listed inside the folder.
    await page.goto(`/resources?folder=${encodeURIComponent(FOLDER)}`);
    await expect(
      page.locator('[aria-roledescription="draggable"]').filter({ hasText: ROOT_FILE_BASE }).first(),
      `"${ROOT_FILE}" was not listed inside "${FOLDER}" after the drop`,
    ).toBeVisible({ timeout: 30_000 });
  });
});
