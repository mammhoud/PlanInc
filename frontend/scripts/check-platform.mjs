#!/usr/bin/env node
/**
 * check-platform.mjs — PI-014 · single-frontend platform proof
 *
 * One directory (`frontend`) builds every target this product ships to:
 * web browser · installed PWA · Tauri desktop (Windows/macOS/Linux) · Tauri
 * mobile (Android/iOS), across 360px → 2560px.
 *
 * The targets that matter most cannot be launched here (no iOS simulator, no
 * Android device, no Windows runner), so the adaptation logic is a pure
 * function of an injectable environment and this script exercises it offline.
 * It asserts:
 *
 *    1. matrix          13 environments resolve to the expected platform, OS,
 *                       form factor and capabilities
 *    2. offline rule    no native shell ever registers a service worker, and
 *                       every shell that can be offline-only has localDatabase
 *    3. capability set  every platform defines every capability (no undefined)
 *    4. safe areas      insets are on exactly for the targets that have them
 *    5. tiers           the 8 tiers are contiguous, ascending, 360 → 2560, and
 *                       every boundary maps to the tier it names
 *    6. form factor     phone/tablet/desktop boundaries agree with md/lg tiers
 *    7. columns         the preferred column count is clamped to the tier
 *    8. css ↔ ts        platform.css's documented boundaries match responsive.ts,
 *                       and it has a rule for every tier name
 *    9. attributes      every data-* the provider writes is styled, and every
 *                       data-* platform.css selects on is one the provider writes
 *   10. wiring         the single directory is actually the one that builds and
 *                       deploys — vite outDir == tauri frontendDist == server
 *                       static path, and no `app/` frontend remains anywhere
 *   11. tauri deps     every `@tauri-apps/*` module the frontend imports is a
 *                       declared dependency AND registered in the Rust shell, and
 *                       desktop-only plugins stay inside the mobile gate — a JS
 *                       plugin with no Rust registration only fails on a real
 *                       device, which is the one place this cannot be seen
 *   12. shell wiring   the platform layer is *consumed*, not merely available:
 *                       every `pi-*` rule in platform.css has a real consumer,
 *                       every `pi-*` class a component renders is defined there,
 *                       and no layout component keeps its own copy of the 768px
 *                       breakpoint
 *
 * Usage: node scripts/check-platform.mjs [--quiet]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { register } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..'); //  frontend
const SRC = join(APP, '..'); //  src
const PLANINC = join(SRC, '..'); //  application/tools/PlanInc

// Node ≥ 22.6 strips the types; the hook supplies the extensions a bundler
// would have resolved (see ts-resolve.mjs). Registered before the import below.
register('./ts-resolve.mjs', import.meta.url);

const { detectPlatform, readPlatformEnv } = await import(pathToFileURL(join(APP, 'src/platform/detect.ts')).href);
const {
  RESPONSIVE_TIERS, MIN_SUPPORTED_WIDTH, MAX_TIER_WIDTH, tierFor, formFactorFor, cardColumnsFor,
} = await import(pathToFileURL(join(APP, 'src/platform/responsive.ts')).href);

const quiet = process.argv.includes('--quiet');
const failures = [];
const warnings = [];
const ok = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const failed = (check) => failures.some((f) => f.startsWith(`[${check}]`));

/* --------------------------------------------------------- 1–4: the matrix */

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
};

const NATIVE_ONLY = { windowControls: false, systemTray: false, nativeShare: false, nativeBack: false, globalShortcuts: false };
const MOBILE_ONLY = { windowControls: false, systemTray: false, globalShortcuts: false };

/**
 * Every shipping environment. `expect` lists only what is load-bearing per row;
 * the capability-completeness check (3) covers everything else.
 */
