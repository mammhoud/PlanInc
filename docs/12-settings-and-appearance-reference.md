# Settings & Appearance Reference

> **PI-013** · Phases **P2** + **P3** of the PI-011 programme (`10-blinko-parity-and-design-plan.md`)

**What this covers.** How a preference is declared, validated, stored, rendered
and localised; the full registry; how appearance settings reach every surface; and
the commands that prove the whole chain still holds. For *why* the design is this
way, read PI-011 §6 P2/P3 and the phase log in §11.

## 1. How a setting works

```text
shared/lib/settingsRegistry.ts   ← the single declaration (id, type, scope, default, validation, i18n keys)
        │
        ├── server: ZUserPerferConfigKey / ZConfigKey  (which keys exist, and per-user vs instance-wide)
        ├── UI:     PlanincSettings/registry/RegistrySection → RegistrySettingItem
        └── storage: api.config.update  →  one row per key in the config table
```

A preference used to be three facts in three places — a key in `types.ts`, a
hand-written `<Switch>` in `PerferSetting.tsx`, and a default invented at each
read site (`config.value?.x ?? 500`). Now it is one entry. The price of admission
is that the entry must pass `check:settings` (below), which is what keeps the
three views from drifting again.

### Scopes

| Scope | Meaning | Key union |
|---|---|---|
| `user` | Stored per account; each user has their own value. | `ZUserPerferConfigKey` |
| `global` | One value for the instance; typically admin-managed. | `ZConfigKey` |

### Adding a setting

1. Add the key to `ZUserPerferConfigKey` (per-user) or `ZConfigKey` (instance) in
   `src/shared/lib/types.ts`.
2. Add an entry to `SETTINGS` in `src/shared/lib/settingsRegistry.ts` — id,
   section, group, type, scope, default, `labelKey`, and a `validation` block.
3. Add the English string(s) to `src/frontend/public/locales/en/translation.json`.
4. Run `npm run check:settings` from `src/app`. It fails if the id is not a real
   config key, if the scope disagrees with `types.ts`, if the default fails its
   own validation, if an option is outside its enum, or if a string is missing.

That is the whole procedure: no new component, no new persistence code, no new
read-site default. If the control needs bespoke UI (a palette picker, a shortcut
recorder), give it `type: 'palette' | 'font' | 'json'` and render it separately —
the registry still owns its default, scope and validation.

## 2. The registry

Generated from the registry itself — `npm run check:settings -- --markdown`.
Do not hand-edit this table; re-run the command.

| Setting | Section / group | Type | Scope | Default | Validation |
|---|---|---|---|---|---|
| `theme` | appearance / theme | select | user | `system` | `light \| dark \| system` |
| `themeColor` | appearance / theme | palette | user | *(empty)* | string ≤ 96 |
| `themeForegroundColor` | appearance / theme | palette | user | *(empty)* | string ≤ 96 |
| `fontStyle` | appearance / typography | font | user | *(empty)* | string ≤ 64 |
| `uiScale` | appearance / typography | slider | user | `100` | `85`–`125` |
| `lineHeight` | appearance / typography | select | user | `normal` | `compact \| normal \| relaxed` |
| `density` | appearance / layout | select | user | `comfortable` | `comfortable \| compact` |
| `shadowStyle` | appearance / layout | select | user | `soft` | `flat \| soft \| strong` |
| `cornerStyle` | appearance / layout | select | user | `rounded` | `sharp \| rounded` |
| `customBackgroundUrl` | appearance / background | text | global | *(empty)* | string ≤ 2048 |
| `isCloseBackgroundAnimation` | appearance / background | switch | global | `false` | boolean |
| `textFoldLength` | content / cards | number | user | `500` | `50`–`100000` |
| `smallDeviceCardColumns` | content / cards | number | user | `1` | `1`–`2` |
| `mediumDeviceCardColumns` | content / cards | number | user | `2` | `1`–`4` |
| `largeDeviceCardColumns` | content / cards | number | user | `4` | `1`–`6` |
| `pageSize` | content / cards | number | user | `30` | `5`–`200` |
| `maxHomePageWidth` | content / layout | number | user | `0` | `0`–`10000` |
| `timeFormat` | content / meta | select | user | `YYYY-MM-DD HH:mm:ss` | `relative \| YYYY-MM-DD HH:mm:ss \| YYYY-MM-DD HH:mm \| YYYY-MM-DD` |
| `isOrderByCreateTime` | content / meta | switch | user | `false` | boolean |
| `isHideCommentInCard` | content / cards | switch | user | `false` | boolean |
| `hidePcEditor` | content / editor | switch | user | `false` | boolean |
| `isHiddenMobileBar` | content / layout | switch | user | `false` | boolean |
| `toolbarVisibility` | content / editor | text | user | *(empty)* | string ≤ 64 |
| `defaultHomePage` | content / layout | text | user | *(empty)* | string ≤ 256 |
| `reduceMotion` | motion / motion | switch | user | `false` | boolean |
| `direction` | accessibility / direction | select | user | `auto` | `auto \| ltr \| rtl` |
| `contrastBoost` | accessibility / contrast | switch | user | `false` | boolean |
| `isHiddenNotification` | notifications / notifications | switch | user | `false` | boolean |
| `isCloseDailyReview` | notifications / notifications | switch | user | `false` | boolean |
| `language` | notifications / locale | select | user | *(empty)* | string ≤ 16 |
| `isUsePlanIncHub` | workspace / hub | switch | user | `false` | boolean |
| `webhookEndpoint` | workspace / integrations | text | user | *(empty)* | https URL (or empty) |
| `desktopHotkeys` | workspace / desktop | json | user | *(empty)* | JSON string |
| `systemTray` | workspace / desktop | switch | user | `true` | boolean |
| `twoFactorEnabled` | workspace / security | switch | user | `false` | boolean |
| `twoFactorSecret` | workspace / security | secret | user | *(empty)* | string ≤ 128 |

