import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import {
  SETTING_SECTIONS,
  settingsInSection,
  type SettingDefinition,
  type SettingSection,
} from '@shared/lib/settingsRegistry';
import { RegistrySettingItem } from './RegistrySettingItem';

/**
 * Render a whole settings section from the registry (PI-011 · P2).
 *
 * Groups become sub-headings, settings become `RegistrySettingItem` controls, and
 * nothing else is needed — adding a setting to `settingsRegistry.ts` makes it
 * appear here with its label, hint, default and validation already in place.
 */
export const RegistrySection = observer(({
  section,
  isDesktop = true,
  groups: onlyGroups,
}: {
  section: SettingSection;
  isDesktop?: boolean;
  /**
   * Render only these groups. Used where a section is partly bespoke — e.g. the
   * appearance panel keeps its own theme/font/background controls and renders
   * the typography + layout groups from here.
   */
  groups?: string[];
}) => {
  const { t } = useTranslation();
  const meta = SETTING_SECTIONS.find((s) => s.section === section);

  const visible = settingsInSection(section)
    .filter((setting) => isDesktop || !setting.desktopOnly)
    .filter((setting) => !onlyGroups || onlyGroups.includes(setting.group));
  if (!visible.length) return null;

  const groups: { group: string; items: SettingDefinition[] }[] = [];
  for (const setting of visible) {
    const existing = groups.find((entry) => entry.group === setting.group);
    if (existing) existing.items.push(setting);
    else groups.push({ group: setting.group, items: [setting] });
  }

  return (
    <div className="flex flex-col">
      {meta && <div className="font-semibold mt-2">{t(meta.labelKey)}</div>}
      {groups.map(({ group, items }) => (
        <div key={`${section}:${group}`} className="flex flex-col">
          <div className="text-xs uppercase tracking-wide text-ignore mt-2">{t(group)}</div>
          {items.map((setting) => (
            <RegistrySettingItem key={setting.id} setting={setting} />
          ))}
        </div>
      ))}
    </div>
  );
});
