import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

interface LoadingAndEmptyProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  isAbsolute?: boolean;
  action?: React.ReactNode;
}

export const LoadingAndEmpty = ({ isLoading, isEmpty, emptyMessage, className, isAbsolute = true, action }: LoadingAndEmptyProps) => {
  const { t } = useTranslation();

  return (
    <div className={`text-ignore flex flex-col items-center justify-center gap-3 w-full py-4 ${className ?? ''}`} role="status" aria-live="polite">
      <Icon
        className={`text-ignore !transition-all ${isLoading ? 'h-[30px]' : 'h-0'}`}
        icon="eos-icons:three-dots-loading"
        width="40"
        height="40"
      />
      {isEmpty && (
        <div className={`${isAbsolute ? 'absolute top-[40%]' : ''} select-none text-ignore flex flex-col items-center justify-center gap-3 w-full mt-4 md:mt-8 px-6 text-center`}>
          <div className="flex items-center justify-center gap-3">
            <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
            <div className='text-base text-ignore font-bold break-words'>
              {emptyMessage || t('no-data-here-well-then-time-to-write-a-note')}
            </div>
          </div>
          {action && <div className="mt-3 flex flex-wrap items-center justify-center gap-3">{action}</div>}
        </div>
      )}
    </div>
  );
}; 