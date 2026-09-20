import { Icon } from '@/components/Common/Iconify/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Note, NoteType } from '@shared/lib/types';
import { ConvertItemFunction, ShowEditTimeModel } from '../PlanIncRightClickMenu';
import { PlanIncStore } from '@/store/planincStore';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { CommentCount } from './commentButton';
import { PlanIncItem } from '.';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';

interface CardFooterProps {
  planincItem: PlanIncItem;
  planinc: PlanIncStore;
  isShareMode?: boolean;
}

export const CardFooter = ({ planincItem, planinc, isShareMode }: CardFooterProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center">
      <ConvertTypeButton planincItem={planincItem} />
      <RightContent planincItem={planincItem} t={t} />
    </div>
  );
};

export const ConvertTypeButton = ({
  planincItem,
  tooltip,
  toolTipClassNames,
  tooltipPlacement,
}: {
  planincItem: PlanIncItem & any;
  tooltip?: React.ReactNode;
  toolTipClassNames?: any;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}) => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);

  const handleClick = (e) => {
    e.stopPropagation();
    planinc.curSelectedNote = _.cloneDeep(planincItem);
    
    if (planincItem.type === NoteType.TODO) {
      ShowEditTimeModel(true);
    } else {
      ConvertItemFunction();
    }
  };

  const getTodoStatus = () => {
    if (!planincItem.metadata?.expireAt) {
      return { color: 'text-green-500', status: 'no-deadline' };
    }
    
    const expireDate = dayjs(planincItem.metadata.expireAt);
    const now = dayjs();
    
    if (expireDate.isBefore(now)) {
      return { color: 'text-red-500', status: 'expired' };
    } else if (expireDate.diff(now, 'day') <= 3) {
      return { color: 'text-yellow-500', status: 'warning' };
    } else {
      return { color: 'text-green-500', status: 'normal' };
    }
  };

  if (planincItem.type === NoteType.PLANINC) {
    return (
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
            <Icon className="text-yellow-500" icon="basil:lightning-solid" width="12" height="12" />
            <div className="text-desc text-xs font-bold ml-1 select-none">
              {t('planinc')}
              {planincItem.isBlog ? ` · ${t('article')}` : ''}
              {planincItem.isArchived ? ` · ${t('archived')}` : ''}
              {planincItem.isOffline ? ` · ${t('offline')}` : ''}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side={tooltipPlacement} className={toolTipClassNames?.base}>{tooltip ?? t('convert-to') + ' Note'}</TooltipContent>
      </Tooltip>
    );
  }

  if (planincItem.type === NoteType.TODO) {
    const todoStatus = getTodoStatus();
    const getTooltipContent = () => {
      if (!planincItem.metadata?.expireAt) {
        return t('set-deadline');
      }
      const expireDate = dayjs(planincItem.metadata.expireAt);
      if (todoStatus.status === 'expired') {
        return `${t('expired')}: ${expireDate.format('YYYY-MM-DD HH:mm')}`;
      }
      return `${t('expiry-time')}: ${expireDate.format('YYYY-MM-DD HH:mm')}`;
    };

    const getTimeDisplay = () => {
      if (!planincItem.metadata?.expireAt) {
        return null;
      }
      
      const expireDate = dayjs(planincItem.metadata.expireAt);
      const now = dayjs();
      
      if (todoStatus.status === 'expired') {
        const diffInMinutes = now.diff(expireDate, 'minute');
        const diffInHours = now.diff(expireDate, 'hour');
        const diffInDays = now.diff(expireDate, 'day');
        
        if (diffInDays > 0) {
          return t('expired-days', { count: diffInDays });
        } else if (diffInHours > 0) {
          return t('expired-hours', { count: diffInHours });
        } else if (diffInMinutes > 0) {
          return t('expired-minutes', { count: diffInMinutes });
        } else {
          return t('just-expired');
        }
      } else {
        const diffInMinutes = expireDate.diff(now, 'minute');
        const diffInHours = expireDate.diff(now, 'hour');
        const diffInDays = expireDate.diff(now, 'day');
        
        if (diffInDays > 0) {
          return t('days-left', { count: diffInDays });
        } else if (diffInHours > 0) {
          return t('hours-left', { count: diffInHours });
        } else if (diffInMinutes > 0) {
          return t('minutes-left', { count: diffInMinutes });
        } else {
          return t('about-to-expire');
        }
      }
    };

    return (
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
            <Icon className={todoStatus.color} icon="solar:folder-check-bold" width="12" height="12" />
            <div className="text-desc text-xs font-bold ml-1 select-none">
              {t('todo')}
              {planincItem.metadata?.expireAt && (
                <span className={todoStatus.color}>
                  {' · '}{getTimeDisplay()}
                </span>
              )}
              {planincItem.isBlog ? ` · ${t('article')}` : ''}
              {planincItem.isArchived ? ` · ${t('archived')}` : ''}
              {planincItem.isOffline ? ` · ${t('offline')}` : ''}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side={tooltipPlacement} className={toolTipClassNames?.base}>{tooltip ?? getTooltipContent()}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip delayDuration={1500}>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
          <Icon className="text-blue-500" icon="solar:notes-minimalistic-bold-duotone" width="12" height="12" />
          <div className="text-desc text-xs font-bold ml-1 select-none">
            {t('note')}
            {planincItem.isBlog ? ` · ${t('article')}` : ''}
            {planincItem.isArchived ? ` · ${t('archived')}` : ''}
            {planincItem.isOffline ? ` · ${t('offline')}` : ''}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{t('convert-to') + ' PlanInc'}</TooltipContent>
    </Tooltip>
  );
};

const RightContent = ({ planincItem, t }: { planincItem: Note; t: any }) => {
  return (
    <div className="ml-auto flex items-center gap-2">
      {<CommentCount planincItem={planincItem} />}
      {planincItem?.metadata?.isIndexed && (
        <Tooltip delayDuration={1500}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Icon className="!text-ignore opacity-50" icon="hugeicons:ai-beautify" width="16" height="16" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Indexed</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
