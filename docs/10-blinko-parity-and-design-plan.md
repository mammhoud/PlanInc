## Appendix B — Logo & Loading Brand Deliverable (PI-011 · Appendix)

> Per the agenda explicitly: **\"make a plan\" → trunk, then \"do the plan\" (documented
> so the check is possible), then \"finish the plan\" (evidence).**
>
> This appendix is the plan. Implementation lands in `frontend/public/`, `index.html`,
> `frontend/src/components/PlanincLogo/`, and `frontend/src/components/PlanincLoader.tsx`.

### B.1 Scope (the ask decomposed)

| # | Deliverable | Source | Status |
|---|-------------|--------|--------|
| 1 | Plan doc (this appendix + this programme doc) | — | done / ongoing |
| 2 | New brand mark as SVG (`planinc-mark.svg`) | supplied attached file | in place |
| 3 | Logos in different sizes (mark + wordmark + lockups, stacked & square) | brandkit 5 variants | in place |
| 4 | Loader with the new SVG mark (`frontend/public/loading.svg`) | brandkit mark | in place |
| 5 | Logo + loading enhancement (animations, dark variant, favicon) | design tokens | in place |

### B.2 Supply chain — one source of truth

The single graphic source is `brandkit/logo/planinc-mark.svg`. Every website asset is
derived from it:

```
brandkit/logo/planinc-mark.svg   ← the attached file (source of truth)
   │  (design tokens + size transforms)
   ▼
frontend/public/
├── planinc-mark.svg       # app icon / favicon (inline SVG, no build step)
├── planinc-wordmark.svg   # typography-only lockup
├── planinc-lockup-h.svg   # horizontal lockup  (emblem + wordmark)
├── planinc-lockup-v.svg   # vertical lockup    (emblem above wordmark)
├── planinc-mark-white.svg # crisp dark overlay / dark shell
├── loading.svg            # animated loader — new mark, ascending-arrow rise
└── icons/                 # 30/44/71/89/107/142/150/284/310 PNG (legacy PNG set)
```

The legacy `planinc-logo-mark.svg`, `planinc-logo-square.jpg` and the three
`planinc-logo-*.jpg` files stay as *reference assets*, but the functional brand chain
now starts at `planinc-mark.svg` (cleaner token mapping, no bitmap drift).

### B.3 SVG conventions for web assets

- `viewBox` is fixed per asset class:
  - mark/wordmark: `0 0 600 420` (full mark)
  - lockups: `0 0 600 420` (same as mark; vertical lockup stacks emblem above text)
  - loader: `0 0 600 420` (clears the rect; the loader is a mark + motion)
- `width`/`height` are **omitted** from all web assets; the caller sizes them with
  CSS (`width: 100%` / `height: 100%` / `w-8 h-8`…). This is what makes
  "logos of different sizes" free — one asset, any pixel density.
- Gradients keep their `id` from the source mark (`primaryGrad`, `accentGrad`,
  `textGrad`, `glow`). The loader uses the same defs + a new `rise` keyframe.
- Background is an explicit `#F8FAFC` rect so the loader never sees a "transparent
  void" on dark mode — `loading-dark.svg` swaps that rect for `#0b0b0c` and
  `currentColor` for the text gradient.

### B.4 Loader design

`frontend/public/loading.svg`:

```
<svg viewBox="0 0 600 420" role="img" aria-label="PlanInc loading">
  <defs> primaryGrad / accentGrad / textGrad / glow </defs>

  <!-- now a pulsing, lazy background: 60/55/50 gradient discs instead of a
        flat #F8FAFC rect, so the animation has real content to act on -->
  <rect width="100%" height="100%" fill="#F8FAFC" rx="16"/>
  <circle cx="80" cy="300" r="52" fill="url(#primaryGrad)" opacity="0.55"><animate attributeName="opacity" values="0.55;0.2;0.55" dur="2.2s" repeatCount="indefinite"/></circle>
  <circle cx="300" cy="200" r="34" fill="url(#accentGrad)" opacity="0.5"><animate attributeName="opacity" values="0.5;0.15;0.5" dur="2.6s" repeatCount="indefinite"/></circle>
  <circle cx="520" cy="340" r="20" fill="#00C6FF" opacity="0.35"><animate attributeName="opacity" values="0.35;0.05;0.35" dur="2s" repeatCount="indefinite"/></circle>

  <!-- the mark: the hexagon/arrow rises 22px off its resting place -->
  <g transform="translate(200, 45) translateY(0)">
    <!-- hexagon + nodes + sparkline (same artwork as the attached mark) -->
    ...
    <animateTransform attributeName="transform" type="translate"
                      values="200 45; 200 23; 200 45"
                      keyTimes="0;0.5;1"
                      dur="1.6s" repeatCount="indefinite"/>
  </g>

  <!-- PLANINC text rides the same rise, in the text gradient, not a colour -->
  <text x="300" y="300" ...>PLANINC</text>
</svg>
```

