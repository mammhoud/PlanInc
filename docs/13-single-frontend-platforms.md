# Single frontend for every platform and OS (PI-014)

> One directory — `frontend/` — is the source for the web app, the installable
> PWA, and the Tauri desktop and mobile apps. There is no per-platform frontend and
> no per-OS fork. This document is the reference for how that works and how to
> verify it.

## Layout

```text
src/
├── frontend/            ← THE frontend. Every platform builds from here.
│   ├── src/
│   │   ├── platform/    ← platform model: detect, responsive, pwa, PlatformProvider
│   │   ├── styles/      ← globals.css, tokens.css, platform.css
│   │   ├── components/  pages/  store/  lib/  hooks/
│   │   └── main.tsx     ← the one entry point
│   ├── src-tauri/       ← desktop (Win/macOS/Linux) + Android + iOS shells
│   ├── public/          ← static assets, locales/
│   ├── scripts/         ← offline verifiers (see below)
│   ├── index.html
│   └── vite.config.ts   ← outDir: ../dist/public
├── server/              ← Express + tRPC + SurrealDB
├── shared/              ← types + settings registry, imported by both sides
└── planinc-types/
```

`frontend` is declared in the root `package.json` `workspaces` list and named
`@planinc/frontend`. The deploy artifact for **both** web and Tauri builds is
`dist/public` at the PlanInc root:
`vite.config.ts` writes it, `src-tauri/tauri.conf.json` (`frontendDist`) bundles it,
`dockerfile` copies it into the image, and `server/index.ts` serves it.

```mermaid
flowchart LR
  F["frontend (one source)"] --> V["vite build"]
  V --> D["dist/public"]
  D --> W["web + PWA (docker image)"]
  D --> T["Tauri: desktop / Android / iOS"]
```

## The platform model

Targets differ in **capabilities**, not in screens. A phone in a browser and a
phone in the Android app want the same layout but can do different things — share
sheet, native back button, safe-area insets, offline shell. So the app asks what
the environment can do instead of branching on `isMobile` everywhere.

| | `platform` | `os` | layout source |
|---|---|---|---|
| Browser tab | `web` | `windows`/`macos`/`linux`/`android`/`ios` | viewport |
| Installed PWA | `pwa` | same | viewport |
| Tauri desktop | `desktop` | `windows`/`macos`/`linux` | viewport |
| Tauri mobile | `android`/`ios` | `android`/`ios` | viewport |

`src/platform/types.ts` holds the model; `detect.ts` resolves it from an injectable
`PlatformEnv` (which is why every row can be verified without a device).

### Capabilities

`capabilities` is the only thing components should branch on, via
`useCapability('nativeShare')`. Ten flags: `windowControls`, `systemTray`,
`nativeShare`, `nativeBack`, `safeAreaInsets`, `serviceWorker`, `localDatabase`,
`nativeFileSystem`, `globalShortcuts`, `nativeTheme`.

Two rules that are enforced rather than trusted:

- **No native shell registers a service worker.** The shells ship their own assets
  and their own updater, so a worker would risk serving a stale bundle past an
  update. `registerOfflineShell()` refuses inside `isNativeShell`, and
  `check-platform.mjs` fails if any shell reports `serviceWorker: true`.
- **`viewport-fit=cover` in `index.html`.** Without it, `env(safe-area-inset-*)`
  resolves to 0 on notched devices and the safe-area support is silently dead.

## Responsive scale (360 → 2560)

One tier list lives in `src/platform/responsive.ts` and is mirrored in
`src/styles/platform.css`; the checker fails if the two disagree.

| tier | min width | card columns | side nav |
|---|---|---|---|
| `xs` | 360 | 1 | no |
| `sm` | 480 | 2 | no |
| `md` | 768 | 2 | **yes** |
| `lg` | 1024 | 3 | yes |
| `xl` | 1280 | 4 | yes |
| `2xl` | 1600 | 4 | yes |
| `3xl` | 1920 | 5 | yes |
| `4xl` | 2560 | 6 | yes |

The `sideNav` column is not decoration — the shell renders the persistent sidebar
from `md` up (that is the width it has always switched at, and iPad portrait is
exactly 768), so `useSideNav()` and `formFactor === 'phone'` agree at the boundary
by assertion.

Layout class (`formFactorFor`) is a viewport fact, not a device fact:
`phone` < 768 ≤ `tablet` < 1024 ≤ `desktop`. The 768 and 1024 boundaries are
asserted to be exactly tiers `md` and `lg`, so the stylesheet and the TypeScript
side cannot disagree at the boundary.

## How adaptation reaches CSS

`PlatformProvider` writes the resolved environment onto `<html>`; `platform.css`
styles off those attributes. There is no prop threading and no JS per component.