const MATRIX = [
  {
    name: 'desktop web · Windows Chrome 1920',
    env: { userAgent: UA.windows, viewportWidth: 1920, hasServiceWorker: true },
    expect: { platform: 'web', os: 'windows', formFactor: 'desktop', tier: '3xl',
      caps: { ...NATIVE_ONLY, serviceWorker: true, localDatabase: false, nativeFileSystem: false, safeAreaInsets: false } },
  },
  {
    name: 'desktop web · macOS Safari 1440',
    env: { userAgent: UA.macos, viewportWidth: 1440, hasServiceWorker: true },
    expect: { platform: 'web', os: 'macos', formFactor: 'desktop', tier: 'xl',
      caps: { ...NATIVE_ONLY, serviceWorker: true, safeAreaInsets: false } },
  },
  {
    name: 'desktop web · Linux 1280',
    env: { userAgent: UA.linux, viewportWidth: 1280, hasServiceWorker: true },
    expect: { platform: 'web', os: 'linux', formFactor: 'desktop', tier: 'xl',
      caps: { ...NATIVE_ONLY, serviceWorker: true, safeAreaInsets: false } },
  },
  {
    name: 'ultrawide web · Linux 2560',
    env: { userAgent: UA.linux, viewportWidth: 2560, hasServiceWorker: true },
    expect: { platform: 'web', os: 'linux', formFactor: 'desktop', tier: '4xl',
      caps: { ...NATIVE_ONLY, serviceWorker: true, safeAreaInsets: false } },
  },
  {
    // A phone in a browser tab: phone LAYOUT, but no native back button and no
    // share sheet — the distinction the capability table exists to make.
    name: 'phone web · Android Chrome 412 (browser tab)',
    env: { userAgent: UA.android, viewportWidth: 412, hasServiceWorker: true },
    expect: { platform: 'web', os: 'android', formFactor: 'phone', tier: 'xs',
      caps: { ...NATIVE_ONLY, serviceWorker: true, localDatabase: false, safeAreaInsets: true } },
  },
  {
    name: 'phone web · iOS Safari 390 (browser tab)',
    env: { userAgent: UA.iphone, viewportWidth: 390, hasServiceWorker: true },
    expect: { platform: 'web', os: 'ios', formFactor: 'phone', tier: 'xs',
      caps: { ...NATIVE_ONLY, serviceWorker: true, safeAreaInsets: true } },
  },
  {
    name: 'tablet web · iPad Safari 834',
    env: { userAgent: UA.ipad, viewportWidth: 834, hasServiceWorker: true },
    expect: { platform: 'web', os: 'ios', formFactor: 'tablet', tier: 'md',
      caps: { ...NATIVE_ONLY, serviceWorker: true, safeAreaInsets: true } },
  },
  {
    name: 'installed PWA · Android 412 (display-mode standalone)',
    env: { userAgent: UA.android, viewportWidth: 412, displayModeStandalone: true, hasServiceWorker: true },
    expect: { platform: 'pwa', os: 'android', formFactor: 'phone', tier: 'xs',
      caps: { ...MOBILE_ONLY, nativeShare: true, serviceWorker: true, localDatabase: true, safeAreaInsets: true } },
  },
  {
    // iOS standalone web apps get no service worker on our capability table;
    // that is a deliberate environment fact, not an oversight.
    name: 'installed PWA · iOS 390 (display-mode standalone)',
    env: { userAgent: UA.iphone, viewportWidth: 390, displayModeStandalone: true, hasServiceWorker: true },
    expect: { platform: 'pwa', os: 'ios', formFactor: 'phone', tier: 'xs',
      caps: { ...MOBILE_ONLY, nativeShare: true, serviceWorker: false, localDatabase: true, safeAreaInsets: true } },
  },
  {
    // iOS also reports standalone via navigator.standalone.
    name: 'installed PWA · iOS 390 (navigator.standalone)',
    env: { userAgent: UA.iphone, viewportWidth: 390, standalone: true, hasServiceWorker: true },
    expect: { platform: 'pwa', os: 'ios', formFactor: 'phone', tier: 'xs',
      caps: { ...MOBILE_ONLY, nativeShare: true, serviceWorker: false, localDatabase: true, safeAreaInsets: true } },
  },
  {
    name: 'Tauri desktop · Windows 1600',
    env: { userAgent: UA.windows, viewportWidth: 1600, hasTauri: true, tauriOs: 'windows', hasServiceWorker: false },
    expect: { platform: 'desktop', os: 'windows', formFactor: 'desktop', tier: '2xl',
      caps: { windowControls: true, systemTray: true, nativeShare: false, nativeBack: false, globalShortcuts: true,
        serviceWorker: false, localDatabase: true, nativeFileSystem: true, safeAreaInsets: false } },
  },
  {
    name: 'Tauri desktop · macOS 1440',
    env: { userAgent: UA.macos, viewportWidth: 1440, hasTauri: true, tauriOs: 'macos', hasServiceWorker: false },
    expect: { platform: 'desktop', os: 'macos', formFactor: 'desktop', tier: 'xl',
      caps: { windowControls: true, systemTray: true, nativeShare: false, nativeBack: false, globalShortcuts: true,
        serviceWorker: false, localDatabase: true, nativeFileSystem: true, safeAreaInsets: false } },
  },
  {
    name: 'Tauri desktop · Linux 1280',
    env: { userAgent: UA.linux, viewportWidth: 1280, hasTauri: true, tauriOs: 'linux', hasServiceWorker: false },
    expect: { platform: 'desktop', os: 'linux', formFactor: 'desktop', tier: 'xl',
      caps: { windowControls: true, systemTray: true, nativeShare: false, nativeBack: false, globalShortcuts: true,
        serviceWorker: false, localDatabase: true, nativeFileSystem: true, safeAreaInsets: false } },
  },
  {
    name: 'Tauri mobile · Android 412',
    env: { userAgent: UA.android, viewportWidth: 412, hasTauri: true, tauriOs: 'android', hasServiceWorker: false },
    expect: { platform: 'android', os: 'android', formFactor: 'phone', tier: 'xs',
      caps: { ...MOBILE_ONLY, nativeShare: true, nativeBack: true, serviceWorker: false, localDatabase: true,
        nativeFileSystem: true, safeAreaInsets: true } },
  },
  {
    name: 'Tauri mobile · iOS 390',
    env: { userAgent: UA.iphone, viewportWidth: 390, hasTauri: true, tauriOs: 'ios', hasServiceWorker: false },
    expect: { platform: 'ios', os: 'ios', formFactor: 'phone', tier: 'xs',
      caps: { ...MOBILE_ONLY, nativeShare: true, nativeBack: true, serviceWorker: false, localDatabase: true,
        nativeFileSystem: true, safeAreaInsets: true } },
  },
];

