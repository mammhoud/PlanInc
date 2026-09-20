/**
 * Platform detection (PI-014).
 *
 * `detectPlatform()` is a pure function of a `PlatformEnv` — no globals, no
 * `window`. That is what lets the same logic be exercised for every target
 * offline (`scripts/check-platform.mjs` runs the Windows/macOS/Linux/Android/iOS/
 * browser/PWA matrix), which matters because most of these targets cannot be
 * launched in CI at all.
 */
import { RESPONSIVE_TIERS, formFactorFor } from './responsive';
import type { Capabilities, OsKind, PlatformEnv, PlatformInfo, PlatformKind } from './types';

/** Capabilities per target. One table, so a new platform is one row. */
const CAPABILITIES: Record<PlatformKind, Capabilities> = {
  web: {
    windowControls: false,
    systemTray: false,
    nativeShare: false,
    nativeBack: false,
    safeAreaInsets: true, // browser on a phone still has notches
    serviceWorker: true,
    localDatabase: false,
    nativeFileSystem: false,
    globalShortcuts: false,
    nativeTheme: false,
  },
  pwa: {
    windowControls: false,
    systemTray: false,
    nativeShare: true, // Web Share API
    nativeBack: false,
    safeAreaInsets: true,
    serviceWorker: true,
    localDatabase: true, // offline shell + local-first storage
    nativeFileSystem: false,
    globalShortcuts: false,
    nativeTheme: false,
  },
  desktop: {
    windowControls: true,
    systemTray: true,
    nativeShare: false,
    nativeBack: false,
    safeAreaInsets: false,
    serviceWorker: false, // assets are local; no offline shell needed
    localDatabase: true,
    nativeFileSystem: true,
    globalShortcuts: true,
    nativeTheme: true,
  },
  android: {
    windowControls: false,
    systemTray: false,
    nativeShare: true,
    nativeBack: true,
    safeAreaInsets: true,
    serviceWorker: false,
    localDatabase: true,
    nativeFileSystem: true,
    globalShortcuts: false,
    nativeTheme: true,
  },
  ios: {
    windowControls: false,
    systemTray: false,
    nativeShare: true,
    nativeBack: true,
    safeAreaInsets: true,
    serviceWorker: false,
    localDatabase: true,
    nativeFileSystem: true,
    globalShortcuts: false,
    nativeTheme: true,
  },
};

function osFromTauri(os: string | undefined): OsKind {
  switch (os) {
    case 'windows': return 'windows';
    case 'macos': return 'macos';
    case 'linux': return 'linux';
    case 'android': return 'android';
    case 'ios': return 'ios';
    default: return 'unknown';
  }
}

/** Best-effort OS detection for the browser without any Tauri plugin. */
function osFromUserAgent(ua: string): OsKind {
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/mac os x|macintosh/i.test(ua)) return 'macos';
  if (/linux|x11|cros/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectPlatformKind(env: PlatformEnv, os: OsKind, standalone: boolean): PlatformKind {
  if (env.hasTauri || env.tauriOs) {
    if (os === 'android') return 'android';
    if (os === 'ios') return 'ios';
    return 'desktop';
  }
  return standalone ? 'pwa' : 'web';
}

/** Resolve the full platform picture for an environment. */
export function detectPlatform(env: PlatformEnv): PlatformInfo {
  const os = env.tauriOs ? osFromTauri(env.tauriOs) : osFromUserAgent(env.userAgent);
  const standalone = Boolean(env.standalone || env.displayModeStandalone);
  const platform = detectPlatformKind(env, os, standalone);
  const formFactor = formFactorFor(env.viewportWidth);

  const capabilities = { ...CAPABILITIES[platform] };
  // A browser tab cannot use the Web Share API everywhere, and an iOS web app
  // gets safe areas but no service worker; keep the table honest about the
  // environment rather than the nominal target.
  if (platform === 'pwa' && env.hasServiceWorker === false) capabilities.serviceWorker = false;
  if (platform === 'pwa' && os === 'ios') capabilities.serviceWorker = false;
  if (platform === 'web' && env.hasServiceWorker === false) capabilities.serviceWorker = false;
  if (platform === 'web' && os !== 'ios' && os !== 'android') capabilities.safeAreaInsets = false;

  return {
    platform,
    os,
    formFactor,
    isNativeShell: platform === 'desktop' || platform === 'android' || platform === 'ios',
    capabilities,
  };
}

/**
 * Read the live environment in a browser. Kept separate from `detectPlatform`
 * so the logic stays testable; this is the only part that touches globals.
 */
export function readPlatformEnv(tauriOs?: string, hasTauri?: boolean): PlatformEnv {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { userAgent: '', viewportWidth: RESPONSIVE_TIERS[0].minWidth, tauriOs, hasTauri };
  }
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone;
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    viewportWidth: window.innerWidth,
    standalone: iosStandalone === true,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    tauriOs,
    hasTauri,
    hasServiceWorker: typeof navigator.serviceWorker !== 'undefined',
  };
}
