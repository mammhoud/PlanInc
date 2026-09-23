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
    <div className={`text-ignore flex flex-col items-center justify-center gap-1 w-full ${className}`}>
      <Icon
        className={`text-ignore mt-2 mb-[-5px] !transition-all ${isLoading ? 'h-[30px]' : 'h-0'}`}
        icon="eos-icons:three-dots-loading"
        width="40"
        height="40"
      />
      {isEmpty && (
        <div className={`${isAbsolute ? 'absolute top-[40%]' : ''} select-none text-ignore flex flex-col items-center justify-center gap-2 w-full mt-2 md:mt-10 px-4 text-center`}>
          <div className="flex items-center justify-center gap-2">
            <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
            <div className='text-md text-ignore font-bold break-words'>
              {emptyMessage || t('no-data-here-well-then-time-to-write-a-note')}
            </div>
          </div>
          {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
        </div>
      )}
    </div>
  );
}; 