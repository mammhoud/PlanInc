import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';

export type PlanningViewMode = 'list' | 'cards' | 'grid' | 'kanban' | 'calendar' | 'timeline';

const MODE_ICONS: Record<PlanningViewMode, string> = {
  list: 'tabler:list-check',
  cards: 'tabler:cards',
  grid: 'tabler:layout-columns',
  kanban: 'tabler:layout-kanban',
  calendar: 'tabler:calendar-month',
  timeline: 'tabler:timeline',
};

const MODE_LABELS: Record<PlanningViewMode, string> = {
  list: 'view-list',
  cards: 'view-cards',
  grid: 'view-grid',
  kanban: 'view-kanban',
  calendar: 'view-calendar',
  timeline: 'view-timeline',
};

const PLANNING_VIEW_MODES: PlanningViewMode[] = ['list', 'cards', 'grid', 'kanban', 'calendar', 'timeline'];

type PlanningViewSwitchProps = {
  value: PlanningViewMode;
  onChange: (mode: PlanningViewMode) => void;
  /** Modes to expose. Defaults to list/cards/grid. */
  modes?: PlanningViewMode[];
  /** Optional i18n key overrides per mode (e.g. graph canvas in place of cards). */
  labels?: Partial<Record<PlanningViewMode, string>>;
  /** Optional label for accessibility; falls back to the view label. */
  ariaLabel?: string;
  className?: string;
};

/**
 * Shared list/cards/grid switcher used by the planning surfaces. Persistence is
 * owned by the caller (see `usePlanningView`) so each page can scope it.
 */
export function PlanningViewSwitch({ value, onChange, modes = ['list', 'cards', 'grid'], labels, ariaLabel, className }: PlanningViewSwitchProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`} role="group" aria-label={ariaLabel ?? t('view-mode')}>
      {modes.map((mode) => (
        <Button
          key={mode}
          size="sm"
          variant={value === mode ? 'solid' : 'flat'}
          onPress={() => onChange(mode)}
          startContent={<Icon icon={MODE_ICONS[mode]} width="16" height="16" />}
          aria-pressed={value === mode}
        >
          {t(labels?.[mode] ?? MODE_LABELS[mode])}
        </Button>
      ))}
    </div>
  );
}

/** Reads a persisted view mode for a page, falling back to cards. */
export function readPlanningView(storageKey: string, fallback: PlanningViewMode = 'cards'): PlanningViewMode {
  if (typeof window === 'undefined') return fallback;
  const saved = window.localStorage.getItem(storageKey);
  return PLANNING_VIEW_MODES.includes(saved as PlanningViewMode) ? saved as PlanningViewMode : fallback;
}

/**
 * Persisted view-mode state. Backwards compatible with the ad-hoc keys already
 * used by the tickets page (`planinc:tickets:view`).
 */
export function usePlanningView(storageKey: string, fallback: PlanningViewMode = 'cards') {
  const [viewMode, setViewMode] = useState<PlanningViewMode>(() => readPlanningView(storageKey, fallback));
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, viewMode);
  }, [storageKey, viewMode]);
  return [viewMode, setViewMode] as const;
}

/** Applies the shared responsive layout classes for a view mode. */
export function planningViewGridClass(mode: PlanningViewMode, { list = 'grid gap-2', cards = 'grid gap-3 md:grid-cols-2', grid = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' } = {}) {
  return mode === 'list' ? list : mode === 'grid' ? grid : cards;
}
