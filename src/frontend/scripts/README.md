# `scripts`

> Part of **PlanInc** — AI-powered card note-taking and planning

Offline tooling for the **design token contract** (programme `PI-011`, phases P1/P3),
the **settings registry** (PI-011 · P2) and the **platform matrix** (PI-014). Every
script is plain Node ESM with no dependencies — they run without the `bun install`
workspace, which is why the contracts can be verified in CI settings where a full
Vite build is not available. Node ≥ 22.6 strips the TypeScript types, so the
checkers import the real shipping sources rather than a copy.

Contract source of truth: [`../src/styles/tokens.css`](../src/styles/tokens.css)
(four tiers: global → alias → channel → component). Programme doc:
[`docs/10-blinko-parity-and-design-plan.md`](../../../docs/10-blinko-parity-and-design-plan.md).

## Contents

- `validate-tokens.mjs` — token-contract validator
- `lint-tokens.mjs` — raw-value scanner + strict gate
- `token-baseline.json` — recorded raw-value counts (generated; may only shrink)
- `check-settings-registry.mjs` — settings registry proof (PI-011 · P2)
- `check-platform.mjs` — platform/OS/viewport matrix proof (PI-014)
- `ts-resolve.mjs` — Node resolution hook: appends the extensions a bundler would
  have resolved, so the checkers can `import` `src/**/*.ts` directly
- `README.md`

## Usage

```bash
npm run check:contracts        # everything below, in one gate
npm run validate:tokens        # node scripts/validate-tokens.mjs
npm run check:settings         # registry structure + round-trip
npm run check:platform         # platform matrix + responsive tiers + wiring
npm run lint:tokens            # report, exit 0 (migration progress)
npm run lint:tokens:strict     # CI gate: fail on regression vs the baseline
npm run lint:tokens:baseline   # re-record the baseline after a migration
```

`--strict` compares the run against `token-baseline.json` and fails if any file —
or the total — exceeds the recorded count. With no baseline on disk the allowed
maximum is zero, so the gate is absolute once the migration finishes; until then
it ratchets down (419 values before the P3 pass, 142 after).

## What the validator proves

| Check | Property |
|---|---|
| reference integrity | every `var(--x)` resolves to a declared token |
| tier purity | the alias tier holds no raw colour literal |
| channel shape | every `--*-channels` is a valid `H S% L%` triplet |
| theme parity | every colour-bearing token has a `.dark` remap |
| channel coverage | every `var(--*-channels)` referenced by `tailwind.config.js` exists |
| look preservation | each token resolves to the **same colour** as the literal it replaced, from fixtures holding the pre-token `globals.css` values (tolerance ≤ 2/255 and ≤ 0.011 alpha) |
| bridge consistency | a status channel triplet (`--success-channels`, `--warning-channels`) resolves to the same colour as the alias it mirrors, so utilities and HeroUI components cannot disagree |
| shell chrome | the literals that *cannot* be CSS variables — the PWA manifest colours and the `<meta name="theme-color">` pair — still resolve to `--background` in the theme they apply to |

`look preservation` is the load-bearing check: it is what makes a token refactor
safe to land without a visual pass. If it fails, appearance changed.

## What the platform checker proves

`check-platform.mjs` (PI-014) exercises the one frontend across every target it
ships to — 15 environments (browser, installed PWA, Tauri desktop on
Windows/macOS/Linux, Tauri mobile on Android/iOS) and 8 responsive tiers from
360px to 2560px — then asserts that the single directory is the one that actually
builds and deploys.

| # | Check | Property |
|---|---|---|
| 1 | matrix | each environment resolves to the expected platform, OS, form factor, tier and capabilities |
| 2 | offline rule | no native shell registers a service worker; the entry point probes `__TAURI__` first |
| 3 | capability set | all 10 capability flags defined on every environment |
| 4 | safe areas | insets on exactly for notch-bearing targets, and `viewport-fit=cover` is present |
| 5 | tiers | 8 contiguous ascending tiers, 360 → 2560, every boundary and clamp correct |
| 6 | form factor | phone/tablet/desktop boundaries coincide with tiers `md`/`lg` |
| 7 | columns | a preferred column count is clamped to the active tier |
| 8 | css ↔ ts | `platform.css`'s documented boundaries match `responsive.ts`; every tier has a rule; no colour literal |
| 9 | attributes | every `data-*` the provider writes is styled, and every `data-*` styled is one the provider writes |
| 10 | wiring | one frontend dir: workspace list, vite `outDir`, Tauri `frontendDist`, dockerfile, release workflow, lockfile |
| 11 | tauri deps | every imported `@tauri-apps/*` module is declared in `package.json` and registered in `src-tauri/src/lib.rs`; desktop-only plugins stay inside the mobile gate |
| 12 | shell wiring | the layer is consumed: every `pi-*` rule has a consumer and every rendered `pi-*` class is defined; no component keeps a private 768px breakpoint; no control is hidden behind `hidden group-hover:` |

Check 12 is the one that keeps this honest. A platform stylesheet whose rules
nothing renders is the exact failure mode it was written after: `.pi-titlebar`,
`.pi-native-chrome-hidden` and `--pi-content-max-width` all shipped with no
consumer, and 43 separate copies of the 768px breakpoint survived alongside the
new hooks. The dead rules were deleted rather than kept, and the sweep is locked
by the assertion.

Add a platform by adding a `CAPABILITIES` row in `src/platform/detect.ts` **and** a
matrix row here — the capability-set check fails on a half-added target.

## What the linter reports

- hex literals, `rgb()` / `hsl()` / `oklch()` in component code
- raw Tailwind palette utilities (`bg-blue-500`, `text-emerald-600`, …)

Raw values that are legitimately *data* are exempted, and every exemption has to
carry a reason:

```tsx
// line level — one literal on a known line
legacyHex: '#20808D', // tokens-ignore: legacy value compatibility map

/* file level — a whole module of data, in the first 30 lines
tokens-ignore-file: colour series are data, not design decisions */
```

Files that hold literals by design — the token layer itself, the vendored
markdown theme, generated Iconify definitions — are allowlisted at the top of the
script. Everything else must migrate.

## Public API

- _(no exported symbols in this directory)_
