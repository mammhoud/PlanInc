/**
 * Settings registry (PI-011 · P2).
 *
 * Before this module, every preference was three separate facts that could drift
 * apart: a key in `types.ts` (`ZUserPerferConfigKey`), a `<Switch>`/`<Select>`
 * block hand-written inside `PerferSetting.tsx`, and a default invented at the
 * read site (`config.value?.x ?? 500`). Adding one setting meant touching all
 * three, and nothing checked that they agreed.
 *
 * Here a setting is declared **once**: its id, section, control type, scope,
 * default, validation, i18n key and any legacy aliases. The UI renders from this
 * list, and `scripts/check-settings-registry.mjs` proves offline that ids are
 * real config keys, defaults pass their own validation, and a config
 * round-trip is stable.
 *
 * Scope rules:
 *   `user`   — stored per account (`ZUserPerferConfigKey`); safe to change freely
 *   `global` — one value for the instance; admin-gated
 *
 * Compatibility: a preference key that is already persisted is **never renamed
 * without an alias**. `aliases` are read as fall-backs (canonical id wins when
 * both are present), so an existing install loads unchanged.
 *
 * Keep this module dependency-free and erasable-TypeScript only: it is imported
 * by the frontend, by the server, and by the offline checker script.
 */

export type SettingScope = 'user' | 'global';

export type SettingSection = 'appearance' | 'content' | 'motion' | 'accessibility' | 'notifications' | 'workspace';

export type SettingType = 'switch' | 'select' | 'number' | 'slider' | 'text' | 'secret' | 'palette' | 'font' | 'json';

/** How a stored value is checked and repaired. */
export type SettingValidation =
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'string'; maxLength?: number }
  | { kind: 'url' }
  | { kind: 'json' };

export type SettingOption = {
  /** Stored value. */
  value: string;
  /** i18n key for the label. */
  labelKey: string;
};

export type SettingDefinition = {
  /** The config key. This is what is written to the database. */
  id: string;
  section: SettingSection;
  /** Sub-heading inside the section; also the UI grouping key. */
  group: string;
  type: SettingType;
  scope: SettingScope;
  /** Applied when the key is absent or fails validation. */
  default: unknown;
  /** i18n key for the label shown next to the control. */
  labelKey: string;
  /** i18n key for the one-line explanation. */
  hintKey?: string;
  validation: SettingValidation;
  options?: readonly SettingOption[];
  /** Rendered only for superadmins (server-side scoped settings). */
  adminOnly?: boolean;
  /** Not shown in the panel; written by another control (e.g. palette pairs). */
  hidden?: boolean;
  /** Needs a reload/restart before it takes effect. */
  requiresReload?: boolean;
  /** Desktop-only (Tauri) surfaces. */
  desktopOnly?: boolean;
  /** Legacy keys read as a fall-back when `id` is absent. */
  aliases?: readonly string[];
};

export const SETTING_SECTIONS: { section: SettingSection; labelKey: string; order: number }[] = [
  { section: 'appearance', labelKey: 'section-appearance', order: 1 },
  { section: 'content', labelKey: 'section-content-display', order: 2 },
  { section: 'motion', labelKey: 'section-motion', order: 3 },
  { section: 'accessibility', labelKey: 'section-accessibility', order: 4 },
  { section: 'notifications', labelKey: 'section-notifications', order: 5 },
  { section: 'workspace', labelKey: 'section-workspace', order: 6 },
];

/** dayjs format strings the app already understands, plus `relative`. */
const TIME_FORMAT_OPTIONS: readonly SettingOption[] = [
  { value: 'relative', labelKey: 'time-format-relative' },
  { value: 'YYYY-MM-DD HH:mm:ss', labelKey: 'time-format-full' },
  { value: 'YYYY-MM-DD HH:mm', labelKey: 'time-format-minute' },
  { value: 'YYYY-MM-DD', labelKey: 'time-format-date' },
];

const DENSITY_OPTIONS: readonly SettingOption[] = [
  { value: 'comfortable', labelKey: 'density-comfortable' },
  { value: 'compact', labelKey: 'density-compact' },
];

