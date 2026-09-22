#!/usr/bin/env node
/**
 * validate-tokens.mjs — PI-011 · P1 token-contract validator
 *
 * Runs offline (no bundler, no browser) and asserts the properties the token
 * contract promises:
 *
 *   1. reference integrity  every `var(--x)` resolves to a declared token
 *   2. tier purity          the alias tier contains no raw colour literal
 *   3. theme parity         every colour/component token has a `.dark` remap
 *   4. channel shape        every `--*-channels` is a valid HSL triplet
 *   5. channel coverage     every `var(--*-channels)` in tailwind.config.js exists
 *   6. look preservation    each token resolves to the SAME colour as the
 *                           literal it replaced in the pre-token globals.css
 *   7. bridge consistency   a status channel triplet resolves to the same colour
 *                           as the alias it mirrors, so Tailwind utilities and
 *                           HeroUI components cannot disagree
 *   8. shell chrome         the handful of literals that CANNOT be CSS variables
 *                           (the PWA manifest colours and the <meta theme-color>
 *                           pair) still resolve to --background in the matching
 *                           theme, so OS chrome matches the app (PI-014)
 *
 * Check 6 is the important one: it proves this was a representation change and
 * not a visual one. Fixtures below hold the original literals verbatim.
 *
 * Usage: node scripts/validate-tokens.mjs   (exit 1 on any failure)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const TOKENS_CSS = join(APP, 'src/styles/tokens.css');
const TAILWIND_CONFIG = join(APP, 'tailwind.config.js');
const INDEX_HTML = join(APP, 'index.html');
const VITE_CONFIG = join(APP, 'vite.config.ts');

/* ------------------------------------------------------------------ colour */

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = x => Math.min(1, Math.max(0, x));

const NAMED = {
  white: { r: 1, g: 1, b: 1, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

function hexToRgba(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

function hslToRgba(h, s, l, a = 1) {
  const k = n => (n + h / 30) % 12;
  const c = s * Math.min(l, 1 - l);
  const f = n => l - c * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4), a };
}

function oklchToRgba(L, C, H, a = 1) {
  const hr = (H * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: clamp01(linearToSrgb(R)), g: clamp01(linearToSrgb(G)), b: clamp01(linearToSrgb(Bl)), a };
}

function rgbToOklab({ r, g, b }) {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    A: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    B: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgba({ L, A, B }, a = 1) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return { r: clamp01(linearToSrgb(R)), g: clamp01(linearToSrgb(G)), b: clamp01(linearToSrgb(Bl)), a };
}

/* ------------------------------------------------------------------ token parse */

/** Split tokens.css into tier scopes, preserving the module's tier markers. */
function parseTokenFile(css) {
  const scopes = { light: {}, dark: {}, motion: {} };
  const tiers = { light: new Map(), dark: new Map() };
  let tier = null;
  let scope = 'light';
  let depth = 0;
  let suppressedDepth = null; // inside @media (prefers-reduced-motion)

  for (const rawLine of css.split('\n')) {
    const line = rawLine.trim();

    if (/TIER 1 — GLOBAL/.test(line)) tier = 'global';
    else if (/TIER 2 — ALIAS/.test(line)) tier = 'alias';
    else if (/TIER 3 — CHANNEL/.test(line)) tier = 'channel';
    else if (/TIER 4 — COMPONENT/.test(line)) tier = 'component';
    else if (/DARK — alias/.test(line)) { tier = null; scope = 'dark'; }

    if (line.startsWith('@media') && /prefers-reduced-motion/.test(line)) suppressedDepth = depth + 1;
    if (line.startsWith('.dark {')) scope = 'dark';
    else if (line.startsWith(':root {') && scope !== 'dark') scope = 'light';

    // a trailing `/* comment */` on the same line is allowed
    const m = /^(--[a-z0-9-]+)\s*:\s*(.+?);\s*(?:\/\*.*\*\/)?\s*$/.exec(line);
    if (m) {
      const [, name, value] = m;
      if (suppressedDepth !== null) scopes.motion[name] = value;
      else {
        if (!(name in scopes[scope])) scopes[scope][name] = value;
        if (tier) {
          if (!tiers[scope].has(tier)) tiers[scope].set(tier, new Map());
          tiers[scope].get(tier).set(name, value);
        }
      }
    }
    depth += (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;
    if (suppressedDepth !== null && depth < suppressedDepth) suppressedDepth = null;
  }
  return { scopes, tiers };
}

/* ------------------------------------------------------------------ resolver */

function makeResolver(scopes) {
  const errors = [];
  const lookup = (name, scope) => {
    const v = scopes[scope][name];
    if (v !== undefined) return { value: v, scope };
    if (scopes.light[name] !== undefined) return { value: scopes.light[name], scope: 'light' };
    return null;
  };

  function resolve(name, scope, seen = new Set()) {
    if (seen.has(name)) { errors.push(`circular reference: ${name}`); return null; }
    seen.add(name);
    const hit = lookup(name, scope);
    if (!hit) { errors.push(`undefined token: var(--${name})`); return null; }
    const out = resolveString(hit.value, scope, seen).replace(/\s*!important/, '');
    return out;
  }

  function resolveString(value, scope, seen = new Set()) {
    // expand nested var() references (innermost first)
    let out = value;
    for (let i = 0; i < 20 && out.includes('var('); i++) {
      const before = out;
      out = out.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*[^()]*)?\)/g, (_all, ref) => {
        const r = resolve(ref, scope, new Set(seen));
        return r === null ? `__UNRESOLVED__(${ref})` : r;
      });
      if (out === before) break;
    }
    return out;
  }

  return { resolve, resolveString, errors, lookup };
}