/** The full capability key set, so a new flag cannot be left undefined. */
const CAPABILITY_KEYS = [
  'windowControls', 'systemTray', 'nativeShare', 'nativeBack', 'safeAreaInsets',
  'serviceWorker', 'localDatabase', 'nativeFileSystem', 'globalShortcuts', 'nativeTheme',
];

const resolvedRows = [];
for (const row of MATRIX) {
  const info = detectPlatform(row.env);
  const tier = tierFor(row.env.viewportWidth);
  resolvedRows.push({ row, info, tier });

  const where = row.name;
  if (info.platform !== row.expect.platform) fail('matrix', `${where}: platform ${info.platform} ≠ ${row.expect.platform}`);
  if (info.os !== row.expect.os) fail('matrix', `${where}: os ${info.os} ≠ ${row.expect.os}`);
  if (info.formFactor !== row.expect.formFactor) fail('matrix', `${where}: formFactor ${info.formFactor} ≠ ${row.expect.formFactor}`);
  if (tier.name !== row.expect.tier) fail('matrix', `${where}: tier ${tier.name} ≠ ${row.expect.tier}`);

  const shouldBeShell = ['desktop', 'android', 'ios'].includes(row.expect.platform);
  if (info.isNativeShell !== shouldBeShell) fail('matrix', `${where}: isNativeShell ${info.isNativeShell} ≠ ${shouldBeShell}`);

  for (const [key, value] of Object.entries(row.expect.caps ?? {})) {
    if (info.capabilities[key] !== value) {
      fail('matrix', `${where}: capabilities.${key} = ${info.capabilities[key]} ≠ ${value}`);
    }
  }

  // 3 — completeness
  for (const key of CAPABILITY_KEYS) {
    if (typeof info.capabilities[key] !== 'boolean') {
      fail('capability-set', `${where}: capabilities.${key} is ${typeof info.capabilities[key]}`);
    }
  }
}
if (!failed('matrix')) ok.push(`matrix: ${MATRIX.length} environments resolve as specified`);
if (!failed('capability-set')) ok.push(`capability set: all ${CAPABILITY_KEYS.length} flags defined on all ${MATRIX.length} environments`);

/* 2 — the offline rule. A service worker inside a Tauri shell would serve a
 * stale bundle past the updater; this is the regression that must never ship. */
for (const { row, info } of resolvedRows) {
  if (info.isNativeShell && info.capabilities.serviceWorker) {
    fail('offline-rule', `${row.name}: native shell has serviceWorker enabled`);
  }
  if (info.isNativeShell && !info.capabilities.localDatabase) {
    fail('offline-rule', `${row.name}: native shell has no local database`);
  }
}
// The boot path in main.tsx must consult the capability, not guess from the UA.
const mainTsx = readFileSync(join(APP, 'src/main.tsx'), 'utf8');
if (!/registerOfflineShell/.test(mainTsx)) fail('offline-rule', 'main.tsx never calls registerOfflineShell');
if (!/__TAURI__/.test(mainTsx)) fail('offline-rule', 'main.tsx does not probe __TAURI__ before registering the worker');
if (!/'PROD'|\.PROD\b/.test(mainTsx)) warnings.push('main.tsx registers the offline shell outside import.meta.env.PROD');
if (!failed('offline-rule')) ok.push('offline rule: no native shell registers a service worker');

/* 4 — safe areas exactly match the targets that have insets. */
for (const { row, info } of resolvedRows) {
  const expected = ['phone', 'tablet'].includes(info.formFactor)
    ? info.platform !== 'desktop'
    : info.platform === 'pwa' || info.platform === 'android' || info.platform === 'ios';
  if (info.capabilities.safeAreaInsets !== expected) {
    fail('safe-areas', `${row.name}: safeAreaInsets ${info.capabilities.safeAreaInsets} ≠ ${expected}`);
  }
}
// Insets are only non-zero when the viewport opts in.
const indexHtml = readFileSync(join(APP, 'index.html'), 'utf8');
if (!/viewport-fit=cover/.test(indexHtml)) {
  fail('safe-areas', 'index.html viewport meta lacks viewport-fit=cover — env(safe-area-inset-*) would be 0');
}
if (!failed('safe-areas')) ok.push('safe areas: insets are on exactly for notch-bearing targets, viewport-fit=cover present');

