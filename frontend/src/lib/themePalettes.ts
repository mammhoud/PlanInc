/**
 * Theme palettes.
 *
 * The default is the "preplixity" palette: the low-contrast teal ink, off-white
 * paper and cyan accent used across the product's reference design. Keeping the
 * palette list in one module means the settings picker, the seeded config, and
 * the runtime fallback cannot drift apart.
 *
 * Since PI-011 · P3 the colours themselves live in `src/styles/tokens.css`
 * (tier 1, `--pi-palette-<key>-<role>`), so a palette is declared once and both
 * the picker and the CSS layer read the same values. These strings are CSS
 * custom-property references and are applied through
 * `element.style.setProperty('--primary', …)` / inline `style`, both of which
 * resolve `var()` normally.
 */
export type ThemePalette = {
  key: string;
  /** i18n label key. */
  label: string;
  /** Primary ("--primary") colour. */
  background: string;
  /** Foreground that stays legible on `background`. */
  foreground: string;
  /** Accent used for chips, graphs and highlights. */
  accent: string;
  /** Page surface for light mode. */
  surface: string;
  /**
   * The hex this palette was migrated from.
   *
   * Settings persisted `themeColor` / `themeForegroundColor` as hex before the
   * token migration, so already-configured installs still hold these values.
   * Matching (and nothing else) has to keep accepting them — see
   * `isThemePaletteSelected`.
   */
  legacyHex: string;
};

export const THEME_PALETTES: ThemePalette[] = [
  {
    key: 'preplixity',
    label: 'palette-preplixity',
    background: 'var(--pi-palette-preplixity-primary)',
    foreground: 'var(--pi-palette-preplixity-on)',
    accent: 'var(--pi-palette-preplixity-accent)',
    surface: 'var(--pi-palette-preplixity-surface)',
    legacyHex: '#20808D', // tokens-ignore: legacy value compatibility map (pre-migration themeColor)
  },
  {
    key: 'ink',
    label: 'palette-ink',
    background: 'var(--pi-palette-ink-primary)',
    foreground: 'var(--pi-palette-ink-on)',
    accent: 'var(--pi-palette-ink-accent)',
    surface: 'var(--pi-palette-ink-surface)',
    legacyHex: '#091717', // tokens-ignore: legacy value compatibility map (pre-migration themeColor)
  },
  {
    key: 'cyan',
    label: 'palette-cyan',
    background: 'var(--pi-palette-cyan-primary)',
    foreground: 'var(--pi-palette-cyan-on)',
    accent: 'var(--pi-palette-cyan-accent)',
    surface: 'var(--pi-palette-cyan-surface)',
    legacyHex: '#1FB8CD', // tokens-ignore: legacy value compatibility map (pre-migration themeColor)
  },
  {
    key: 'amber',
    label: 'palette-amber',
    background: 'var(--pi-palette-amber-primary)',
    foreground: 'var(--pi-palette-amber-on)',
    accent: 'var(--pi-palette-amber-accent)',
    surface: 'var(--pi-palette-amber-surface)',
    legacyHex: '#B4791E', // tokens-ignore: legacy value compatibility map (pre-migration themeColor)
  },
  {
    key: 'violet',
    label: 'palette-violet',
    background: 'var(--pi-palette-violet-primary)',
    foreground: 'var(--pi-palette-violet-on)',
    accent: 'var(--pi-palette-violet-accent)',
    surface: 'var(--pi-palette-violet-surface)',
    legacyHex: '#6D5AE6', // tokens-ignore: legacy value compatibility map (pre-migration themeColor)
  },
];

/** The palette used when nothing has been configured yet. */
export const DEFAULT_THEME_PALETTE = THEME_PALETTES[0];

/**
 * Defaults applied when a palette (or a swatch) arrives without a value.
 *
 * These are tier-1 ramp references rather than literals because they are the
 * *value of an alias*: the code below writes `--primary` itself, so it cannot
 * read that alias for its own fallback. The hexes previously inlined here were
 * `#f9f9f9`, `#000000`, `black` and `hsl(210 40% 98%)`.
 */
const SCOPE_FALLBACKS: { selector: string; primary: string; foreground: string }[] = [
  {
    selector: '.dark',
    primary: 'var(--pi-color-neutral-25)',
    foreground: 'var(--pi-color-ink-1000)',
  },
  {
    selector: '.light',
    primary: 'var(--pi-color-ink-1000)',
    foreground: 'var(--pi-color-mist-50)',
  },
];

/**
 * Apply a palette to the live theme scopes.
 *
 * `.dark` and `.light` both exist in the DOM (one of them inert), and the chosen
 * primary/foreground pair is injected onto each as inline custom properties —
 * that is how a palette selection takes effect without a re-render.
 */
export function applyThemePalette(background?: string, foreground?: string): void {
  if (typeof document === 'undefined') return;
  for (const fallback of SCOPE_FALLBACKS) {
    const element = document.querySelector<HTMLElement>(fallback.selector);
    if (!element) continue;
    element.style.setProperty('--primary', background || fallback.primary);
    element.style.setProperty('--primary-foreground', foreground || fallback.foreground);
  }
}

/**
 * True when a persisted `themeColor` value selects this palette.
 *
 * Accepts the palette key, the token reference, and the hex that pre-migration
 * installs stored — so switching to tokens does not reset anyone's theme.
 */
export function isThemePaletteSelected(value: string | undefined | null, palette: ThemePalette): boolean {
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === palette.key.toLowerCase() ||
    normalized === palette.background.toLowerCase() ||
    normalized === palette.legacyHex.toLowerCase()
  );
}

export function findThemePalette(key: string | undefined | null): ThemePalette | undefined {
  if (!key) return undefined;
  return THEME_PALETTES.find((palette) => isThemePaletteSelected(key, palette));
}