function parseColor(css, resolver, scope) {
  let v = resolver.resolveString(css, scope).trim();
  const named = NAMED[v];
  if (named) return named;

  if (v.startsWith('#')) return hexToRgba(v);

  let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a };
  }

  m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return hslToRgba(+m[1], +m[2] / 100, +m[3] / 100, a);
  }

  m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const L = m[1].endsWith('%') ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return oklchToRgba(L, +m[2], +m[3], a);
  }

  m = /^color-mix\(in\s+([a-z0-9-]+)\s*,\s*(.+)\)$/i.exec(v);
  if (m) {
    const space = m[1].toLowerCase();
    const parts = splitTopLevel(m[2]);
    if (parts.length !== 2) { throw new Error(`unsupported color-mix: ${v}`); }
    const [c1, p1] = parseMixStop(parts[0]);
    const [c2, p2] = parseMixStop(parts[1]);
    const pc1 = p1 ?? (p2 === null ? 50 : 100 - p2);
    const pc2 = p2 ?? 100 - pc1;
    const A = parseColor(c1, resolver, scope);
    const B = parseColor(c2, resolver, scope);
    const w1 = pc1 / 100, w2 = pc2 / 100;
    const a = w1 * A.a + w2 * B.a;
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    // CSS interpolation is PREMULTIPLIED: colours are weighted by their own
    // alpha, interpolated, then divided back out by the result alpha. Skipping
    // this makes `color-mix(… 85%, transparent)` look darkened.
    if (space === 'oklab') {
      const a1 = rgbToOklab(A), b1 = rgbToOklab(B);
      return oklabToRgba({
        L: (a1.L * A.a * w1 + b1.L * B.a * w2) / a,
        A: (a1.A * A.a * w1 + b1.A * B.a * w2) / a,
        B: (a1.B * A.a * w1 + b1.B * B.a * w2) / a,
      }, a);
    }
    return {
      r: (A.r * A.a * w1 + B.r * B.a * w2) / a,
      g: (A.g * A.a * w1 + B.g * B.a * w2) / a,
      b: (A.b * A.a * w1 + B.b * B.a * w2) / a,
      a,
    };
  }

  throw new Error(`unsupported colour syntax: ${v}`);
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseMixStop(stop) {
  const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(stop.trim());
  return [m[1].trim(), m[2] ? parseFloat(m[2]) : null];
}

/* ------------------------------------------------------------------ fixtures */
/**
 * The literal each token replaced, verbatim from the pre-token globals.css.
 * `null` means "no counterpart existed" (a new token) and is skipped.
 */