const LINE_HEIGHT_OPTIONS: readonly SettingOption[] = [
  { value: 'compact', labelKey: 'line-height-compact' },
  { value: 'normal', labelKey: 'line-height-normal' },
  { value: 'relaxed', labelKey: 'line-height-relaxed' },
];

const DIRECTION_OPTIONS: readonly SettingOption[] = [
  { value: 'auto', labelKey: 'direction-auto' },
  { value: 'ltr', labelKey: 'direction-ltr' },
  { value: 'rtl', labelKey: 'direction-rtl' },
];

const SHADOW_STYLE_OPTIONS: readonly SettingOption[] = [
  { value: 'flat', labelKey: 'shadow-style-flat' },
  { value: 'soft', labelKey: 'shadow-style-soft' },
  { value: 'strong', labelKey: 'shadow-style-strong' },
];

const CORNER_STYLE_OPTIONS: readonly SettingOption[] = [
  { value: 'sharp', labelKey: 'corner-style-sharp' },
  { value: 'rounded', labelKey: 'corner-style-rounded' },
];

/*
 * Responsive overrides (PI-014).
 *
 * The tier is derived from the viewport by default, which is right for a phone
 * but wrong in two common cases: a desktop window dragged narrow (the shell
 * flips to a drawer the user did not ask for) and a tablet held in a keyboard
 * case, where the wide layout is wanted without a pointer. These three settings
 * let the user overrule the automatic decision; `auto` keeps today's behaviour
 * and is the default, so no existing install changes. `platform/overrides.ts`
 * is the only reader.
 */
const RESPONSIVE_LAYOUT_OPTIONS: readonly SettingOption[] = [
  { value: 'auto', labelKey: 'responsive-layout-auto' },
  { value: 'compact', labelKey: 'responsive-layout-compact' },
  { value: 'comfortable', labelKey: 'responsive-layout-comfortable' },
];

const SIDE_NAV_MODE_OPTIONS: readonly SettingOption[] = [
  { value: 'auto', labelKey: 'side-nav-mode-auto' },
  { value: 'pinned', labelKey: 'side-nav-mode-pinned' },
  { value: 'drawer', labelKey: 'side-nav-mode-drawer' },
];

const TOUCH_TARGETS_OPTIONS: readonly SettingOption[] = [
  { value: 'auto', labelKey: 'touch-targets-auto' },
  { value: 'coarse', labelKey: 'touch-targets-coarse' },
  { value: 'fine', labelKey: 'touch-targets-fine' },
];

/**
 * Every preference the app exposes.
 *
 * Ordering here is the rendering order inside a group; `SETTING_SECTIONS` orders
 * the sections themselves.
 */
