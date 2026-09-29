import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';

type PlanningPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
};

export function PlanningPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className,
}: PlanningPaginationProps) {
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  const windowSize = 5;
  const start = Math.max(1, Math.min(current - Math.floor(windowSize / 2), Math.max(1, pageCount - windowSize + 1)));
  const pages = Array.from({ length: Math.min(windowSize, pageCount) }, (_, index) => start + index);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">
        {t('pagination-summary', { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{t('per-page')}</span>
            <select
              aria-label={t('per-page')}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('previous-page')}
          disabled={current <= 1}
          onClick={() => onPageChange(current - 1)}
        >
          <Icon icon="mdi:chevron-left" width="18" height="18" />
        </Button>
        {pages.map((pageNumber) => (
          <Button
            key={pageNumber}
            size="sm"
            variant={pageNumber === current ? 'default' : 'ghost'}
            aria-current={pageNumber === current ? 'page' : undefined}
            onClick={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </Button>
        ))}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('next-page')}
          disabled={current >= pageCount}
          onClick={() => onPageChange(current + 1)}
        >
          <Icon icon="mdi:chevron-right" width="18" height="18" />
        </Button>
      </div>
    </div>
  );
}