const FIXTURES = {
  light: {
    background: '#ffffff', foreground: 'hsl(222.2 47.4% 11.2%)', secondbackground: '#f8f8f8',
    desc: '#808080', ignore: '#bababa', tag: '#c35af7', 'tag-foreground': '#fceefe',
    popover: '#ffffff', 'popover-foreground': 'hsl(222.2 47.4% 11.2%)',
    muted: 'hsl(210 40% 96.1%)', 'muted-foreground': 'hsl(215.4 16.3% 46.9%)',
    card: '#ffffff', 'card-foreground': 'hsl(222.2 47.4% 11.2%)',
    border: '#E7E7E5', input: 'hsl(214.3 31.8% 91.4%)',
    primary: '#000000', 'primary-foreground': 'hsl(210 40% 98%)',
    secondary: 'hsl(253 53% 59%)', 'secondary-foreground': 'hsl(210 40% 98%)',
    accent: 'hsl(240 5% 96%)', 'accent-foreground': 'hsl(222.2 47.4% 11.2%)',
    destructive: 'hsl(0 100% 50%)', 'destructive-foreground': 'hsl(210 40% 98%)',
    ring: 'hsl(215 20.2% 65.1%)',
    hover: '#efeee7d9', header: 'rgba(249,250,251,0.9)',
    'editor-bg': '#ffffff', 'editor-text': 'hsl(222.2 47.4% 11.2%)',
    'editor-separator': '#bcbcbe', 'editor-border': '#e5e7eb',
    'glass-bg': 'rgba(255,255,255,0.85)',
    'selection-bg': '#47a3f3', 'selection-fg': '#fefefe',
    'swiper-3d-shadow': 'rgba(0,0,0,0.15)',
    'hero-base': 'color-mix(in srgb, #ffffff 92%, #000000)',
    'hero-glow': 'color-mix(in srgb, #000000 12%, transparent)',
  },
  dark: {
    background: '#0B0B0C', foreground: '#E1E1E1', secondbackground: '#1C1C1E',
    desc: '#999999', ignore: '#6d6d6d', tag: '#c35af7', 'tag-foreground': '#1b1b1b',
    popover: 'hsl(224 71% 4%)', 'popover-foreground': 'hsl(215 20.2% 65.1%)',
    muted: 'hsl(224 20% 19%)', 'muted-foreground': 'hsl(215.4 16.3% 56.9%)',
    card: 'hsl(224 71% 4%)', 'card-foreground': 'hsl(213 31% 91%)',
    border: '#0b0b0c', input: 'hsl(216 34% 17%)',
    primary: '#f9f9f9', 'primary-foreground': '#000000',
    secondary: 'hsl(253 53% 59%)', 'secondary-foreground': 'hsl(210 40% 98%)',
    accent: 'hsl(214 9% 15%)', 'accent-foreground': 'hsl(210 40% 98%)',
    destructive: 'hsl(0 63% 31%)', 'destructive-foreground': 'hsl(210 40% 98%)',
    ring: 'hsl(216 34% 17%)',
    hover: '#292929', header: 'rgba(0,0,0,0.8)',
    'editor-bg': '#09090b', 'editor-text': 'hsl(210 40% 98%)',
    'editor-separator': '#4b4b4d', 'editor-border': '#27272a',
    'glass-bg': 'rgba(11,11,12,0.8)',
    'swiper-3d-shadow': 'rgba(241,241,241,0.15)',
    'hero-glow': 'color-mix(in srgb, #f5c451 14%, transparent)',
  },
};

/* Tokens that intentionally exist in one theme only. */
const THEME_INVARIANT = [
  /^--pi-radius-/, /^--motion-/, /^--radius$/, /^--font-family$/,
  /^--doc-height$/, /^--min-editor-height$/, /^--chip-/, /^--contextmenu-/,
  /^--selection-/, /^--md-editor-/,
  // same value in both themes: a progress gradient, the editor task accent, the
  // on-glass music scrim, the canvas chart scrims (all ink/white based), and the
  // appearance-v2 scale/line-height (written by lib/appearance.ts)
  /^--progress-/, /^--editor-task-accent$/, /^--music-scrim$/, /^--chart-(emphasis|cell)-/,
  /^--pi-ui-scale$/, /^--pi-line-height$/,
];

/**
 * Alias ↔ channel pairs whose equivalence is asserted by check 7.
 * Extend this list as more HeroUI slots are bridged — the remaining slots need a
 * design decision, not a copy (see PI-011 §6 P3/P4).
 */
const BRIDGE_PAIRS = ['success', 'warning'];

/* ------------------------------------------------------------------ checks */

const failures = [];
const warnings = [];
const ok = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

const css = readFileSync(TOKENS_CSS, 'utf8');
const { scopes, tiers } = parseTokenFile(css);
const resolver = makeResolver(scopes);

/* 1 — reference integrity for every declared token, both themes */
for (const scope of ['light', 'dark']) {
  for (const [name, value] of Object.entries(scopes[scope])) {
    for (const ref of value.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!resolver.lookup(ref[1], scope)) fail('integrity', `${scope} ${name} → undefined var(--${ref[1]})`);
    }
  }
}
// materialise resolution errors (circular refs surface here)
for (const scope of ['light', 'dark']) {
  for (const name of Object.keys(scopes[scope])) resolver.resolveString(scopes[scope][name], scope);
}
resolver.errors.slice(0, 20).forEach(e => fail('integrity', e));
if (!failures.length) ok.push('reference integrity: every var() resolves');

