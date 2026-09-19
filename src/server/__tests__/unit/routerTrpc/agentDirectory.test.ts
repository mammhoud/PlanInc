import { describe, expect, test } from 'bun:test';
import { agentDirInputSchema, deriveAgentDirLabel } from '../../../routerTrpc/agentDirectory';

describe('agent directory schema', () => {
  test('applies safe defaults', () => {
    const parsed = agentDirInputSchema.parse({ kind: 'skills', path: '/opt/planinc/skills' });

    expect(parsed.enabled).toBe(true);
    expect(parsed.isDefault).toBe(false);
    expect(parsed.label).toBe('');
  });

  test('accepts absolute, home-relative and windows paths', () => {
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: '/workspaces/planinc' }).success).toBe(true);
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: '~/projects/api' }).success).toBe(true);
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: 'C:\\Projects\\PlanInc' }).success).toBe(true);
  });

  test('rejects traversal, empty and null-byte paths', () => {
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: '../../etc/passwd' }).success).toBe(false);
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: 'foo/../bar' }).success).toBe(false);
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: '   ' }).success).toBe(false);
    expect(agentDirInputSchema.safeParse({ kind: 'working', path: '/tmp/\0bad' }).success).toBe(false);
  });

  test('rejects unknown directory kinds', () => {
    expect(agentDirInputSchema.safeParse({ kind: 'cache', path: '/tmp' }).success).toBe(false);
  });
});

describe('agent directory labels', () => {
  test('falls back to the last path segment', () => {
    expect(deriveAgentDirLabel('', '/opt/planinc/skills')).toBe('skills');
    expect(deriveAgentDirLabel('', '/opt/planinc/skills/')).toBe('skills');
    expect(deriveAgentDirLabel('', 'C:\\Projects\\PlanInc')).toBe('PlanInc');
    expect(deriveAgentDirLabel('', '~/')).toBe('~');
  });

  test('keeps an explicit label', () => {
    expect(deriveAgentDirLabel('  Team skills  ', '/opt/skills')).toBe('Team skills');
  });
});