/* --------------------------------------------------------------- 5–7: tiers */

const first = RESPONSIVE_TIERS[0];
const last = RESPONSIVE_TIERS[RESPONSIVE_TIERS.length - 1];
if (first.minWidth !== 360) fail('tiers', `narrowest tier starts at ${first.minWidth}, expected 360`);
if (last.minWidth !== 2560) fail('tiers', `widest tier starts at ${last.minWidth}, expected 2560`);
if (MIN_SUPPORTED_WIDTH !== 360) fail('tiers', `MIN_SUPPORTED_WIDTH = ${MIN_SUPPORTED_WIDTH}`);
if (MAX_TIER_WIDTH !== 2560) fail('tiers', `MAX_TIER_WIDTH = ${MAX_TIER_WIDTH}`);
for (let i = 1; i < RESPONSIVE_TIERS.length; i++) {
  const prev = RESPONSIVE_TIERS[i - 1];
  const curr = RESPONSIVE_TIERS[i];
  if (curr.minWidth <= prev.minWidth) fail('tiers', `${curr.name} (${curr.minWidth}) does not advance past ${prev.name} (${prev.minWidth})`);
  if (curr.cardColumns < prev.cardColumns) fail('tiers', `${curr.name} has fewer columns (${curr.cardColumns}) than ${prev.name} (${prev.cardColumns})`);
  if (!curr.sideNav && prev.sideNav) fail('tiers', `${curr.name} drops the side nav that ${prev.name} has`);
}
const tierNames = new Set(RESPONSIVE_TIERS.map((t) => t.name));
if (tierNames.size !== RESPONSIVE_TIERS.length) fail('tiers', 'duplicate tier names');

// Every boundary resolves to the tier it names; one pixel below does not.
for (const tier of RESPONSIVE_TIERS) {
  if (tierFor(tier.minWidth).name !== tier.name) {
    fail('tiers', `tierFor(${tier.minWidth}) = ${tierFor(tier.minWidth).name} ≠ ${tier.name}`);
  }
  if (tier.minWidth > MIN_SUPPORTED_WIDTH && tierFor(tier.minWidth - 1).name === tier.name) {
    fail('tiers', `tierFor(${tier.minWidth - 1}) incorrectly reports ${tier.name}`);
  }
}
// Below the floor, and above the last tier, clamp rather than break.
for (const width of [0, 200, 320, 359]) {
  if (tierFor(width).name !== 'xs') fail('tiers', `tierFor(${width}) = ${tierFor(width).name}, expected to clamp to xs`);
}
for (const width of [2560, 3200, 5000]) {
  if (tierFor(width).name !== '4xl') fail('tiers', `tierFor(${width}) = ${tierFor(width).name}, expected to clamp to 4xl`);
}
if (!failed('tiers')) ok.push(`tiers: ${RESPONSIVE_TIERS.length} contiguous tiers cover ${MIN_SUPPORTED_WIDTH} → ${MAX_TIER_WIDTH}+ and every boundary matches`);

/* 6 — layout class boundaries must coincide with the tier that introduces the
 * layout they describe (md for tablet, lg for the side nav), or the stylesheet
 * and the TypeScript side would disagree at exactly that width. */
const tabletStart = 768;
const desktopStart = 1024;
for (const [width, expected] of [[359, 'phone'], [360, 'phone'], [767, 'phone'], [768, 'tablet'], [1023, 'tablet'], [1024, 'desktop'], [2560, 'desktop']]) {
  const got = formFactorFor(width);
  if (got !== expected) fail('form-factor', `formFactorFor(${width}) = ${got} ≠ ${expected}`);
}
if (tierFor(tabletStart).name !== 'md') fail('form-factor', `the tablet boundary ${tabletStart} must be tier md, got ${tierFor(tabletStart).name}`);
if (tierFor(desktopStart).name !== 'lg') fail('form-factor', `the desktop boundary ${desktopStart} must be tier lg, got ${tierFor(desktopStart).name}`);
// The persistent side nav starts at md (768) — the width the shell has always
// switched at — so `useSideNav()` and `formFactor` cannot disagree at the
// boundary, and the drawer is used strictly below it.
for (const tier of RESPONSIVE_TIERS) {
  const expected = tier.minWidth >= tabletStart;
  if (tier.sideNav !== expected) {
    fail('form-factor', `tier ${tier.name} (${tier.minWidth}) sideNav=${tier.sideNav}, expected ${expected}`);
  }
}
if (tierFor(tabletStart - 1).sideNav) fail('form-factor', `the drawer must be used below ${tabletStart}px`);
if (!failed('form-factor')) ok.push(`form factor: phone <${tabletStart} ≤ tablet <${desktopStart} ≤ desktop, aligned with md/lg`);

