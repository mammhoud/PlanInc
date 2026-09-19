import { Button } from '@heroui/react';
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

/**
 * Shared pagination footer for planning lists. Callers typically render it only
 * when there is at least one item, so short collections stay uncluttered.
 */
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

  // Build a compact window of pages around the current one.
  const windowSize = 5;
  const start = Math.max(1, Math.min(current - Math.floor(windowSize / 2), Math.max(1, pageCount - windowSize + 1)));
  const pages = Array.from({ length: Math.min(windowSize, pageCount) }, (_, index) => start + index);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 pt-2 ${className ?? ''}`}>
      <p className="text-xs text-foreground-500">
        {t('pagination-summary', { from, to, total })}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-foreground-500">{t('per-page')}</span>
            <select
              aria-label={t('per-page')}
              className="rounded-lg bg-content2 px-2 py-1 text-xs outline-none"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        )}
        <Button
          size="sm"
          variant="flat"
          isIconOnly
          aria-label={t('previous-page')}
          isDisabled={current <= 1}
          onPress={() => onPageChange(current - 1)}
        >
          <Icon icon="mdi:chevron-left" width="18" height="18" />
        </Button>
        {pages.map((pageNumber) => (
          <Button
            key={pageNumber}
            size="sm"
            variant={pageNumber === current ? 'solid' : 'flat'}
            aria-current={pageNumber === current ? 'page' : undefined}
            onPress={() => onPageChange(pageNumber)}
          >
            {pageNumber}
          </Button>
        ))}
        <Button
          size="sm"
          variant="flat"
          isIconOnly
          aria-label={t('next-page')}
          isDisabled={current >= pageCount}
          onPress={() => onPageChange(current + 1)}
        >
          <Icon icon="mdi:chevron-right" width="18" height="18" />
        </Button>
      </div>
    </div>
  );
}