export const SETTINGS: readonly SettingDefinition[] = [
  /* ---------------------------------------------------------------- appearance */
  {
    id: 'theme',
    section: 'appearance',
    group: 'theme',
    type: 'select',
    scope: 'user',
    default: 'system',
    labelKey: 'theme',
    validation: { kind: 'enum', values: ['light', 'dark', 'system'] },
    options: [
      { value: 'light', labelKey: 'theme-light' },
      { value: 'dark', labelKey: 'theme-dark' },
      { value: 'system', labelKey: 'theme-system' },
    ],
  },
  {
    id: 'themeColor',
    section: 'appearance',
    group: 'theme',
    type: 'palette',
    scope: 'user',
    default: '',
    labelKey: 'theme-color',
    hintKey: 'theme-color-hint',
    validation: { kind: 'string', maxLength: 96 },
  },
  {
    id: 'themeForegroundColor',
    section: 'appearance',
    group: 'theme',
    type: 'palette',
    scope: 'user',
    default: '',
    labelKey: 'theme-foreground-color',
    validation: { kind: 'string', maxLength: 96 },
    hidden: true,
  },
  {
    id: 'fontStyle',
    section: 'appearance',
    group: 'typography',
    type: 'font',
    scope: 'user',
    default: '',
    labelKey: 'font-style',
    validation: { kind: 'string', maxLength: 64 },
  },
  {
    id: 'uiScale',
    section: 'appearance',
    group: 'typography',
    type: 'slider',
    scope: 'user',
    default: 100,
    labelKey: 'ui-scale',
    hintKey: 'ui-scale-hint',
    validation: { kind: 'range', min: 85, max: 125 },
  },
  {
    id: 'lineHeight',
    section: 'appearance',
    group: 'typography',
    type: 'select',
    scope: 'user',
    default: 'normal',
    labelKey: 'line-height',
    validation: { kind: 'enum', values: ['compact', 'normal', 'relaxed'] },
    options: LINE_HEIGHT_OPTIONS,
  },
  {
    id: 'density',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'comfortable',
    labelKey: 'density',
    hintKey: 'density-hint',
    validation: { kind: 'enum', values: ['comfortable', 'compact'] },
    options: DENSITY_OPTIONS,
  },
  {
    id: 'shadowStyle',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'soft',
    labelKey: 'shadow-style',
    hintKey: 'shadow-style-hint',
    validation: { kind: 'enum', values: ['flat', 'soft', 'strong'] },
    options: SHADOW_STYLE_OPTIONS,
  },
  {
    id: 'cornerStyle',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'rounded',
    labelKey: 'corner-style',
    hintKey: 'corner-style-hint',
    validation: { kind: 'enum', values: ['sharp', 'rounded'] },
    options: CORNER_STYLE_OPTIONS,
  },
  {
    id: 'responsiveLayout',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'auto',
    labelKey: 'responsive-layout',
    hintKey: 'responsive-layout-hint',
    validation: { kind: 'enum', values: ['auto', 'compact', 'comfortable'] },
    options: RESPONSIVE_LAYOUT_OPTIONS,
  },
  {
    id: 'sideNavMode',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'auto',
    labelKey: 'side-nav-mode',
    hintKey: 'side-nav-mode-hint',
    validation: { kind: 'enum', values: ['auto', 'pinned', 'drawer'] },
    options: SIDE_NAV_MODE_OPTIONS,
  },
  {
    id: 'touchTargets',
    section: 'appearance',
    group: 'layout',
    type: 'select',
    scope: 'user',
    default: 'auto',
    labelKey: 'touch-targets',
    hintKey: 'touch-targets-hint',
    validation: { kind: 'enum', values: ['auto', 'coarse', 'fine'] },
    options: TOUCH_TARGETS_OPTIONS,
  },
  {
    id: 'customBackgroundUrl',
    section: 'appearance',
    group: 'background',
    type: 'text',
    // instance-wide today (it lives in `ZConfigKey`, not the per-user union), and
    // it styles the login/share pages as well as the app — so it stays global.
    // Promoting it to per-user is a follow-up, not a registry decision.
    scope: 'global',
    default: '',
    labelKey: 'custom-background-url',
    validation: { kind: 'string', maxLength: 2048 },
  },
  {
    id: 'isCloseBackgroundAnimation',
    section: 'appearance',
    group: 'background',
    type: 'switch',
    scope: 'global',
    default: false,
    labelKey: 'close-background-animation',
    validation: { kind: 'boolean' },
  },

  /* ------------------------------------------------------------- content display */
  {
    id: 'textFoldLength',
    section: 'content',
    group: 'cards',
    type: 'number',
    scope: 'user',
    default: 500,
    labelKey: 'text-fold-length',
    hintKey: 'text-fold-length-hint',
    validation: { kind: 'range', min: 50, max: 100000 },
  },
  {
    id: 'smallDeviceCardColumns',
    section: 'content',
    group: 'cards',
    type: 'number',
    scope: 'user',
    default: 1,
    labelKey: 'small-device-card-columns',
    validation: { kind: 'range', min: 1, max: 2 },
  },
  {
    id: 'mediumDeviceCardColumns',
    section: 'content',
    group: 'cards',
    type: 'number',
    scope: 'user',
    default: 2,
    labelKey: 'medium-device-card-columns',
    validation: { kind: 'range', min: 1, max: 4 },
  },
  {
    id: 'largeDeviceCardColumns',
    section: 'content',
    group: 'cards',
    type: 'number',
    scope: 'user',
    default: 4,
    labelKey: 'large-device-card-columns',
    validation: { kind: 'range', min: 1, max: 6 },
  },
  {
    id: 'pageSize',
    section: 'content',
    group: 'cards',
    type: 'number',
    scope: 'user',
    default: 30,
    labelKey: 'page-size',
    hintKey: 'page-size-hint',
    validation: { kind: 'range', min: 5, max: 200 },
  },
  {
    id: 'maxHomePageWidth',
    section: 'content',
    group: 'layout',
    type: 'number',
    scope: 'user',
    default: 0,
    labelKey: 'max-home-page-width',
    hintKey: 'max-home-page-width-hint',
    validation: { kind: 'range', min: 0, max: 10000 },
  },
  {
    id: 'timeFormat',
    section: 'content',
    group: 'meta',
    type: 'select',
    scope: 'user',
    default: 'YYYY-MM-DD HH:mm:ss',
    labelKey: 'time-format',
    validation: {
      kind: 'enum',
      values: ['relative', 'YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm', 'YYYY-MM-DD'],
    },
    options: TIME_FORMAT_OPTIONS,
  },
  {
    id: 'isOrderByCreateTime',
    section: 'content',
    group: 'meta',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'order-by-create-time',
    validation: { kind: 'boolean' },
  },
  {
    id: 'isHideCommentInCard',
    section: 'content',
    group: 'cards',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'hide-comment-in-card',
    validation: { kind: 'boolean' },
  },
  {
    id: 'hidePcEditor',
    section: 'content',
    group: 'editor',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'hide-pc-editor',
    validation: { kind: 'boolean' },
  },
  {
    id: 'isHiddenMobileBar',
    section: 'content',
    group: 'layout',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'hidden-mobile-bar',
    hintKey: 'hidden-mobile-bar-hint',
    validation: { kind: 'boolean' },
  },
  {
    id: 'toolbarVisibility',
    section: 'content',
    group: 'editor',
    type: 'text',
    scope: 'user',
    default: '',
    labelKey: 'toolbar-visibility',
    // Shape is owned by the editor (`useEditor` reads it as an opaque mode
    // token); the registry stores it without interpreting it.
    validation: { kind: 'string', maxLength: 64 },
  },
  {
    id: 'defaultHomePage',
    section: 'content',
    group: 'layout',
    type: 'text',
    scope: 'user',
    default: '',
    labelKey: 'default-home-page',
    hintKey: 'default-home-page-hint',
    validation: { kind: 'string', maxLength: 256 },
  },

  /* -------------------------------------------------------------------- motion */
  {
    id: 'reduceMotion',
    section: 'motion',
    group: 'motion',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'reduce-motion',
    hintKey: 'reduce-motion-hint',
    validation: { kind: 'boolean' },
  },

  /* -------------------------------------------------------------- accessibility */
  {
    id: 'direction',
    section: 'accessibility',
    group: 'direction',
    type: 'select',
    scope: 'user',
    default: 'auto',
    labelKey: 'text-direction',
    hintKey: 'text-direction-hint',
    validation: { kind: 'enum', values: ['auto', 'ltr', 'rtl'] },
    options: DIRECTION_OPTIONS,
  },
  {
    id: 'contrastBoost',
    section: 'accessibility',
    group: 'contrast',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'contrast-boost',
    hintKey: 'contrast-boost-hint',
    validation: { kind: 'boolean' },
  },

  /* ------------------------------------------------------------- notifications */
  {
    id: 'isHiddenNotification',
    section: 'notifications',
    group: 'notifications',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'hide-notification',
    validation: { kind: 'boolean' },
  },
  {
    id: 'isCloseDailyReview',
    section: 'notifications',
    group: 'notifications',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'close-daily-review',
    validation: { kind: 'boolean' },
  },
  {
    id: 'language',
    section: 'notifications',
    group: 'locale',
    type: 'select',
    scope: 'user',
    default: '',
    labelKey: 'language',
    // Empty means "let i18next's detector decide"; the switcher owns the list.
    validation: { kind: 'string', maxLength: 16 },
  },

  /* ----------------------------------------------------------------- workspace */
  {
    id: 'isUsePlanIncHub',
    section: 'workspace',
    group: 'hub',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'use-hub',
    validation: { kind: 'boolean' },
  },
  {
    id: 'webhookEndpoint',
    section: 'workspace',
    group: 'integrations',
    type: 'text',
    scope: 'user',
    default: '',
    labelKey: 'webhook-endpoint',
    hintKey: 'webhook-endpoint-hint',
    validation: { kind: 'url' },
  },
  {
    id: 'desktopHotkeys',
    section: 'workspace',
    group: 'desktop',
    type: 'json',
    scope: 'user',
    default: '',
    labelKey: 'desktop-hotkeys',
    validation: { kind: 'json' },
    desktopOnly: true,
    hidden: true,
  },
  {
    id: 'systemTray',
    section: 'workspace',
    group: 'desktop',
    type: 'switch',
    scope: 'user',
    default: true,
    labelKey: 'system-tray',
    validation: { kind: 'boolean' },
    desktopOnly: true,
  },
  {
    id: 'twoFactorEnabled',
    section: 'workspace',
    group: 'security',
    type: 'switch',
    scope: 'user',
    default: false,
    labelKey: 'two-factor-enabled',
    validation: { kind: 'boolean' },
  },
  {
    id: 'twoFactorSecret',
    section: 'workspace',
    group: 'security',
    type: 'secret',
    scope: 'user',
    default: '',
    labelKey: 'two-factor-secret',
    validation: { kind: 'string', maxLength: 128 },
    hidden: true,
  },
];

