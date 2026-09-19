import { describe, expect, test } from 'bun:test';
import {
  CATEGORY_COLOR_PRESETS,
  CATEGORY_ICON_PRESETS,
  categoryInputSchema,
  slugifyCategory,
} from '../../../routerTrpc/planningCategory';

describe('plan category slugs', () => {
  test('derives stable slugs from display names', () => {
    expect(slugifyCategory('Now')).toBe('now');
    expect(slugifyCategory('  Next Up  ')).toBe('next-up');
    expect(slugifyCategory('Deep Work!')).toBe('deep-work');
    expect(slugifyCategory('a   b')).toBe('a-b');
    expect(slugifyCategory('--Edge--')).toBe('edge');
  });

  test('falls back when nothing usable remains', () => {
    expect(slugifyCategory('!!!')).toBe('category');
    expect(slugifyCategory('')).toBe('category');
  });
});

describe('category presets', () => {
  test('are unique and valid hex colours', () => {
    const values = CATEGORY_COLOR_PRESETS.map((preset) => preset.value);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('expose a non-empty icon palette', () => {
    expect(CATEGORY_ICON_PRESETS.length).toBeGreaterThan(3);
    expect(new Set(CATEGORY_ICON_PRESETS).size).toBe(CATEGORY_ICON_PRESETS.length);
  });
});

describe('category input schema', () => {
  test('applies the default colour and icon', () => {
    const parsed = categoryInputSchema.parse({ name: 'Later' });
    expect(parsed.color).toBe('#20808D');
    expect(parsed.icon).toBe('tabler:list-check');
    expect(parsed.enabled).toBe(true);
    expect(parsed.isDefault).toBe(false);
  });

  test('rejects bad colours and slugs', () => {
    expect(categoryInputSchema.safeParse({ name: 'Bad', color: 'teal' }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: 'Bad', slug: 'Not A Slug' }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: '' }).success).toBe(false);
  });

  test('lowercases an explicit slug', () => {
    expect(categoryInputSchema.parse({ name: 'Now', slug: 'now-1' }).slug).toBe('now-1');
  });
});
