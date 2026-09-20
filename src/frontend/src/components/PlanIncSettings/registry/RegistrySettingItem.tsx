import { observer } from 'mobx-react-lite';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { Item, ItemWithTooltip, SelectDropdown } from '../Item';
import { coerceSettingValue, type SettingDefinition } from '@shared/lib/settingsRegistry';
import { applyAppearance, readAppearance } from '@/lib/appearance';

/**
 * Render one registry setting (PI-011 · P2).
 *
 * This is the whole point of the registry: a new preference is a data entry, not
 * a new `Item` + `Switch` + `api.config.update` block. Each control type is
 * handled once, validation comes from the definition, and the label/hint strings
 * are resolved from the same keys the offline checker verifies.
 *
 * Control types deliberately **not** handled here — `palette`, `font` and `json`
 * — are the ones whose UI is genuinely bespoke (the palette picker, the font
 * picker, the shortcut recorder); those keep their own components and simply
 * appear in the registry so their defaults, scope and validation are still
 * declared in one place.
 */
export const RegistrySettingItem = observer(({ setting }: { setting: SettingDefinition }) => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const value = (planinc.config.value as Record<string, unknown> | undefined)?.[setting.id];

  const write = async (next: unknown) => {
    // Validate before persisting, so a control cannot store an out-of-range or
    // wrong-typed value that every read site would then have to guard against.
    //
    // `changed` means "repaired" (clamped, trimmed to maxLength, filled from the
    // default) — that is a legitimate value and gets stored. Only `invalid`
    // (wrong type, bad URL, value outside an enum) is refused.
    const { value: safe, reason } = coerceSettingValue(setting, next);
    if (reason === 'invalid') {
      RootStore.Get(ToastPlugin).error(t('invalid-setting-value'));
      return;
    }
    await PromiseCall(api.config.update.mutate({ key: setting.id, value: safe }), { autoAlert: false });
    // Refresh the local config so every read site (and the reactive
    // appearance sync in UserStore.use) sees the new value immediately —
    // previously the UI stayed stale until a full reload.
    const next = await planinc.config.call().catch(() => undefined);
    // Optimistic appearance apply for instant feedback while the list
    // round-trips (uiScale/density/line-height/motion/contrast/direction).
    try {
      const cfg = (next ?? planinc.config.value) as Record<string, unknown> | undefined;
      if (cfg && ['density', 'uiScale', 'lineHeight', 'direction', 'reduceMotion', 'contrastBoost', 'shadowStyle', 'cornerStyle'].includes(setting.id)) {
        const merged = { ...(cfg as Record<string, unknown>), [setting.id]: safe };
        applyAppearance(readAppearance(merged), merged.language as string | undefined);
      }
    } catch {
      /* a partially-loaded config simply skips; the sync effect retries */
    }
  };

  // Text/number/slider controls are committed on blur / drag-end rather than per
  // keystroke or per frame: the value is only meaningful once the user is done,
  // and committing continuously would write a row per character.
  const [draft, setDraft] = useState<string>(value === undefined || value === null ? '' : String(value));
  useEffect(() => {
    setDraft(value === undefined || value === null ? '' : String(value));
  }, [value]);

  const label = <>{t(setting.labelKey)}</>;
  const withHint = setting.hintKey
    ? <ItemWithTooltip content={label} toolTipContent={<>{t(setting.hintKey)}</>} />
    : label;

  switch (setting.type) {
    case 'switch':
      return (
        <Item
          leftContent={withHint}
          rightContent={
            <Switch checked={!!value} onCheckedChange={(checked) => write(checked)} />
          }
        />
      );

    case 'select':
      return (
        <Item
          leftContent={withHint}
          rightContent={
            <SelectDropdown
              value={value === undefined || value === null ? '' : String(value)}
              placeholder={t(setting.labelKey)}
              options={(setting.options ?? []).map((option) => ({
                key: option.value,
                label: t(option.labelKey),
              }))}
              onChange={(next) => write(next)}
            />
          }
        />
      );

    case 'number':
      return (
        <Item
          leftContent={withHint}
          rightContent={
            <Input
              type="number"
              className="w-full min-w-0 sm:w-32"
              value={draft}
              min={setting.validation.kind === 'range' ? setting.validation.min : undefined}
              max={setting.validation.kind === 'range' ? setting.validation.max : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                // An empty field keeps the stored value; the coercion below would
                // otherwise turn it into the default on every blur.
                if (draft.trim() === '') {
                  setDraft(value === undefined || value === null ? '' : String(value));
                  return;
                }
                void write(Number(draft));
              }}
            />
          }
        />
      );

    case 'slider': {
      const range = setting.validation.kind === 'range' ? setting.validation : { min: 0, max: 100 };
      const current = typeof value === 'number' ? value : Number(setting.default);
      return (
        <Item
          leftContent={withHint}
          rightContent={
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-48 sm:shrink-0">
              <Slider
                step={1}
                min={range.min}
                max={range.max}
                value={[current]}
                className="w-full"
                // Drag updates the display; the write happens once on release.
                onValueChange={([next]) => setDraft(String(next))}
                onValueCommit={([next]) => void write(next)}
                aria-label={t(setting.labelKey)}
              />
              <span className="text-xs text-desc tabular-nums w-10 text-right">
                {draft === '' ? current : draft}%
              </span>
            </div>
          }
        />
      );
    }

    case 'text':
    case 'secret':
      return (
        <Item
          leftContent={withHint}
          rightContent={
            <Input
              className="w-full min-w-0 sm:w-64"
              type={setting.type === 'secret' ? 'password' : 'text'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void write(draft)}
            />
          }
        />
      );

    default:
      // palette / font / json — bespoke UI owns these; the registry still holds
      // their default, scope and validation.
      return null;
  }
});
