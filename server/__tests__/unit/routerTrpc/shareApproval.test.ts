import { describe, expect, test } from 'bun:test';
import { generateShareToken, shareApprovalRouter, shareScope, shareStatus } from '../../../routerTrpc/shareApproval';

describe('share approval schemas', () => {
  test('accepts every layered scope and status', () => {
    for (const scope of ['internal', 'email', 'public']) {
      expect(shareScope.safeParse(scope).success).toBe(true);
    }
    for (const status of ['pending', 'approved', 'rejected', 'revoked']) {
      expect(shareStatus.safeParse(status).success).toBe(true);
    }
  });

  test('rejects unknown scopes and statuses', () => {
    expect(shareScope.safeParse('team').success).toBe(false);
    expect(shareStatus.safeParse('maybe').success).toBe(false);
  });
});

describe('share invite tokens', () => {
  test('are long, urlsafe and unique per request', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateShareToken()));

    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    }
  });
});

describe('share approval router surface', () => {
  test('exposes the layered approval procedures', () => {
    const procedures = Object.keys(shareApprovalRouter._def.procedures);

    for (const name of [
      'policy',
      'inbox',
      'outgoing',
      'pendingAdmin',
      'requestInternal',
      'inviteByEmail',
      'requestPublic',
      'decide',
      'acceptInvite',
      'revoke',
      'setPolicy',
      'forNote',
    ]) {
      expect(procedures).toContain(name);
    }
  });
});
