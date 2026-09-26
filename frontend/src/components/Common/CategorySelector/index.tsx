import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { api } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/Common/Iconify/icons';

type PlanCategory = {
  id: number;
  name: string;
  color: string;
  icon: string;
};

/**
 * Agenda-lane (plan category) quick filter for the tag rail.
 *
 * Mirrors the lane filter on the plans board, but reachable from the sidebar so
 * a lane is one click away from any note surface. The selection is reflected in
 * `?categoryId=` so a lane filter is linkable and survives a reload.
 */
export const CategorySelector = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.planningCategories.list.query({ includeDisabled: true })
      .then((rows) => {
        if (!cancelled) setCategories(rows as PlanCategory[]);
      })
      .catch((cause) => console.error('Failed to load plan categories', cause))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const rawCategoryId = searchParams.get('categoryId');
  const currentCategoryId = rawCategoryId == null ? null : Number(rawCategoryId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={t('category-filter')}
          className="h-9 w-auto justify-between gap-2"
        >
          <Icon icon="solar:folder-with-files-linear" width="16" height="16" />
          <span className="text-xs font-medium">{t('all-categories')}</span>
          {!isLoading && (
            <span className="text-[10px] text-muted-foreground">{categories.length}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>{t('move-to-category')}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => {
            planinc.updateTagFilter(null);
            navigate('/?path=agenda&type=all', { replace: true });
          }}
          className={currentCategoryId === null ? 'bg-primary/10' : undefined}
        >
          <Icon icon="solar:layers-minimalistic-linear" width="16" height="16" className="mr-2" />
          {t('all-categories')}
        </DropdownMenuItem>

        {categories.map((category) => (
          <DropdownMenuItem
            key={category.id}
            onSelect={() => {
              planinc.updateTagFilter(null);
              navigate(`/?path=agenda&type=all&categoryId=${category.id}`, { replace: true });
            }}
            className={currentCategoryId === category.id ? 'bg-primary/10' : undefined}
          >
            <span
              className="mr-2 flex h-4 w-4 items-center justify-center rounded-full"
              style={{ backgroundColor: category.color }}
            >
              <Icon icon={category.icon} width="11" height="11" className="text-white" />
            </span>
            {category.name}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            planinc.updateTagFilter(null);
            navigate('/?path=agenda&type=all&categoryId=none', { replace: true });
          }}
          className={rawCategoryId === 'none' ? 'bg-primary/10' : undefined}
        >
          <Icon icon="tabler:folder-off" width="16" height="16" className="mr-2" />
          {t('uncategorised')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
