import { describe, expect, test } from 'bun:test';
import { formFieldInputSchema } from '../../../routerTrpc/planningField';

describe('planning form field schema', () => {
  test('normalises the key and applies safe defaults', () => {
    const parsed = formFieldInputSchema.parse({ kind: 'ticket', key: '  Estimate ', label: 'Estimate' });

    expect(parsed.key).toBe('estimate');
    expect(parsed.fieldType).toBe('text');
    expect(parsed.options).toEqual([]);
    expect(parsed.required).toBe(false);
    expect(parsed.showInGraph).toBe(false);
    expect(parsed.enabled).toBe(true);
    expect(parsed.sortOrder).toBe(0);
  });

  test('keeps explicit select options and graph visibility', () => {
    const parsed = formFieldInputSchema.parse({
      kind: 'study',
      key: 'difficulty',
      label: 'Difficulty',
      fieldType: 'select',
      options: ['easy', 'hard'],
      showInGraph: true,
      required: true,
    });

    expect(parsed.options).toEqual(['easy', 'hard']);
    expect(parsed.showInGraph).toBe(true);
    expect(parsed.required).toBe(true);
  });

  test('rejects invalid keys and missing labels', () => {
    expect(formFieldInputSchema.safeParse({ kind: 'ticket', key: '1bad', label: 'Bad' }).success).toBe(false);
    expect(formFieldInputSchema.safeParse({ kind: 'ticket', key: 'has space', label: 'Bad' }).success).toBe(false);
    expect(formFieldInputSchema.safeParse({ kind: 'ticket', key: 'ok', label: '' }).success).toBe(false);
  });
});
