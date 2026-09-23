// Shared e2e helpers.
//
// The session is obtained from the real `/api/auth/login` endpoint and injected
// as the store's persisted token (`frontend/src/store/user.ts` → StorageState key
// `planincToken`). That avoids depending on translated form labels, which are
// not stable across locales.
import { expect } from '@playwright/test';

export const BASE_URL = process.env.PLANINC_E2E_BASE_URL || 'http://127.0.0.1:1112';
export const USER = process.env.PLANINC_E2E_USER;
export const PASSWORD = process.env.PLANINC_E2E_PASSWORD;
export const FOLDER = process.env.PLANINC_E2E_FOLDER || 'e2e-folder';
// The seeded root file, and the base name the UI renders for it (the card splits
// the name and the extension into separate spans, so text matching uses the base).
export const ROOT_FILE = process.env.PLANINC_E2E_ROOT_FILE || 'e2e-root-note.txt';
export const ROOT_FILE_BASE = ROOT_FILE.replace(/\.[^.]*$/, '');

/**
 * Log in over HTTP and persist the token before the app boots.
 *
 * `overrides` lets the canonical suite (which targets a running deployment at
 * `PLANINC_TEST_URL` with its own credentials) reuse the same localStorage
 * contract instead of duplicating it.
 */
export async function signIn(page, overrides = {}) {
  const baseUrl = overrides.baseUrl || BASE_URL;
  const username = overrides.user || USER;
  const password = overrides.password || PASSWORD;
  const response = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: { username, password },
  });
  expect(
    response.ok(),
    `POST ${baseUrl}/api/auth/login returned ${response.status()}`,
  ).toBeTruthy();

  const body = await response.json();
  const tokenData = body?.tokenData?.token ? body.tokenData : { ...body, token: body?.token };
  expect(tokenData?.token, 'login response carried no token').toBeTruthy();

  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, JSON.stringify(value)),
    ['planincToken', tokenData],
  );
}

/**
 * Browser noise that is not an application fault: the dev server has no route
 * for the favicon, and aborted image/stream probes are a normal consequence of
 * navigating away mid-request.
 */
const IGNORED = [
  /favicon/i,
  /net::ERR_ABORTED/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  // react-burger-menu probes for its wrap elements in componentDidMount, which
  // runs before React has committed the sibling <main id="page-wrap">. The
  // library logs a notice but the menu still works; it is mount-order noise,
  // not an application fault.
  /Element with ID '(page-wrap|outer-container)' not found/,
  // `rctx-contextmenu` still declares `defaultProps` on a function component;
  // React logs the deprecation itself, so it cannot be fixed from app code.
  /Support for defaultProps will be removed/,
];

/** Collect console errors and uncaught page errors for later assertion. */
export function watchConsole(page) {
  const errors = [];
  const record = (text) => {
    if (IGNORED.some((rx) => rx.test(text))) return;
    errors.push(text);
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') record(msg.text());
  });
  // `stack` names the throwing frame, which is what makes an uncaught error
  // actionable rather than just a message.
  page.on('pageerror', (error) => record(String(error?.stack || error?.message || error)));
  return errors;
}
