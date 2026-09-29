/**
 * Responsive scale (PI-014).
 *
 * One tier list for every target, from a 360px phone to a 2560px display. The
 * tiers are declared here rather than only in CSS so layout decisions in
 * TypeScript (how many card columns, which nav to show) use the same boundaries
 * as the stylesheet — a mismatch between the two is the classic source of
 * "it looks fine until exactly 768px".
 *
 * The same numbers appear in `styles/platform.css` as a comment block; keep them
 * in step (`scripts/check-platform.mjs` asserts this file is contiguous and
 * covers the full range).
 */
import type { FormFactor } from './types';

export type TierName = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

export type Tier = {
  name: TierName;
  /** Inclusive lower bound, in CSS pixels. */
  minWidth: number;
  /** Card columns the reference layout uses at this width. */
  cardColumns: number;
  /**
   * Whether the persistent side navigation fits, i.e. whether the shell renders
   * the sidebar permanently instead of tucking it into a drawer.
   *
   * `md` (768) is **true**: that is the width the shell has always switched at
   * (`useMediaQuery('(min-width: 768px)')` used to decide it), and iPad portrait
   * is exactly 768. The column exists so the shell can ask the tier rather than
   * keep its own copy of the breakpoint — the two had drifted apart.
   */
  sideNav: boolean;
};

export const RESPONSIVE_TIERS: readonly Tier[] = [
  { name: 'xs', minWidth: 360, cardColumns: 1, sideNav: false },
  { name: 'sm', minWidth: 480, cardColumns: 2, sideNav: false },
  { name: 'md', minWidth: 768, cardColumns: 2, sideNav: true },
  { name: 'lg', minWidth: 1024, cardColumns: 3, sideNav: true },
  { name: 'xl', minWidth: 1280, cardColumns: 4, sideNav: true },
  { name: '2xl', minWidth: 1600, cardColumns: 4, sideNav: true },
  { name: '3xl', minWidth: 1920, cardColumns: 5, sideNav: true },
  { name: '4xl', minWidth: 2560, cardColumns: 6, sideNav: true },
];

/** Narrowest width the layout is designed for. */
export const MIN_SUPPORTED_WIDTH = RESPONSIVE_TIERS[0].minWidth;
/** Widest tier's lower bound — the layout keeps scaling above it. */
export const MAX_TIER_WIDTH = RESPONSIVE_TIERS[RESPONSIVE_TIERS.length - 1].minWidth;

/** The tier a viewport width falls into. Widths below `xs` get `xs`. */
export function tierFor(width: number): Tier {
  let match = RESPONSIVE_TIERS[0];
  for (const tier of RESPONSIVE_TIERS) {
    if (width >= tier.minWidth) match = tier;
    else break;
  }
  return match;
}

/** Layout class for a width. Phones are layout, not device, facts. */
export function formFactorFor(width: number): FormFactor {
  if (width < 768) return 'phone';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** The three per-device-class card-column preferences (registry setting ids). */
export type CardColumnPreferences = {
  /** xs/sm — phone-class widths. */
  small: number;
  /** md/lg — tablet-class widths. */
  medium: number;
  /** xl and above — desktop-class widths. */
  large: number;
};

/**
 * Which preference applies at a tier, by device class.
 *
 * Screen-level layouts (the note masonry, the hub feed) ask this instead of
 * carrying their own breakpoints: both had grown their own hard-coded pair
 * (768/1280) plus their own fall-backs, which disagreed with the registry's
 * defaults and ignored the other five tiers entirely.
 */
export function preferredCardColumns(tier: TierName, preferences: CardColumnPreferences): number {
  if (tier === 'xs' || tier === 'sm') return preferences.small;
  if (tier === 'md' || tier === 'lg') return preferences.medium;
  return preferences.large;
}

/** Card columns clamped to the user's preference for the active tier. */
export function cardColumnsFor(width: number, preferred?: number): number {
  const tierColumns = tierFor(width).cardColumns;
  if (preferred === undefined || !Number.isFinite(preferred)) return tierColumns;
  return Math.max(1, Math.min(Math.round(preferred), tierColumns));
}