| attribute | values |
|---|---|
| `data-platform` | `web` · `pwa` · `desktop` · `android` · `ios` |
| `data-os` | `windows` · `macos` · `linux` · `android` · `ios` · `unknown` |
| `data-form-factor` | `phone` · `tablet` · `desktop` |
| `data-tier` | `xs` … `4xl` |
| `data-pointer` | `fine` · `coarse` |
| `data-native-shell` | `true` · `false` |
| `data-safe-area` | `true` · `false` — from the *capability*, not the form factor |

Read them in React with `usePlatform()`, `useTier()`, `useSideNav()`,
`useIsPhone()`, `useFormFactor()`, `useCapability(name)`, `useIsNativeShell()`.

`useSideNav()` and `useIsPhone()` exist because the app used to ask the same
question in **43 places** (`useMediaQuery('(min-width: 768px)')` ×36 and
`'(max-width: 768px)'` ×8, across 41 files). They are exact complements now; the
old pair was not, since both matched at 768 — which is how the mobile bottom
bar's spacer could render while the bar itself was hidden.

## User overrides for the automatic decision

Deriving the layout from the viewport is the right default, and wrong in two
everyday cases: a desktop window dragged narrow collapses into a drawer the user
did not ask for, and a tablet on a keyboard wants the wide layout with a fine
pointer. Three per-user settings overrule the decision without touching the
environment facts. They live in the settings registry, so they appear in
Appearance → layout with no bespoke UI.

| setting id | values | what it changes |
|---|---|---|
| `responsiveLayout` | `auto` (default) · `compact` · `comfortable` | the tier and the form factor — `compact` forces `xs` + `phone`, `comfortable` forces `lg` or the detected tier if larger |
| `sideNavMode` | `auto` (default) · `pinned` · `drawer` | whether the persistent side navigation renders, independent of the tier |
| `touchTargets` | `auto` (default) · `coarse` · `fine` | `data-pointer`, i.e. target sizes and inert hover states |

`src/platform/overrides.ts` is the only reader. `responsive.ts` still owns the
boundaries and `detect.ts` still owns the capabilities; this module decides which
of those answers the shell acts on. `useSideNav()` and the form factor reported by
`usePlatform()` resolve through it, so they can now legitimately disagree (forced
compact layout with a pinned sidebar). The provider subscribes rather than reads
once, so a change takes effect without a reload.

**What the override does and does not govern.** It changes everything that asks
the platform layer — the tier tokens (`html[data-tier]`, target sizes, spacing),
`useSideNav()` / `useIsPhone()` / `useFormFactor()` and the 43 call sites behind
them, `data-pointer`, and the JS-derived layout of screens that compute columns
from the tier (the note masonry and the hub feed). It does **not** rewrite Tailwind
utility classes: `sm:` / `md:` / `lg:` in a component still respond to the real
viewport, because that is what the CSS media queries see. A forced compact layout
therefore compresses token-driven chrome and the tier-aware grids, but a
hand-written `md:grid-cols-2` stays two columns. Converting those utility pairs to
tier-driven tokens is the remaining work; until then, prefer
`cardColumnsFor(viewportWidth, preferredCardColumns(tier, …))` over a fresh
`breakpointCols` object in any new screen.

## Audit status

The unified theme and responsive layer are implemented and wired into the
shipping entry point:

- `main.tsx` imports one `globals.css`, which imports the shared token and
  platform layers for every web, PWA, and Tauri target.
- `tokens.css` is the only source for semantic colors, dark-mode aliases,
  component radii, motion values, safe-area values, and tier-dependent scale.
  The former standalone `planinc-palette.css` was unused and has been removed.
- `globals.css` no longer redeclares a second shadcn color palette. Tailwind
  utilities resolve the semantic aliases from `tokens.css`, so light and dark
  themes cannot drift between CSS files.
- Vite, Tauri desktop, Tauri Android/iOS, and the production server converge on
  the same `dist/public` artifact. Native shells use `build:no-pwa`, while web
  builds retain the PWA service worker.
- `viewport-fit=cover`, safe-area variables, coarse-pointer target sizing,
  hover-only control fallbacks, reduced-motion rules, and `data-*` platform
  attributes are all present in the shared layer.

The remaining intentional limitation is Tailwind's viewport media-query
utilities. A user-selected compact or comfortable layout changes token-driven
shell behavior and tier-aware JavaScript layouts, but cannot change a
component's handwritten `sm:`, `md:`, or `lg:` utility. New screens must use
the platform tier helpers instead of adding private breakpoint maps. Existing
utility pairs should be migrated incrementally when those screens are edited.

## Remarks & Notes

- **Colour lives in the token contract, not here.** `platform.css` introduces no
  colour literal; `validate-tokens.mjs` fails the build if it ever does.
- **A few literals cannot be CSS variables** — the PWA manifest colours and the
  `<meta name="theme-color">` pair, because the OS draws that chrome before any
  stylesheet exists. `validate-tokens.mjs` check 8 asserts each one still resolves
  to `--background` in the theme it applies to, so they cannot silently rot.
