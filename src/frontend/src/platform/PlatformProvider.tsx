import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectPlatform, readPlatformEnv } from './detect';
import { RESPONSIVE_TIERS, formFactorFor, tierFor, type Tier } from './responsive';
import type { FormFactor, PlatformInfo } from './types';

/**
 * Platform context (PI-014).
 *
 * Components ask this for what the environment can do; CSS reads the mirrored
 * `data-*` attributes. Mirroring matters: a phone in a browser and a phone in
 * the Android app share one layout, but only one of them has a native back
 * button or a system share sheet — those differences belong in CSS and in
 * `capabilities`, not in an `if (isMobile)` scattered across the tree.
 *
 * The Tauri OS plugin is imported lazily so the web build never pulls a native
 * module into its bundle.
 */
type PlatformContextValue = PlatformInfo & {
  /** Active responsive tier. */
  tier: Tier;
  /** Live viewport width in CSS pixels. */
  viewportWidth: number;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

const FALLBACK_VIEWPORT = RESPONSIVE_TIERS[0].minWidth;

function currentViewportWidth(): number {
  if (typeof window === 'undefined') return FALLBACK_VIEWPORT;
  return window.innerWidth;
}

export const PlatformProvider = ({ children }: { children: ReactNode }) => {
  const [nativeOs, setNativeOs] = useState<{ os?: string; hasTauri: boolean }>({ hasTauri: false });
  const [viewportWidth, setViewportWidth] = useState<number>(currentViewportWidth);

  useEffect(() => {
    // Tauri presence is a global set by the native shell before the app boots.
    const hasTauri = typeof window !== 'undefined' && '__TAURI__' in window;
    if (!hasTauri) {
      setNativeOs({ hasTauri: false });
      return;
    }
    let cancelled = false;
    import('@tauri-apps/plugin-os')
      .then(({ platform }) => {
        if (cancelled) return;
        try {
          setNativeOs({ os: platform(), hasTauri: true });
        } catch {
          setNativeOs({ hasTauri: true });
        }
      })
      .catch(() => {
        if (!cancelled) setNativeOs({ hasTauri: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const info = useMemo(
    () => detectPlatform({ ...readPlatformEnv(nativeOs.os, nativeOs.hasTauri), viewportWidth }),
    [nativeOs.os, nativeOs.hasTauri, viewportWidth],
  );

  const tier = useMemo(() => tierFor(viewportWidth), [viewportWidth]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.platform = info.platform;
    root.dataset.os = info.os;
    root.dataset.formFactor = info.formFactor;
    root.dataset.tier = tier.name;
    root.dataset.nativeShell = info.isNativeShell ? 'true' : 'false';
    // The safe-area capability, not the form factor: a desktop-sized window has
    // no insets, and a tablet in a browser may or may not. platform.css keys the
    // notch padding off this so the capability is the source of truth.
    root.dataset.safeArea = info.capabilities.safeAreaInsets ? 'true' : 'false';
    // Read by styles/platform.css for touch target sizes and inert hover states.
    root.dataset.pointer = info.isNativeShell || info.formFactor === 'phone' ? 'coarse' : 'fine';
  }, [
    info.platform,
    info.os,
    info.formFactor,
    info.isNativeShell,
    info.capabilities.safeAreaInsets,
    tier.name,
  ]);

  const value = useMemo<PlatformContextValue>(
    () => ({ ...info, tier, viewportWidth }),
    [info, tier, viewportWidth],
  );

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
};

/** Full platform picture. Throws outside the provider rather than guessing. */
export function usePlatform(): PlatformContextValue {
  const value = useContext(PlatformContext);
  if (!value) throw new Error('usePlatform must be used inside <PlatformProvider>');
  return value;
}

/** The active responsive tier (e.g. to pick a card column count). */
export function useTier(): Tier {
  return usePlatform().tier;
}

/**
 * True when the persistent side navigation fits, i.e. the shell shows the
 * sidebar permanently rather than a drawer.
 *
 * This replaces the ~40 call sites that each had their own
 * `useMediaQuery('(min-width: 768px)')`. Prefer this over comparing widths: the
 * tier decides, and `scripts/check-platform.mjs` fails if a 768px breakpoint
 * reappears anywhere in the app.
 */
export function useSideNav(): boolean {
  return usePlatform().tier.sideNav;
}

/**
 * True on a phone-class viewport (and a phone-class native shell), regardless of
 * what the device actually is.
 *
 * Replaces the scattered `useMediaQuery('(max-width: 768px)')`. Note this is the
 * exact complement of `useSideNav()`: the old pair was not — `max-width: 768px`
 * and `min-width: 768px` both matched at 768 — which is how the bottom bar's
 * spacer could render while the bar itself was hidden.
 */
export function useIsPhone(): boolean {
  return usePlatform().formFactor === 'phone';
}

/** Layout class for the current width. */
export function useFormFactor(): FormFactor {
  return usePlatform().formFactor;
}

/** One capability flag: `useCapability('nativeShare')`. */
export function useCapability<K extends keyof PlatformInfo['capabilities']>(name: K): boolean {
  return usePlatform().capabilities[name];
}

/** True only for the Tauri shells (desktop, Android, iOS). */
export function useIsNativeShell(): boolean {
  return usePlatform().isNativeShell;
}

/** Re-exported for components that only need the mapping, not the context. */
export { formFactorFor };