/* 2 — tier purity: no raw colour literal in the alias tier */
const RAW_COLOUR = /(#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\boklch\(|(?:^|[\s,(])(?:white|black|red|blue|green|gray|grey|silver|maroon|purple|orange|yellow|pink|brown|navy|teal|olive|lime|aqua|fuchsia)(?:$|[\s,)]))/i;
for (const scope of ['light', 'dark']) {
  const alias = tiers[scope].get('alias') || new Map();
  for (const [name, value] of alias) {
    if (RAW_COLOUR.test(value)) fail('tier-purity', `${scope} alias ${name} holds a raw colour: ${value}`);
  }
  const channel = tiers[scope].get('channel') || new Map();
  for (const [name, value] of channel) {
    if (!/^[\d.]+ [\d.]+% [\d.]+%$/.test(value.trim())) fail('channel-shape', `${scope} ${name} = "${value}" is not a channel triplet`);
    else {
      const [h, s, l] = value.trim().split(' ').map(x => parseFloat(x));
      if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) fail('channel-shape', `${scope} ${name} out of range: ${value}`);
    }
  }
}
if (!failures.some(f => f.startsWith('[tier-purity]') || f.startsWith('[channel-shape]')))
  ok.push('tier purity + channel shape: alias tier is token-only, channels are valid triplets');

/* 3 — theme parity for the colour-bearing tiers (alias/channel/component).
 * Tier 1 global is intentionally theme-invariant: themes remap aliases, they do
 * not fork the raw ramps. */
const darkSet = new Set(Object.keys(scopes.dark));
const themedLight = ['alias', 'channel', 'component'].flatMap(t => [...(tiers.light.get(t) || new Map()).keys()]);
const missingDark = [...new Set(themedLight)].filter(n => !darkSet.has(n) && !THEME_INVARIANT.some(rx => rx.test(n)));
if (missingDark.length) fail('theme-parity', `no .dark remap for: ${missingDark.join(', ')}`);
else ok.push('theme parity: every colour-bearing token has a .dark remap');

/* 4 — channel coverage for the HeroUI bridge declared in tailwind.config.js */
const config = readFileSync(TAILWIND_CONFIG, 'utf8');
const channelRefs = [...new Set([...config.matchAll(/var\(\s*(--[a-z0-9-]*channels)\s*\)/g)].map(m => m[1]))];
const missingChannels = channelRefs.filter(n => !(n in scopes.light));
if (missingChannels.length) fail('channel-coverage', `tailwind.config.js references missing channels: ${missingChannels.join(', ')}`);
else ok.push(`channel coverage: ${channelRefs.length} HeroUI slots wired to declared channel tokens`);

/* 5 — look preservation against the pre-token literals */
let compared = 0;
for (const scope of ['light', 'dark']) {
  for (const [name, legacy] of Object.entries(FIXTURES[scope])) {
    const tokenName = `--${name}`;
    const declared = resolver.lookup(tokenName, scope);
    if (!declared) { fail('preservation', `${scope} ${tokenName} is not declared`); continue; }
    let got, want;
    try { got = parseColor(scopes[scope][tokenName], resolver, scope); }
    catch (e) { fail('preservation', `${scope} ${tokenName}: ${e.message}`); continue; }
    try { want = parseColor(legacy, resolver, scope); }
    catch (e) { warnings.push(`${scope} ${name}: legacy fixture unparsable (${e.message})`); continue; }
    const d = Math.max(Math.abs(got.r - want.r), Math.abs(got.g - want.g), Math.abs(got.b - want.b)) * 255;
    const da = Math.abs(got.a - want.a);
    compared++;
    if (d > 2 || da > 0.011) {
      fail('preservation',
        `${scope} ${name}: ${(d).toFixed(2)}/255 off (rgb ${[got.r, got.g, got.b].map(x => Math.round(x * 255))} vs ${[want.r, want.g, want.b].map(x => Math.round(x * 255))}, alpha ${got.a.toFixed(3)} vs ${want.a.toFixed(3)})`);
    }
  }
}
if (!failures.some(f => f.startsWith('[preservation]')))
  ok.push(`look preservation: ${compared} fixtures match the pre-token literals (≤2/255, ≤0.011 alpha)`);

/* 7 — the HeroUI bridge must not drift from the semantic alias it mirrors: a
 * channel token is the same colour expressed as an HSL triplet. */