- **The PWA manifest is `orientation: "any"`**, not `portrait`. One build serves
  desktop and landscape tablets; a locked orientation makes the installed
  desktop/tablet app unusable.
- The former duplicate frontend directory was removed after its supported use
  cases were moved into the source tree. The active web server is `server/`,
  and the built frontend is the same `dist/public` artifact used by the Tauri
  shells.

## Verify it

```bash
cd frontend
bun run check:platform     # 12 check groups, 15 environments, 8 tiers, shell wiring
bun run check:contracts    # tokens + settings registry + platform + strict lint
```

`scripts/check-platform.mjs` runs offline against the shipping sources (Node ≥ 22.6
strips the types; `scripts/ts-resolve.mjs` supplies the extensions a bundler would
have resolved) and asserts:

| # | Check | What it proves |
|---|---|---|
| 1 | matrix | 15 environments → expected platform, OS, form factor, tier, capabilities |
| 2 | offline rule | no native shell has a service worker; `main.tsx` probes `__TAURI__` first |
| 3 | capability set | all 10 flags defined on every environment |
| 4 | safe areas | insets on exactly for notch-bearing targets; `viewport-fit=cover` present |
| 5 | tiers | 8 contiguous ascending tiers, 360 → 2560, every boundary and clamp correct |
| 6 | form factor | phone/tablet/desktop boundaries coincide with tiers `md`/`lg` |
| 7 | columns | a preferred column count is clamped to the active tier |
| 8 | css ↔ ts | documented boundaries match `responsive.ts`; every tier has a rule |
| 9 | attributes | every `data-*` the provider writes is styled, and vice versa |
| 10 | wiring | one frontend dir: workspace, vite `outDir`, Tauri, dockerfile, workflow, lockfile |
| 11 | tauri deps | every `@tauri-apps/*` module imported is a declared dependency **and** registered in the Rust shell, and desktop-only plugins stay inside the mobile gate |
| 12 | shell wiring | the layer is *consumed*: every `pi-*` rule has a real consumer, every rendered `pi-*` class is defined, no component keeps a private 768px breakpoint, and no control is hidden behind `hidden group-hover:` (unreachable on touch) |

Add a platform by adding a `CAPABILITIES` row in `detect.ts` **and** a matrix row in
the checker — the capability-set check fails on a half-added target.

## What the shell actually consumes

The layer is not a library sitting next to the UI — `src/components/Layout/*` and
~40 other components read from it:

| Where | Reads | Replaced |
|---|---|---|
| `Layout/index.tsx` | `usePlatform().tier.sideNav` | `useMediaQuery('(min-width: 768px)')` |
| `Layout/Sidebar.tsx` | `usePlatform().tier.sideNav` | its own copy of the same query |
| `pages/*`, `store/*`, 38 components | `useSideNav()` / `useIsPhone()` | 43 queries across 41 files |
| `Layout/index.tsx` header | `.pi-mobile-header` | six inline style properties + a hex from `getFixedHeaderBackground()` |
| `Layout/MobileNavBar.tsx` | `.pi-bottom-bar` | `md:hidden` + an inline blurred style |
| `Layout/Sidebar.tsx` collapse toggle | `.hover-only-on-fine` + `data-reveal` | `opacity-0 group-hover/sidebar:opacity-100` — invisible, so untappable, on a touch tablet |
| `AttachmentRender` overlay icons, `MarkdownRender/Code.tsx`, `PlanincCard` header actions, `aiConversactionList` | `.hover-only-on-fine` + `data-reveal` | `hidden group-hover:block` / `opacity-0 group-hover:…`, plus two `isIOSDevice ? 'opacity-100'` escape hatches that only helped iOS |
| `main.tsx` | `capabilities.serviceWorker`, `capabilities.localDatabase` | offline shell + persistent storage |
| `platform.css` | `data-safe-area` | safe-area padding keyed off the form factor |

**Why the hover reveal matters.** `hidden group-hover:block` means
`display: none` until the pointer hovers — so on a phone or tablet an attachment
could not be downloaded, a code block could not be copied, and a conversation
could not be renamed or deleted. `hover-only-on-fine` keys off `data-pointer`
instead of the device or the OS: a coarse pointer keeps the control visible, a
fine pointer still gets the reveal, and `:focus-visible` covers the keyboard.

## Platform commands

All from `frontend`, the single directory:

```bash
bun run dev                  # frontend + backend (Tauri dev shell)
bun run build:web             # web + PWA bundle → dist/public
bun run build:no-pwa         # same, without the service worker (what Tauri uses)
bun run tauri:desktop:build  # Windows / macOS / Linux bundles
bun run tauri:android:build  # Android APK/AAB
bun run tauri:ios:build      # iOS
```

## Current build contract

The frontend is now the single source for web, PWA, desktop, Android and iOS.
Vite writes `PlanInc/dist/public`; Tauri's `frontendDist` points to that same
directory; and the production server serves the copied bundle from
`server/public`. There is no second runtime frontend to keep in sync.