/* ------------------------------------------------------------------- lookups */

const BY_ID = new Map<string, SettingDefinition>(SETTINGS.map((s) => [s.id, s]));

/** canonical id → the registry entry that reads it */
const BY_ALIAS = new Map<string, SettingDefinition>();
for (const setting of SETTINGS) {
  for (const alias of setting.aliases ?? []) {
    if (BY_ID.has(alias)) continue;
    BY_ALIAS.set(alias, setting);
  }
}

/** The registry entry for an id or one of its legacy aliases. */
export function findSetting(id: string | undefined | null): SettingDefinition | undefined {
  if (!id) return undefined;
  return BY_ID.get(id) ?? BY_ALIAS.get(id);
}

/** Resolve a (possibly legacy) key to the canonical id it belongs to. */
export function canonicalSettingId(id: string): string {
  return (BY_ID.get(id) ? id : BY_ALIAS.get(id)?.id) ?? id;
}

/** Entries in a section, in declaration order, hiding non-UI entries by default. */
export function settingsInSection(section: SettingSection, options?: { includeHidden?: boolean }): SettingDefinition[] {
  return SETTINGS.filter((s) => s.section === section && (options?.includeHidden || !s.hidden));
}

/** Every setting id the registry owns — used by the integrity check. */
export function settingIds(): string[] {
  return SETTINGS.map((s) => s.id);
}

