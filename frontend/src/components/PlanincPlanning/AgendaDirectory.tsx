import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { SideBarItem } from '@/components/Layout';

export type AgendaTypeParam = 'all' | 'planinc' | 'note' | 'todo';

type CategoryRow = { id: number; name: string; color?: string; icon?: string };

type Props = {
  type: AgendaTypeParam;
  onTypeChange: (next: AgendaTypeParam) => void;
  categories: CategoryRow[];
  categoryFilter: number | 'all' | 'none';
  onCategoryChange: (next: number | 'all' | 'none') => void;
  showCategories?: boolean;
};

/**
 * Left directory for the Agenda stream: type sections first (the default
 * first view), then plan categories. Mirrors the side-nav lane pattern so
 * the board always has a separating index beside the cards.
 */
export function AgendaDirectory({
  type,
  onTypeChange,
  categories,
  categoryFilter,
  onCategoryChange,
  showCategories = true,
}: Props) {
  const { t } = useTranslation();

  const types: { id: AgendaTypeParam; label: string; icon: string }[] = [
    { id: 'all', label: t('all'), icon: 'solar:layers-linear' },
    { id: 'planinc', label: t('type-plan'), icon: 'solar:bill-list-linear' },
    { id: 'note', label: t('type-note'), icon: 'hugeicons:note' },
    { id: 'todo', label: t('type-task'), icon: 'solar:bill-check-linear' },
  ];

  return (
    <nav
      className="flex w-full shrink-0 flex-col gap-1 md:w-52 md:border-r md:border-divider md:pr-3"
      aria-label={t('agenda-directory')}
      data-testid="agenda-directory"
    >
      <div className="ml-1 mt-1 text-xs font-bold text-primary">{t('directory-types')}</div>
      <ul className="flex flex-col gap-0.5">
        {types.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              className={`${SideBarItem} w-full ${type === row.id ? '!bg-primary !text-primary-foreground' : ''}`}
              aria-pressed={type === row.id}
              onClick={() => onTypeChange(row.id)}
            >
              <Icon icon={row.icon} width="18" height="18" />
              <span className="truncate">{row.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {showCategories && (
        <>
          <div className="ml-1 mt-3 text-xs font-bold text-primary">{t('directory-categories')}</div>
          <ul className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                className={`${SideBarItem} w-full ${categoryFilter === 'all' ? '!bg-primary !text-primary-foreground' : ''}`}
                aria-pressed={categoryFilter === 'all'}
                onClick={() => onCategoryChange('all')}
              >
                <Icon icon="tabler:folder" width="18" height="18" />
                <span className="truncate">{t('all-categories')}</span>
              </button>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  className={`${SideBarItem} w-full ${categoryFilter === category.id ? '!bg-primary !text-primary-foreground' : ''}`}
                  aria-pressed={categoryFilter === category.id}
                  onClick={() => onCategoryChange(category.id)}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: category.color || 'var(--muted)' }}
                  >
                    <Icon icon={category.icon || 'tabler:folder'} width="12" height="12" className="text-white" />
                  </span>
                  <span className="truncate">{category.name}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className={`${SideBarItem} w-full ${categoryFilter === 'none' ? '!bg-primary !text-primary-foreground' : ''}`}
                aria-pressed={categoryFilter === 'none'}
                onClick={() => onCategoryChange('none')}
              >
                <Icon icon="tabler:folder-off" width="18" height="18" />
                <span className="truncate">{t('uncategorised')}</span>
              </button>
            </li>
          </ul>
        </>
      )}
    </nav>
  );
}