/* 7 — a preferred column count is clamped to the tier, never past it. */
const columnCases = [
  [412, undefined, 1], [412, 4, 1], [412, 1, 1],
  [1600, 2, 2], [1600, 99, 4], [1920, undefined, 5], [2560, 6, 6],
  [1280, 0, 1], [1280, -3, 1], [1280, NaN, 4], [1280, 3.4, 3], [1280, 3.6, 4],
];
for (const [width, preferred, expected] of columnCases) {
  const got = cardColumnsFor(width, preferred);
  if (got !== expected) fail('columns', `cardColumnsFor(${width}, ${preferred}) = ${got} ≠ ${expected}`);
}
if (!failed('columns')) ok.push(`columns: ${columnCases.length} cases clamp the preferred count to the active tier`);

/* ------------------------------------------------- 8–9: CSS ↔ TS agreement */

const platformCss = readFileSync(join(APP, 'src/styles/platform.css'), 'utf8');

// platform.css documents the boundaries; parse them and compare to responsive.ts.
const boundaryLine = platformCss.match(/^\s*\*\s+((?:xs|sm|md|lg|xl|2xl|3xl|4xl)\s+\d+(?:\s*·\s*(?:xs|sm|md|lg|xl|2xl|3xl|4xl)\s+\d+)+)\s*$/m);
if (!boundaryLine) {
  fail('css-ts', 'platform.css no longer documents the tier boundaries in the expected `xs 360 · sm 480 · …` form');
} else {
  const documented = [...boundaryLine[1].matchAll(/(xs|sm|md|lg|xl|2xl|3xl|4xl)\s+(\d+)/g)]
    .map(([, name, width]) => ({ name, minWidth: Number(width) }));
  if (documented.length !== RESPONSIVE_TIERS.length) {
    fail('css-ts', `platform.css documents ${documented.length} tiers, responsive.ts declares ${RESPONSIVE_TIERS.length}`);
  }
  documented.forEach((d, i) => {
    const declared = RESPONSIVE_TIERS[i];
    if (!declared || declared.name !== d.name || declared.minWidth !== d.minWidth) {
      fail('css-ts', `boundary ${i} differs: css ${d.name} ${d.minWidth} vs ts ${declared?.name} ${declared?.minWidth}`);
    }
  });
}
// A rule must exist for every tier name, so a new tier cannot be unnamed in CSS.
for (const tier of RESPONSIVE_TIERS) {
  if (!platformCss.includes(`html[data-tier="${tier.name}"]`)) {
    fail('css-ts', `platform.css has no html[data-tier="${tier.name}"] rule`);
  }
}
// The stylesheet is colour-free: colour is the token contract's business.
const rawColour = platformCss.match(/(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\boklch\()/);
if (rawColour) fail('css-ts', `platform.css introduces a raw colour: ${rawColour[1]}`);
if (!failed('css-ts')) ok.push(`css ↔ ts: ${RESPONSIVE_TIERS.length} boundaries agree and each tier is styled`);

// Which data-* attributes does the provider actually set?
const provider = readFileSync(join(APP, 'src/platform/PlatformProvider.tsx'), 'utf8');
const attributed = new Set(
  [...provider.matchAll(/root\.dataset\.([A-Za-z]+)\s*=/g)]
    .map(([, camel]) => camel.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()),
);
if (attributed.size === 0) fail('attributes', 'PlatformProvider.tsx sets no data-* attributes');

// Attributes styled but owned by another module (documented exemptions).
const ATTR_OWNERS = new Map([
  ['reduce-motion', 'src/lib/appearance.ts (appearance v2 setting)'],
  ['density', 'src/lib/appearance.ts (appearance v2 setting)'],
  ['safe-bottom', 'component opt-in hook, not an environment fact'],
  ['reveal', 'component opt-in: reveals .hover-only-on-fine children on hover'],
]);
const styled = new Set([...platformCss.matchAll(/data-([a-z0-9-]+)/g)].map(([, name]) => name));
for (const name of attributed) {
  if (!styled.has(name)) fail('attributes', `PlatformProvider sets data-${name} but platform.css never styles it`);
}
for (const name of styled) {
  if (attributed.has(name)) continue;
  if (ATTR_OWNERS.has(name)) continue;
  fail('attributes', `platform.css styles data-${name}, which no module sets`);
}
// Two attributes are consumed by TypeScript, not CSS — keep them written.
for (const name of ['platform', 'native-shell']) {
  if (!attributed.has(name)) fail('attributes', `PlatformProvider no longer sets data-${name}`);
}
if (!failed('attributes')) ok.push(`attributes: ${attributed.size} provider attribute(s) all styled, ${ATTR_OWNERS.size} documented exemption(s)`);

/* ------------------------------------------------------------- 10: wiring */

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rootPkg = readJson(join(SRC, 'package.json'));
const frontendPkg = readJson(join(APP, 'package.json'));

// `frontend` is the one frontend directory: declared as a workspace, and
// nothing in the tree still points at the old `app/`.
if (!Array.isArray(rootPkg.workspaces) || !rootPkg.workspaces.includes('frontend')) {
  fail('wiring', `root workspaces ${JSON.stringify(rootPkg.workspaces)} do not include "frontend"`);
}
if ((rootPkg.workspaces ?? []).includes('app')) fail('wiring', 'root workspaces still declare "app"');
if (frontendPkg.name !== '@planinc/frontend') fail('wiring', `frontend package name is ${frontendPkg.name}`);

// The build output is the deploy artifact for BOTH the web stack and Tauri.
const viteConfig = readFileSync(join(APP, 'vite.config.ts'), 'utf8');
const outDirMatch = viteConfig.match(/outDir:\s*["']([^"']+)["']/);
if (!outDirMatch) fail('wiring', 'vite.config.ts declares no outDir');
const viteOut = outDirMatch ? resolve(APP, outDirMatch[1]) : null;
const expectedOut = resolve(SRC, 'dist/public');
if (viteOut && viteOut !== expectedOut) fail('wiring', `vite outDir resolves to ${viteOut}, expected ${expectedOut}`);

const tauriConf = readJson(join(APP, 'src-tauri/tauri.conf.json'));
const tauriDist = tauriConf.build?.frontendDist;
const tauriOut = tauriDist ? resolve(join(APP, 'src-tauri'), tauriDist) : null;
if (tauriOut !== expectedOut) fail('wiring', `tauri frontendDist resolves to ${tauriOut}, expected ${expectedOut}`);
if (tauriConf.build?.beforeBuildCommand && !/build:no-pwa/.test(tauriConf.build.beforeBuildCommand)) {
  warnings.push(`tauri beforeBuildCommand is "${tauriConf.build.beforeBuildCommand}" — a native shell should not build the PWA worker`);
}

// The server serves exactly that directory.
const serverIndex = readFileSync(join(SRC, 'server/index.ts'), 'utf8');
if (!/appRootProd,\s*'public'/.test(serverIndex)) {
  warnings.push('server/index.ts no longer resolves its static root as <appRootProd>/public — verify it matches vite outDir');
}

// The image must build the frontend workspace, not a copy of it.
const dockerfile = readFileSync(join(SRC, 'dockerfile'), 'utf8');
if (!/build:web/.test(dockerfile)) fail('wiring', 'dockerfile does not run build:web');
if (!/COPY --from=builder \/app\/dist/.test(dockerfile)) fail('wiring', 'dockerfile does not copy /app/dist into the image');

// Every workflow that touches the frontend must use the single directory. The
// release pipeline alone is not enough: the Windows/CUDA test workflow builds the
// same Tauri app and was missed the first time this move was done.
const WORKFLOW_DIR = join(SRC, '.github/workflows');
const workflowFiles = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
let workflowRefs = 0;
for (const file of workflowFiles) {
  const text = readFileSync(join(WORKFLOW_DIR, file), 'utf8');
  if (/(?:^|["'\s/\\])app[\/\\]src-tauri/.test(text) || /^\s*cd app\s*(?:&&|$)/m.test(text)) {
    fail('wiring', `.github/workflows/${file} still references the old app/ directory`);
  }
  if (/frontend[\/\\]src-tauri/.test(text)) workflowRefs++;
}
const releaseWorkflow = readFileSync(join(WORKFLOW_DIR, 'app-release.yml'), 'utf8');
if (!/frontend\/src-tauri/.test(releaseWorkflow)) fail('wiring', 'release workflow does not reference frontend/src-tauri');
if (workflowRefs < 2) warnings.push(`only ${workflowRefs} workflow(s) reference frontend/src-tauri — expected the release and Windows test pipelines`);

// A stale lockfile workspace key would break `bun install --frozen-lockfile`.
const lockfile = readFileSync(join(SRC, 'bun.lock'), 'utf8');
if (/"app":\s*\{/.test(lockfile)) fail('wiring', 'bun.lock still declares a workspace named "app"');
if (!/"frontend":\s*\{/.test(lockfile)) fail('wiring', 'bun.lock has no "frontend" workspace entry');
if (/workspace:app\b/.test(lockfile)) fail('wiring', 'bun.lock still resolves a workspace:app package');

// The platform layer must be reachable from the app, not just present.
if (!/PlatformProvider/.test(mainTsx)) fail('wiring', 'main.tsx does not wrap the app in PlatformProvider');
const globalsCss = readFileSync(join(APP, 'src/styles/globals.css'), 'utf8');
if (!/platform\.css/.test(globalsCss)) fail('wiring', 'globals.css never imports platform.css');

// Scripts must be wired so this cannot silently stop running.
if (!String(frontendPkg.scripts?.['check:platform'] ?? '').includes('check-platform')) {
  fail('wiring', 'package.json has no check:platform script');
}
if (!String(frontendPkg.scripts?.['check:contracts'] ?? '').includes('check:platform')) {
  fail('wiring', 'check:contracts does not include check:platform');
}
if (!failed('wiring')) ok.push(`wiring: one frontend dir — workspace, vite outDir, tauri, dockerfile and release workflow all agree`);

/* 11 — Tauri plugin integrity. The frontend imports a plugin's JS API; the Rust
 * shell has to have the crate compiled in and registered. Checking both here is
 * the only offline way to catch a half-wired plugin. */
const walkFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walkFiles(p);
  return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
});

const tauriModules = new Set();
for (const file of walkFiles(join(APP, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/['"](@tauri-apps\/[a-z0-9-]+)(?:\/[a-z0-9-]+)*['"]/g)) tauriModules.add(m[1]);
}
if (tauriModules.size === 0) warnings.push('no @tauri-apps/* module is imported — is the native shell still wired?');

const declaredDeps = new Set([...Object.keys(frontendPkg.dependencies ?? {}), ...Object.keys(frontendPkg.devDependencies ?? {})]);
const cargo = readFileSync(join(APP, 'src-tauri/Cargo.toml'), 'utf8');
const rustLib = readFileSync(join(APP, 'src-tauri/src/lib.rs'), 'utf8');

// Rust plugins are registered in either form:
//   .plugin(tauri_plugin_os::init())                     — simple plugin
//   .plugin(tauri_plugin_updater::Builder::new().build()) — configured plugin
// so match the crate path, not one particular call shape.
const registeredPlugins = new Set(
  [...rustLib.matchAll(/tauri_plugin_([a-z0-9_]+)::/g)].map(([, name]) => name.replace(/_/g, '-')),
);

// Plugins that exist only on the desktop targets. Registering one unconditionally
// would break the Android/iOS build, so their reference must sit after the
// mobile gate in lib.rs.
const DESKTOP_ONLY_PLUGINS = ['updater', 'autostart', 'single-instance', 'global-shortcut', 'window-state'];
const mobileGateIndex = rustLib.search(/cfg\(not\(any\(target_os = "android", target_os = "ios"\)\)\)/);

for (const mod of [...tauriModules].sort()) {
  if (!declaredDeps.has(mod)) fail('tauri-deps', `${mod} is imported but not declared in package.json`);
  if (!mod.startsWith('@tauri-apps/plugin-')) continue;
  // plugin-os → tauri-plugin-os (Cargo) and tauri_plugin_os::… (Rust)
  const short = mod.replace('@tauri-apps/plugin-', '');
  if (!new RegExp(`^tauri-plugin-${short}\\s*=`, 'm').test(cargo)) {
    fail('tauri-deps', `${mod} is used by the frontend but tauri-plugin-${short} is not in src-tauri/Cargo.toml`);
  }
  if (!registeredPlugins.has(short)) {
    fail('tauri-deps', `${mod} is used by the frontend but no tauri_plugin_${short.replace(/-/g, '_')}:: is registered in src-tauri/src/lib.rs`);
    continue;
  }
  if (DESKTOP_ONLY_PLUGINS.includes(short)) {
    const at = rustLib.indexOf(`tauri_plugin_${short.replace(/-/g, '_')}::`);
    if (mobileGateIndex === -1 || at < mobileGateIndex) {
      fail('tauri-deps', `${short} is desktop-only but is registered outside the mobile gate in src-tauri/src/lib.rs`);
    }
  }
}
// The platform layer specifically depends on the OS plugin.
if (!tauriModules.has('@tauri-apps/plugin-os')) {
  fail('tauri-deps', 'the platform layer no longer imports @tauri-apps/plugin-os');
}
if (!failed('tauri-deps')) ok.push(`tauri deps: ${tauriModules.size} @tauri-apps module(s) declared and registered in the Rust shell`);

/* 12 — the layer must be consumed. A platform stylesheet full of rules nothing
 * renders is the failure mode this whole phase exists to avoid, so both
 * directions are asserted: dead rules fail, and a rendered class with no rule
 * fails. */
const componentFiles = walkFiles(join(APP, 'src')).filter((f) => !f.includes('/platform/'));
const componentSource = componentFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

// A name mentioned in a comment is not a rule and not a consumer: strip prose
// from both sides before matching, or this check would pass on documentation.
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJsComments = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const platformCssRules = stripCssComments(platformCss);

// The classes this stylesheet owns, with the platform layer's namespace.
const owned = new Set(
  [...platformCssRules.matchAll(/\.(pi-[a-z0-9-]+|hover-only-on-fine)\b/g)].map(([, c]) => c),
);

// Class tokens a component might render (`pi-x` inside a class list, a template
// string, or a conditional).
const rendered = new Set(
  [...stripJsComments(componentSource).matchAll(/[^a-z0-9-](pi-[a-z0-9-]+|hover-only-on-fine)(?![a-z0-9-])/g)].map(([, c]) => c),
);

for (const cls of owned) {
  if (!rendered.has(cls)) {
    fail('shell-wiring', `platform.css defines .${cls} but no component renders it (dead rule)`);
  }
}
for (const cls of rendered) {
  if (!owned.has(cls)) {
    fail('shell-wiring', `a component renders .${cls} but platform.css does not define it`);
  }
}

// The shell must read the resolved environment, and must not keep a private copy
// of the layout boundary the platform layer owns.
const LAYOUT_COMPONENTS = ['components/Layout/index.tsx', 'components/Layout/Sidebar.tsx', 'components/Layout/MobileNavBar.tsx'];
const layoutSource = Object.fromEntries(
  LAYOUT_COMPONENTS.map((rel) => [rel, stripJsComments(readFileSync(join(APP, 'src', rel), 'utf8'))]),
);
for (const rel of LAYOUT_COMPONENTS) {
  if (/useMediaQuery\s*\(\s*['"]\(min-width:\s*768px\)['"]/.test(layoutSource[rel])) {
    fail('shell-wiring', `${rel} re-derives the 768px layout boundary instead of using usePlatform()`);
  }
}
const consuming = LAYOUT_COMPONENTS.filter((rel) => /@\/platform\/PlatformProvider/.test(layoutSource[rel]));
if (consuming.length === 0) {
  fail('shell-wiring', 'no layout component consumes the platform layer');
}

// The chrome surface is a token now, not a hex string returned from JS.
if (/getFixedHeaderBackground/.test(stripJsComments(componentSource))) {
  fail('shell-wiring', 'the shell still computes its chrome surface in JS (getFixedHeaderBackground)');
}

// The layer replaces every private copy of the 768px layout boundary. If one
// reappears, the app has two sources of truth again — which is exactly the state
// this check was written after: 43 copies across 41 files.
const breakpointOffenders = [];
let breakpoints = 0;
for (const file of componentFiles) {
  const text = stripJsComments(readFileSync(file, 'utf8'));
  if (/useMediaQuery\s*\(\s*['"]\(\s*(?:min|max)-width:\s*768px\s*\)['"]\s*\)/.test(text)) {
    breakpointOffenders.push(file.replace(`${APP}/`, ''));
    breakpoints++;
  }
}
for (const file of breakpointOffenders) {
  fail('shell-wiring', `${file} keeps its own 768px breakpoint — use useSideNav()/useIsPhone()`);
}

// A control hidden behind hover alone is unreachable on touch. `hidden
// group-hover:*` is the fully broken form (display:none with no touch fallback),
// so it must not exist at all; opacity-based reveals are reported while any
// remain, because they are reachable-but-invisible rather than gone.
const hiddenHover = [];
let opacityHover = 0;
for (const file of componentFiles) {
  const text = stripJsComments(readFileSync(file, 'utf8'));
  for (const [, cls] of text.matchAll(/className=(?:\{`|{"|')([^`"']*)/g)) {
    if (/hidden\s+[^\s"']*group-hover/.test(cls)) hiddenHover.push(file.replace(`${APP}/`, ''));
    if (/opacity-0\s+[^\s"']*group-hover/.test(cls) && !cls.includes('hover-only-on-fine')) opacityHover++;
  }
}
for (const file of new Set(hiddenHover)) {
  fail('shell-wiring', `${file} hides a control with \`hidden group-hover:\` — unreachable on touch`);
}
if (opacityHover > 0) {
  warnings.push(`${opacityHover} \`opacity-0 group-hover:\` reveal(s) left without a \`hover-only-on-fine\` fallback (P8 owns the remainder)`);
}

if (!failed('shell-wiring')) {
  ok.push(`shell wiring: ${owned.size} platform class(es) all consumed, ${consuming.length}/${LAYOUT_COMPONENTS.length} layout component(s) use the platform layer`);
  ok.push(`shell wiring: 0 private 768px breakpoints, 0 touch-unreachable hover reveals`);
}

/* ----------------------------------------------------------------- report */

console.log('PlanInc single frontend — platform & viewport validation (PI-014)\n');
if (!quiet) {
  console.log(`  ${MATRIX.length} environments · ${RESPONSIVE_TIERS.length} tiers (${MIN_SUPPORTED_WIDTH} → ${MAX_TIER_WIDTH}+)\n`);
}
ok.forEach((m) => console.log(`  ✓ ${m}`));
warnings.forEach((m) => console.log(`  ! ${m}`));
if (failures.length) {
  console.log('');
  failures.forEach((m) => console.log(`  ✗ ${m}`));
  console.log(`\nFAILED — ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`\nPASSED — ${MATRIX.length} platform environments, ${RESPONSIVE_TIERS.length} responsive tiers, wiring verified.`);