let bridged = 0;
for (const scope of ['light', 'dark']) {
  for (const slot of BRIDGE_PAIRS) {
    for (const suffix of ['', '-foreground']) {
      const aliasName = `--${slot}${suffix}`;
      const channelName = `--${slot}${suffix}-channels`;
      const aliasValue = resolver.lookup(aliasName, scope);
      const channelValue = resolver.lookup(channelName, scope);
      if (!aliasValue) { fail('bridge', `${scope} ${aliasName} is not declared`); continue; }
      if (!channelValue) { fail('bridge', `${scope} ${channelName} is not declared`); continue; }
      const triplet = channelValue.value.trim().split(/\s+/);
      if (triplet.length !== 3) { fail('bridge', `${scope} ${channelName} is not a triplet`); continue; }
      const fromChannel = hslToRgba(
        parseFloat(triplet[0]),
        parseFloat(triplet[1]) / 100,
        parseFloat(triplet[2]) / 100,
      );
      let fromAlias;
      try { fromAlias = parseColor(aliasValue.value, resolver, scope); }
      catch (e) { fail('bridge', `${scope} ${aliasName}: ${e.message}`); continue; }
      const d = Math.max(
        Math.abs(fromChannel.r - fromAlias.r),
        Math.abs(fromChannel.g - fromAlias.g),
        Math.abs(fromChannel.b - fromAlias.b),
      ) * 255;
      bridged++;
      if (d > 2) {
        fail('bridge',
          `${scope} ${channelName} ≠ ${aliasName}: ${d.toFixed(2)}/255 off ` +
          `(${[fromChannel.r, fromChannel.g, fromChannel.b].map(x => Math.round(x * 255))} vs ` +
          `${[fromAlias.r, fromAlias.g, fromAlias.b].map(x => Math.round(x * 255))})`);
      }
    }
  }
}
if (!failures.some(f => f.startsWith('[bridge]')))
  ok.push(`bridge consistency: ${bridged} status channel token(s) match their alias`);

/* 8 — shell chrome. The OS draws the browser chrome and the PWA splash screen
 * before any stylesheet exists, so those two surfaces need literal colours: a
 * <link rel="manifest"> cannot read a CSS variable and a <meta> cannot either.
 * Rather than let them rot, assert they resolve to --background per theme. */
const chromeMatches = (label, hex, scope) => {
  let want;
  try { want = parseColor(resolver.lookup('--background', scope).value, resolver, scope); } catch (e) {
    fail('shell-chrome', `--background is unresolvable in ${scope}: ${e.message}`);
    return;
  }
  let got;
  try { got = parseColor(hex, resolver, scope); } catch (e) {
    fail('shell-chrome', `${label} "${hex}" is not a parsable colour`);
    return;
  }
  const d = Math.max(Math.abs(got.r - want.r), Math.abs(got.g - want.g), Math.abs(got.b - want.b)) * 255;
  if (d > 1) {
    fail('shell-chrome',
      `${label} ${hex} ≠ --background in ${scope} ` +
      `(${[got.r, got.g, got.b].map(x => Math.round(x * 255))} vs ` +
      `${[want.r, want.g, want.b].map(x => Math.round(x * 255))})`);
  }
};

const html = readFileSync(INDEX_HTML, 'utf8');
const themeMetas = [...html.matchAll(/<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{3,8})"\s+media="\(prefers-color-scheme:\s*(light|dark)\)"/g)];
const seenSchemes = new Set(themeMetas.map(m => m[2]));
for (const scheme of ['light', 'dark']) {
  if (!seenSchemes.has(scheme)) {
    fail('shell-chrome', `index.html has no theme-color meta for prefers-color-scheme: ${scheme}`);
  }
}
for (const [, hex, scheme] of themeMetas) chromeMatches(`index.html theme-color (${scheme})`, hex, scheme);

const vite = readFileSync(VITE_CONFIG, 'utf8');
const manifestColours = [...vite.matchAll(/\b(theme_color|background_color):\s*'(#[0-9a-fA-F]{3,8})'/g)];
if (manifestColours.length === 0) fail('shell-chrome', 'vite.config.ts declares no PWA manifest colours');
for (const [, key, hex] of manifestColours) chromeMatches(`manifest ${key}`, hex, 'light');
if (!failures.some(f => f.startsWith('[shell-chrome]')))
  ok.push(`shell chrome: ${themeMetas.length} theme-color meta(s) + ${manifestColours.length} manifest colour(s) match --background`);

/* ------------------------------------------------------------------ report */
console.log('PlanInc token contract — validation (PI-011 · P1)\n');
ok.forEach(m => console.log(`  ✓ ${m}`));
warnings.forEach(m => console.log(`  ! ${m}`));
if (failures.length) {
  console.log('');
  failures.forEach(m => console.log(`  ✗ ${m}`));
  console.log(`\nFAILED — ${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`\nPASSED — ${compared} fixtures verified, ${channelRefs.length} HeroUI slots wired, ${bridged} status channels verified.`);
