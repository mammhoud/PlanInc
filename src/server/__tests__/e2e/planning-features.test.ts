import { describe, expect, setDefaultTimeout, test } from 'bun:test';

const BASE_URL = process.env.PLANINC_TEST_URL ?? 'http://localhost:1111';
setDefaultTimeout(30_000);

describe('planning feature smoke tests', () => {
  test('serves the planning pages from the canonical app', async () => {
    for (const route of ['/tickets', '/study', '/graph']) {
      const response = await fetch(`${BASE_URL}${route}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>PlanInc');
    }
  });

  test('protects ticket and study data procedures', async () => {
    for (const procedure of ['tickets.list', 'study.list']) {
      const response = await fetch(`${BASE_URL}/api/trpc/${procedure}?input=%7B%7D`);
      expect(response.status).toBe(401);
    }
  });

  test('rejects invalid credentials without disclosing account details', async () => {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'unknown-user', password: 'invalid-password' }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'User not found' });
  });
});
