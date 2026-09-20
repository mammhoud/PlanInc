/**
 * Appearance state (PI-011 · P3).
 *
 * Appearance v2 settings are *tokens plus attributes*, not component props:
 * density, interface scale, line height, direction, reduced motion and contrast
 * boost are applied to `<html>` so every surface — including third-party ones
 * (Vditor, ECharts, HeroUI) — picks them up without a prop being threaded
 * through the tree.
 *
 * The values are read from the settings registry, which owns their defaults and
 * validation, so this module never invents a fall-back.
 */
import { coerceSettingValue, findSetting } from '@shared/lib/settingsRegistry';

export type AppearanceState = {
  density: 'comfortable' | 'compact';
  /** Percentage, 85–125. */
  uiScale: number;
  lineHeight: 'compact' | 'normal' | 'relaxed';
  direction: 'auto' | 'ltr' | 'rtl';
  reduceMotion: boolean;
  contrastBoost: boolean;
};

/** Languages written right-to-left, used when direction is 'auto'. */
const RTL_LANGUAGES = ['ar', 'fa', 'he', 'ur'];

/** Read one registry setting out of a raw config, repaired against its schema. */
function read<K extends keyof AppearanceState>(config: Record<string, unknown> | undefined, id: K): AppearanceState[K] {
  const setting = findSetting(id as string);
  if (!setting) throw new Error(`unknown appearance setting: ${String(id)}`);
  return coerceSettingValue(setting, config?.[String(id)]).value as AppearanceState[K];
}

/** The appearance state declared by a config document. */
export function readAppearance(config: Record<string, unknown> | undefined): AppearanceState {
  return {
    density: read(config, 'density'),
    uiScale: read(config, 'uiScale'),
    lineHeight: read(config, 'lineHeight'),
    direction: read(config, 'direction'),
    reduceMotion: read(config, 'reduceMotion'),
    contrastBoost: read(config, 'contrastBoost'),
  };
}

/** Resolve `auto` against the active language. */
export function resolveDirection(direction: AppearanceState['direction'], language?: string): 'ltr' | 'rtl' {
  if (direction === 'rtl') return 'rtl';
  if (direction === 'ltr') return 'ltr';
  const base = (language ?? '').toLowerCase().split('-')[0];
  return RTL_LANGUAGES.includes(base) ? 'rtl' : 'ltr';
}

/**
 * Apply the state to the document.
 *
 * Everything lands as a `data-*` attribute plus the `dir` attribute; the CSS in
 * `globals.css` turns those into token overrides, which is why a new appearance
 * control needs a token and a selector — not a change in every component.
 * Safe to call before mount or during SSR: it no-ops without a document.
 */
export function applyAppearance(state: AppearanceState, language?: string): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.dataset.density = state.density;
  root.dataset.lineHeight = state.lineHeight;
  root.dataset.reduceMotion = state.reduceMotion ? 'true' : 'false';
  root.dataset.contrastBoost = state.contrastBoost ? 'true' : 'false';
  root.style.setProperty('--pi-ui-scale', String(state.uiScale / 100));

  const direction = resolveDirection(state.direction, language);
  root.setAttribute('dir', direction);
  root.dataset.direction = direction;
}
