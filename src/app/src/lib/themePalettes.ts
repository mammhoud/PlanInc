/**
 * Theme palettes.
 *
 * The default is the "preplixity" palette: the low-contrast teal ink, off-white
 * paper and cyan accent used across the product's reference design. Keeping the
 * palette list in one module means the settings picker, the seeded config, and
 * the runtime fallback cannot drift apart.
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
};

export const THEME_PALETTES: ThemePalette[] = [
  {
    key: 'preplixity',
    label: 'palette-preplixity',
    background: '#20808D',
    foreground: '#FCFCF9',
    accent: '#1FB8CD',
    surface: '#FCFCF9',
  },
  {
    key: 'ink',
    label: 'palette-ink',
    background: '#091717',
    foreground: '#FCFCF9',
    accent: '#20808D',
    surface: '#FCFCF9',
  },
  {
    key: 'cyan',
    label: 'palette-cyan',
    background: '#1FB8CD',
    foreground: '#04201F',
    accent: '#20808D',
    surface: '#F7FDFD',
  },
  {
    key: 'amber',
    label: 'palette-amber',
    background: '#B4791E',
    foreground: '#FFF9EE',
    accent: '#E0A32B',
    surface: '#FFFAF0',
  },
  {
    key: 'violet',
    label: 'palette-violet',
    background: '#6D5AE6',
    foreground: '#F7F5FF',
    accent: '#9C8CFF',
    surface: '#FAF9FF',
  },
];

/** The palette used when nothing has been configured yet. */
export const DEFAULT_THEME_PALETTE = THEME_PALETTES[0];

export function findThemePalette(key: string | undefined | null): ThemePalette | undefined {
  if (!key) return undefined;
  return THEME_PALETTES.find((palette) => palette.key === key || palette.background.toLowerCase() === String(key).toLowerCase());
}