/* ---------------------------------------------------------------- validation */

export type CoercionResult = {
  value: unknown;
  /** True when the stored value had to be repaired (or was missing). */
  changed: boolean;
  reason?: 'missing' | 'invalid';
};

function isJson(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return true;
  try { JSON.parse(value); return true; } catch { return false; }
}

/**
 * Coerce a stored value to what the setting promises.
 *
 * Anything invalid falls back to the declared default rather than propagating a
 * broken value into the UI — the previous behaviour was an unchecked
 * `config.value?.x ?? 500` at every read site.
 */
export function coerceSettingValue(setting: SettingDefinition, raw: unknown): CoercionResult {
  if (raw === undefined || raw === null || raw === '') {
    // '' is a legitimate stored value for the text-ish types — including `url`,
    // where it means "no endpoint configured" rather than "invalid endpoint".
    const allowsEmpty =
      setting.validation.kind === 'string' ||
      setting.validation.kind === 'json' ||
      setting.validation.kind === 'url';
    if (allowsEmpty && raw === '' && setting.default === '') {
      return { value: '', changed: false };
    }
    return { value: setting.default, changed: true, reason: 'missing' };
  }

  const invalid = (): CoercionResult => ({ value: setting.default, changed: true, reason: 'invalid' });

  switch (setting.validation.kind) {
    case 'boolean':
      return typeof raw === 'boolean' ? { value: raw, changed: false } : invalid();

    case 'enum':
      return setting.validation.values.includes(String(raw))
        ? { value: String(raw), changed: false }
        : invalid();

    case 'range': {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(num)) return invalid();
      const { min, max } = setting.validation;
      const clamped = Math.min(max, Math.max(min, num));
      return { value: clamped, changed: clamped !== num };
    }

    case 'string': {
      if (typeof raw !== 'string') return invalid();
      const { maxLength } = setting.validation;
      if (maxLength !== undefined && raw.length > maxLength) {
        return { value: raw.slice(0, maxLength), changed: true };
      }
      return { value: raw, changed: false };
    }

    case 'url': {
      if (typeof raw !== 'string') return invalid();
      if (raw === '') return { value: '', changed: false };
      try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:'
          ? { value: raw, changed: false }
          : invalid();
      } catch { return invalid(); }
    }

    case 'json':
      return isJson(raw) ? { value: raw, changed: false } : invalid();
  }
}

