/**
 * Responsive overrides (PI-014).
 *
 * The tier is derived from the viewport width, which is the right default — but
 * two everyday situations get it wrong: a desktop window dragged narrow, where
 * the shell collapses into a drawer the user never asked for, and a tablet on a
 * keyboard, where the wide layout is wanted with a fine pointer. These three
 * settings let the user overrule the automatic decision without touching the
 * environment facts themselves.
 *
 * The split matters: `responsive.ts` still owns the boundaries, `detect.ts` still
 * owns what the environment can do, and this module only decides which of those
 * answers the shell acts on. `auto` is the default for all three, so an install
 * that never opens the setting behaves exactly as before.
 *
 * Values come from the settings registry (ids `responsiveLayout`, `sideNavMode`,
 * `touchTargets`), so defaults and validation stay owned in one place — this
 * module never invents a fall-back.
 */
import { coerceSettingValue, findSetting } from '@shared/lib/settingsRegistry';
import { RESPONSIVE_TIERS, formFactorFor, tierFor, type Tier } from './responsive';
import type { FormFactor } from './types';

export type LayoutOverride = 'auto' | 'compact' | 'comfortable';
export type SideNavOverride = 'auto' | 'pinned' | 'drawer';
export type PointerOverride = 'auto' | 'coarse' | 'fine';

export type ResponsiveOverrides = {
  layout: LayoutOverride;
  sideNav: SideNavOverride;
  pointer: PointerOverride;
};

/** State key → registry id. The two differ on purpose: ids are config keys. */
const SETTING_IDS = {
  layout: 'responsiveLayout',
  sideNav: 'sideNavMode',
  pointer: 'touchTargets',
} as const;

const DEFAULTS: ResponsiveOverrides = { layout: 'auto', sideNav: 'auto', pointer: 'auto' };

/** The tier the `comfortable` override asks for: the first wide layout. */
const COMFORTABLE_TIER = 'lg';

let current: ResponsiveOverrides = DEFAULTS;
const listeners = new Set<() => void>();

/** Snapshot for `useSyncExternalStore` — a new object only when something changed. */
export function readResponsiveOverrides(): ResponsiveOverrides {
  return current;
}

export function subscribeResponsiveOverrides(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setResponsiveOverrides(next: ResponsiveOverrides): void {
  if (next.layout === current.layout && next.sideNav === current.sideNav && next.pointer === current.pointer) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}

/** Read the three overrides out of a config document, repaired against their schemas. */
export function readResponsiveOverridesFromConfig(config: Record<string, unknown> | undefined): ResponsiveOverrides {
  const read = <K extends keyof ResponsiveOverrides>(key: K): ResponsiveOverrides[K] => {
    const setting = findSetting(SETTING_IDS[key]);
    if (!setting) return DEFAULTS[key];
    return coerceSettingValue(setting, config?.[SETTING_IDS[key]]).value as ResponsiveOverrides[K];
  };
  return { layout: read('layout'), sideNav: read('sideNav'), pointer: read('pointer') };
}

/**
 * Pull the overrides out of a config document and publish them.
 *
 * Called wherever the config becomes known (the user store's appearance sync, and
 * the settings control's optimistic path), so a change takes effect without a
 * reload — the same contract the appearance attributes have.
 */
export function applyResponsiveOverrides(config: Record<string, unknown> | undefined): void {
  setResponsiveOverrides(readResponsiveOverridesFromConfig(config));
}

/** Tier for a width, honouring the layout override. */
export function effectiveTier(width: number, overrides: ResponsiveOverrides = current): Tier {
  if (overrides.layout === 'compact') return RESPONSIVE_TIERS[0];
  const detected = tierFor(width);
  if (overrides.layout === 'comfortable') {
    const comfortable = RESPONSIVE_TIERS.find((tier) => tier.name === COMFORTABLE_TIER) ?? RESPONSIVE_TIERS[0];
    // Never shrink: a viewport already wider than the comfortable tier keeps its
    // own (larger) tier, so the override only ever enlarges the layout.
    return detected.minWidth >= comfortable.minWidth ? detected : comfortable;
  }
  return detected;
}

/** Form factor for a width, honouring the layout override. */
export function effectiveFormFactor(width: number, overrides: ResponsiveOverrides = current): FormFactor {
  if (overrides.layout === 'compact') return 'phone';
  if (overrides.layout === 'comfortable') return 'desktop';
  return formFactorFor(width);
}

/** Whether the persistent side navigation fits, honouring the side-nav override. */
export function effectiveSideNav(tier: Tier, overrides: ResponsiveOverrides = current): boolean {
  if (overrides.sideNav === 'pinned') return true;
  if (overrides.sideNav === 'drawer') return false;
  return tier.sideNav;
}

/**
 * Value of `data-pointer` — the capability `platform.css` keys touch-target size
 * and inert hover states off, not a statement about the hardware.
 */
export function effectivePointer(
  formFactor: FormFactor,
  isNativeShell: boolean,
  overrides: ResponsiveOverrides = current,
): 'coarse' | 'fine' {
  if (overrides.pointer === 'coarse') return 'coarse';
  if (overrides.pointer === 'fine') return 'fine';
  return isNativeShell || formFactor === 'phone' ? 'coarse' : 'fine';
}
