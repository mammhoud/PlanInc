// Playwright setup project (runs before `chromium`, see playwright.config.mjs).
//
// The hermetic server boots with a superuser and planning fixtures already in
// its store, but the resources page needs *attachments* — a file at the root to
// drag and a folder to drop it into. Both are created through the real HTTP
// surface (login + `/api/file/upload` with `destinationFolder`), so the seed
// exercises the same path a user's upload takes rather than writing rows behind
// the app's back.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.PLANINC_E2E_BASE_URL || 'http://127.0.0.1:1112';
const USER = process.env.PLANINC_E2E_USER;
const PASSWORD = process.env.PLANINC_E2E_PASSWORD;
const FOLDER = process.env.PLANINC_E2E_FOLDER || 'e2e-folder';
const ROOT_FILE = process.env.PLANINC_E2E_ROOT_FILE || 'e2e-root-note.txt';

test('seeds a root file and a folder on the isolated instance', async ({ request }) => {
  expect(USER, 'PLANINC_E2E_USER was not resolved by playwright.config.mjs').toBeTruthy();
  expect(PASSWORD, 'PLANINC_E2E_PASSWORD was not resolved by playwright.config.mjs').toBeTruthy();

  const login = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: USER, password: PASSWORD },
  });
  expect(login.ok(), `POST /api/auth/login returned ${login.status()}`).toBeTruthy();

  const body = await login.json();
  const token = body?.tokenData?.token ?? body?.token;
  expect(token, 'login response carried no token').toBeTruthy();

  // A small real fixture, so the attachment has bytes to move around.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixture = readFileSync(path.join(here, '..', 'server', 'seedfiles', 'story.txt'));

  const upload = async (name, fields) => {
    const response = await request.post(`${BASE_URL}/api/file/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        ...fields,
        file: { name, mimeType: 'text/plain', buffer: fixture },
      },
    });
    expect(response.ok(), `POST /api/file/upload (${name}) returned ${response.status()}`).toBeTruthy();
    return response.json();
  };

  await upload(ROOT_FILE, {});
  await upload('e2e-folder-note.txt', { destinationFolder: FOLDER });
});
