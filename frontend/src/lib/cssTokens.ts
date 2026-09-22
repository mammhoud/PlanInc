/**
 * Read design tokens where CSS cannot reach.
 *
 * Canvas-backed renderers (ECharts and friends) are handed concrete colour
 * strings — a `var(--foreground)` string is not a colour to them — so chart
 * options have to resolve the token themselves. Reading it is also what removes
 * the `isDark ? '#fff' : '#000'` branching from those call sites: the token
 * already carries the active theme's value.
 *
 * Values are NOT cached: the same token resolves differently after a theme
 * switch, and a cached string would keep painting the previous theme.
 */

/** Resolve a design token to its computed value (e.g. `rgb(27, 31, 43)`). */
export function readToken(name: string): string {
  if (typeof document === 'undefined') return '';
  const property = name.startsWith('--') ? name : `--${name}`;
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
}
