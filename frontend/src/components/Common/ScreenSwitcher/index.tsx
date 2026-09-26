import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/Common/Iconify/icons';
import { GuidedTooltip } from '@/components/Common/GuidedTooltip';
import { cn } from '@/lib/utils';

export interface PreviewScreen {
  id: string;
  /** Existing i18n key (parity rule: never invent keys for demo chrome). */
  labelKey: string;
  icon: string;
}

interface ScreenSwitcherProps {
  screens: PreviewScreen[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * Floating vertical tab switcher, fixed at the right-center edge.
 * Collapses to a single chevron; every control carries a GuidedTooltip.
 */
export function ScreenSwitcher({ screens, active, onChange }: ScreenSwitcherProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        'fixed right-3 top-1/2 z-40 -translate-y-1/2',
        'flex flex-col items-center gap-1 rounded-full glass-effect p-1.5 shadow-large',
      )}
      role="tablist"
      aria-label="preview screens"
    >
      {!collapsed &&
        screens.map((screen) => (
          <GuidedTooltip
            key={screen.id}
            label={t(screen.labelKey)}
            side="left"
            align="center"
          >
            <Button
              role="tab"
              aria-selected={active === screen.id}
              variant={active === screen.id ? 'default' : 'ghost'}
              size="icon"
              className={cn('rounded-full', active === screen.id && 'shadow-large')}
              onClick={() => onChange(screen.id)}
            >
              <Icon icon={screen.icon} className="text-xl" />
            </Button>
          </GuidedTooltip>
        ))}
      <GuidedTooltip label={t('collapse')} side="left" align="center">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <Icon
            icon="solar:alt-arrow-right-linear"
            className={cn(
              'text-xl transition-transform duration-300',
              collapsed && 'rotate-180',
            )}
          />
        </Button>
      </GuidedTooltip>
    </div>
  );
}