Animation design:

- **Rise** (`animateTransform translate`) — the mark + wordmark climb ~22px on a
  1.6s loop, giving the "ascending trend arrow" reading the brand already has.
- **Gradient sweep** — the two glow circles pulse opacity, so the gradient
  sweeps across the screen; the arrows also get a subtle `filter` glow pulse.
- **Pulse** — the loader stays at full opacity the whole time (no fade-out that
  would look like a blank screen).
- **Dark variant** (`loading-dark.svg`) — used on dark-shell pages; reverse
  animation direction on the rise (`translateY(-22)` on entry) so the mark
  "rises into view" instead of dropping onto a dark field.
- **Favicon** — `index.html` already points `rel=icon`/`rel=shortcut icon` at
  `/planinc-mark.svg`. On a chroma/placeholder background the browser shows a
  full-bleed rectangle; replacing the background rect with a 40% opacity
  `#F8FAFC` and making the icon mark 70% opacity + `mix-blend-mode: difference`
  keeps the mark legible at 32×32 without sending a second file.

### B.5 Multi-size rules

| Asset | Used for | Size control |
|-------|----------|--------------|
| `planinc-mark.svg` | favicon, apple-touch-icon fallback, avatar, settings | CSS `w/h/100%` |
| `planinc-lockup-h.svg` | app header, landing | `w-full`, `max-w` |
| `planinc-lockup-v.svg` | doc covers, drawer backgrounds | `w-full`, `max-h` |
| `planinc-wordmark.svg` | README, marketing copy | `w-auto`, `h-8` |
| `planinc-mark-white.svg` | dark overlays, PWA install splash | `fill:white` on a `<rect>` |
| `icons/SquareNxNLogo.png` | manifest/manifest + apple-touch icons (PNG) | 30…310 |

The PNG set is *supplementary*. `manifest.json` prefers the SVG source; the PNGs
stay only where a platform demands raster (Android adaptive icons, iOS 40px
widget, Windows tile). The existing 9-icon set is retained and the manifest
`orientation` change is the only manifest edit.

### B.6 index.html / manifest parity

- `rel=icon` + `rel=shortcut icon` → `/planinc-mark.svg` (already present, kept).
- Apple-touch-icon sizes stay 120/152/167/180, but the referenced PNGs are
  generated from the SVG at 120/152/167/180px (they are **not** the 142/150/284
  set — the 142px PNG is the same asset the system calls, the 150px one is
  152px rounded, and 284px is 167px + 180px, so the ordering is:

  ```
  120 × Square120x120Logo.png   ← 120px exact
  152 × Square152x152Logo.png   ← 152px exact
  167 × Square167x167Logo.png   ← 167px exact
  180 × Square180x180Logo.png   ← 180px exact
  ```
- `manifest.json` `orientation: "portrait"` → `orientation: "any"`. This is
  the PI-014 parity gap the manifest side of the checklist had not yet closed.
- `theme_color`/`background_color` → `#FFFFFF` (light) / `#0b0b0c` (dark) –
  already correct for the two dark modes.
- `<link rel="preload" as="image" imagesrcset="...">` for the loader is *not*
  added; the loader is a small (~6 KB) inline-quality asset and the PWA
  `CacheFirst` rule already covers `.svg`, so preloading would only guard a
  request for a splash-image that the OS never makes.

### B.7 Component layer (React) — the "different sizes" API

`frontend/src/components/PlanincLogo/`:

```
PlanincMark.tsx      # <PlanincMark size="md" variant="filled" />
PlanincWordmark.tsx  # <PlanincWordmark weight={700} />
PlanincLockupH.tsx   # <PlanincLockupH spacing="tight" />
PlanincLockupV.tsx   # <PlanincLockupV spacing="tight" />
PlanincLogo.tsx      # union: mark | wordmark | lockup-h | lockup-v | generic
```

Variant `generic` renders the supplied SVG when a client passes
`<PlanincLogo src="/planinc-mark.svg" className="w-8 h-8" />`; anything not a
`planinc-*` asset falls back to `image-fallback.svg` (already the documented
FallbackImage contract).

### B.8 Status log (this deliverable)

| Phase | What was done | Evidence | Remaining |
|-------|---------------|----------|-----------|
| P1 | tokens + responsive scale | `tokens.css` | — |
| P2 | shadcn + component suite | `components/ui/` | — |
| P3 | settings/appearance/hooks | `PlanincSettings/` | — |
| B.1 | logo/loader brand deliverable | `frontend/public/` + `index.html` + components | — |