### Not in the table

`palette`, `font` and `json` types render from their own components (the palette
picker, the font picker, the desktop shortcut recorder) — they are still declared
here so their default and validation are not duplicated. `hidden: true` entries
(`themeForegroundColor`, `desktopHotkeys`, `twoFactorSecret`) are written by
another control and never shown as a row.

## 3. Appearance v2

### The idea

Appearance settings are **tokens plus `<html>` attributes**, not component props.
`lib/appearance.ts` writes:

| Attribute / property | Values | CSS effect (`styles/globals.css`) |
|---|---|---|
| `--pi-ui-scale` (inline) | `0.85`–`1.25` | `html { font-size: calc(1rem * var(--pi-ui-scale)) }` |
| `data-line-height` | `compact` / `normal` / `relaxed` | sets `--pi-line-height` (1.4 / 1.55 / 1.8) on `body` |
| `data-density` | `comfortable` / `compact` | compact tightens `--chip-font-size`, `--chip-radius`, `--contextmenu-item-radius` |
| `data-shadow-style` | `flat` / `soft` / `strong` | overrides `--shadow` (flat removes it, strong deepens it per theme) |
| `data-corner-style` | `sharp` / `rounded` | sharp collapses the component radii to a precise edge |
| `data-contrast-boost` | `true` / `false` | overrides `--desc`, `--ignore`, `--border` per theme |
| `data-reduce-motion` | `true` / `false` | sets `--motion-fast`/`--motion-base` to `1ms` |
| `dir` + `data-direction` | `ltr` / `rtl` | resolved from `direction`, with `auto` using an RTL language list |

Because these land on the document, third-party surfaces (Vditor, ECharts,
HeroUI) follow them without a prop being threaded through the tree. Adding a
control therefore costs **one registry entry plus one CSS selector** — and the
selector may only reference tokens (the raw-value linter enforces that).

Motion has two switches that agree: the app-level `reduceMotion` setting and the
`@media (prefers-reduced-motion: reduce)` block in `tokens.css`. Both resolve to
the same token values, so the OS preference alone is enough to disable motion.

### Where appearance is applied

`src/frontend/src/store/user.ts` — on every config load, next to theme, palette and
font application. The palette injection itself is now a single call
(`applyThemePalette()` from `lib/themePalettes.ts`) instead of two copies of the
`.dark`/`.light` `setProperty` dance.

## 4. Verifying the chain

```bash
cd application/tools/PlanInc/src/app

npm run check:settings     # registry integrity + round-trip + i18n coverage
npm run validate:tokens    # the token contract (tiers, theme parity, bridge)
npm run lint:tokens        # raw-value report (migration progress)
npm run lint:tokens:strict # regression gate vs scripts/token-baseline.json
npm run check:contracts    # all of the above in one command
```

| Check | What it proves |
|---|---|
| id integrity | every registry id is a real key in `shared/lib/types.ts` |
| scope | every `user` setting is in `ZUserPerferConfigKey` |
| uniqueness | no duplicate ids or option values |
| defaults | every declared default passes its own validation |
| options | every enum option is inside the enum it validates against |
| aliases | legacy aliases resolve and never shadow a real id |
| round-trip | a partial config fills defaults, preserves provided values, and re-resolving repairs nothing |
| preservation | non-registry keys (models, S3, unknown) pass through untouched |
| i18n | every label/hint/option/section key exists in `en` |
| appearance wiring | `lib/appearance.ts` reads only real registry ids, from the right sections |
| taxonomy | sections/groups are consistent and no group renders empty |

`--markdown` prints the §2 table; `--quiet` prints only the summary.

### Known gap: translations

All 76 registry strings exist in `en`. The other 16 locales are reported as a
**warning** (48 keys each) because PI-009 owns locale parity — the checker names
the gap rather than failing on it, so translation work can land independently.

## Remarks & Notes

- **AI-generated:** this reference was written by an AI agent from the registry
  and the token contract. The §2 table is generated output, and every claim in §3
  corresponds to a rule in `styles/globals.css`.
- **Two switches, one meaning:** `reduceMotion` and the OS media query must stay
  symmetric. If you add a third motion surface, add it to both.
- **`toolbarVisibility` is stored opaquely.** Its shape is owned by the editor
  (`useEditor`); the registry deliberately does not interpret it — that is a
  follow-up, not an oversight.
- **Scope is a fact you verify, not a guess:** two settings were initially
  declared `user` and had to be corrected to `global` because they live in
  `ZConfigKey`. The checker catches exactly this.
