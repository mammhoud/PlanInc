// Redeploy browser smoke — Insights modals, Resources sections, details, nav, agenda.
import { test, expect } from '@playwright/test';
import { signIn, watchConsole } from '../support.mjs';

const BASE_URL = process.env.PLANINC_TEST_URL || 'http://127.0.0.1:1111';
const USER = process.env.PLANINC_TEST_USER;
const PASSWORD = process.env.PLANINC_TEST_PASSWORD;

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test.skip(!USER || !PASSWORD, 'set PLANINC_TEST_USER / PLANINC_TEST_PASSWORD');

test('browser smoke across new surfaces', async ({ page }) => {
  const errors = watchConsole(page);
  const bad = [];
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() >= 400 && (url.includes('/api/') || url.includes('/trpc'))) {
      bad.push(`${res.status()} ${url.slice(0, 180)}`);
    }
  });

  await signIn(page, { baseUrl: BASE_URL, user: USER, password: PASSWORD });

  const paths = [
    '/',
    '/?path=agenda',
    '/?path=agenda&type=note',
    '/?path=agenda&type=todo',
    '/?path=agenda&type=planinc',
    '/?path=notes',
    '/?path=todo',
    '/insights',
    '/analytics',
    '/resources',
    '/tickets',
    '/study',
    '/settings',
    '/graph',
    '/?path=trash',
    '/share/invite/does-not-exist',
  ];

  for (const path of paths) {
    const before = errors.length;
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(700);
    const roots = await page.evaluate(() => document.querySelectorAll('#root *').length);
    console.log('PATH', path, 'roots', roots, 'newErrors', errors.length - before);
    // Invalid invite tokens render a sparse error state by design.
    if (path.includes('/share/invite/')) {
      expect(roots, `${path} rendered empty`).toBeGreaterThan(10);
      continue;
    }
    expect(roots, `${path} rendered empty`).toBeGreaterThan(50);
    expect(errors.length - before, `${path} page errors`).toBe(0);
  }

  // Insights: heading + Analytics/Reports modals
  await page.goto(`${BASE_URL}/insights`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /Insights/i })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Analytics$/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Reports$/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Resources sections + open bin
  await page.goto(`${BASE_URL}/resources`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /Archive/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Agent notes/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Open bin/i })).toBeVisible();
  await page.getByRole('button', { name: /^Archive$/ }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /Agent notes/i }).click();
  await page.waitForTimeout(900);

  // Tickets detail
  await page.goto(`${BASE_URL}/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const ticketTitle = page.locator('button h2').first();
  if (await ticketTitle.count()) {
    await ticketTitle.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // Study detail
  await page.goto(`${BASE_URL}/study`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const studyTitle = page.locator('button h2').first();
  if (await studyTitle.count()) {
    await studyTitle.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // Side nav: Knowledge + System + Bin + Insights present
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const sideText = await page.evaluate(() => document.body?.innerText || '');
  expect(sideText).toMatch(/Knowledge/i);
  expect(sideText).toMatch(/System/i);
  expect(sideText).toMatch(/Insights/i);
  expect(sideText).toMatch(/Recycle Bin|Bin/i);

  // Seeded Agenda pack notes are type PLANINC (0), not NOTE — assert on the merged stream.
  await page.goto(`${BASE_URL}/?path=agenda&type=planinc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const agendaText = await page.evaluate(() => document.body?.innerText || '');
  console.log('AGENDA_HAS_AGENDA_TAG', agendaText.includes('Agenda/'));
  expect(agendaText).toMatch(/Agenda\//);

  // /analytics redirects to /insights
  await page.goto(`${BASE_URL}/analytics`, { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/insights/, { timeout: 15_000 });

  console.log('PAGE_ERRORS', JSON.stringify(errors));
  console.log('BAD_REQUESTS', JSON.stringify([...new Set(bad)]));
  // Invalid invite probes intentionally surface a 500 + console resource error;
  // URL-level 4xx/5xx (except invite) is asserted via `unexpected` below.
  const unexpectedErrors = errors.filter(
    (e) =>
      !/invite|acceptInvite|not found|token|Failed to load resource: the server responded with a status of 500/i.test(
        e,
      ),
  );
  expect(unexpectedErrors).toEqual([]);
  const unexpected = [...new Set(bad)].filter(
    (x) => !x.includes('does-not-exist') && !x.includes('invite') && !x.includes('acceptInvite'),
  );
  expect(unexpected).toEqual([]);
});