/* ------------------------------------------------------------------ resolving */

export type ResolvedConfig = {
  /** Known settings, normalised, plus every unrecognised key passed through. */
  config: Record<string, unknown>;
  /** Settings that had to be repaired or defaulted, for logging/diagnostics. */
  repairs: { id: string; reason: 'missing' | 'invalid' }[];
  /** Legacy alias keys that were read, with the canonical id they fed. */
  aliasHits: { alias: string; id: string }[];
};

/**
 * Normalise a raw config document.
 *
 * Unknown keys are **preserved**: the config document also carries global and
 * integration keys the registry does not own, and dropping them would be
 * destructive. Aliases are read as fall-backs — a canonical value always wins.
 */
export function resolveConfig(raw: Record<string, unknown> | undefined | null): ResolvedConfig {
  const source = raw ?? {};
  const config: Record<string, unknown> = { ...source };
  const repairs: ResolvedConfig['repairs'] = [];
  const aliasHits: ResolvedConfig['aliasHits'] = [];

  for (const setting of SETTINGS) {
    let candidate = source[setting.id];
    if (candidate === undefined) {
      for (const alias of setting.aliases ?? []) {
        if (source[alias] !== undefined) {
          candidate = source[alias];
          aliasHits.push({ alias, id: setting.id });
          break;
        }
      }
    }
    const { value, changed, reason } = coerceSettingValue(setting, candidate);
    config[setting.id] = value;
    if (changed) repairs.push({ id: setting.id, reason: reason ?? 'invalid' });
  }

  return { config, repairs, aliasHits };
}

/* --------------------------------------------------------------- UI grouping */

export type SettingGroup = {
  section: SettingSection;
  group: string;
  settings: SettingDefinition[];
};

/** Sections → groups → settings, in declared order. The panel renders this. */
export function settingGroups(options?: { includeHidden?: boolean; isDesktop?: boolean }): SettingGroup[] {
  const groups: SettingGroup[] = [];
  const ordered = [...SETTING_SECTIONS].sort((a, b) => a.order - b.order);
  for (const { section } of ordered) {
    const visible = settingsInSection(section, options).filter(
      (s) => (options?.isDesktop ?? true) || !s.desktopOnly,
    );
    const seen: string[] = [];
    for (const setting of visible) {
      if (!seen.includes(setting.group)) seen.push(setting.group);
    }
    for (const group of seen) {
      groups.push({ section, group, settings: visible.filter((s) => s.group === group) });
    }
  }
  return groups;
}
