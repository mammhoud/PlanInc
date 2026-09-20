import { Icon } from '@/components/Common/Iconify/icons';
import { Tooltip } from '@heroui/react';
import { Copy } from "../Common/Copy";
import { LeftCickMenu, ShowEditTimeModel } from "../PlanIncRightClickMenu";
import { PlanIncStore } from '@/store/planincStore';
import { Note, NoteType } from '@shared/lib/types';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { useIsIOS } from '@/lib/hooks';
import { DialogStore } from '@/store/module/Dialog';
import { PlanIncShareDialog } from '../PlanIncShareDialog';
import { observer } from 'mobx-react-lite';
import { AvatarAccount, CommentButton, UserAvatar } from './commentButton';
import { HistoryButton } from '../PlanIncNoteHistory/HistoryButton';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';

interface CardHeaderProps {
  planincItem: Note;
  planinc: PlanIncStore;
  isShareMode: boolean;
  isExpanded?: boolean;
  account?: AvatarAccount;
}

export const CardHeader = observer(({ planincItem, planinc, isShareMode, isExpanded, account }: CardHeaderProps) => {
  const { t } = useTranslation();
  const iconSize = isExpanded ? '20' : '16';
  const isIOSDevice = useIsIOS();

  const handleTodoToggle = async (e) => {
    e.stopPropagation();

    try {
      if (planincItem.isArchived) {
        await planinc.upsertNote.call({
          id: planincItem.id,
          isArchived: false
        });
        planinc.updateTicker++
      } else {
        await planinc.upsertNote.call({
          id: planincItem.id,
          isArchived: true
        });
        planinc.updateTicker++
      }
    } catch (error) {
      console.error('Error toggling TODO status:', error);
    }
  };

  return (
    <div className={`flex items-center select-none ${isExpanded ? 'mb-4' : 'mb-1'}`}>
      <div className={`flex items-center w-full gap-1 ${isExpanded ? 'text-base' : 'text-xs'}`}>
        {planincItem.isShare && !isShareMode && (
          <Tooltip content={t('shared')} delay={1000}>
            <div className="flex items-center gap-2">
              <Icon
                className="cursor-pointer "
                icon="prime:eye"
                width={iconSize}
                height={iconSize}
              />
            </div>
          </Tooltip>
        )}

        {planincItem.isInternalShared && (
          <Tooltip content={t('internal-shared')} delay={1000}>
            <div className="flex items-center gap-2">
              <Icon
                className="cursor-pointer "
                icon="prime:users"
                width={iconSize}
                height={iconSize}
              />
            </div>
          </Tooltip>
        )}

        {isShareMode && account && (
          <UserAvatar account={account} planincItem={planincItem} />
        )}

        {!isShareMode && planincItem.created_by && (
          <span className="text-desc text-xs ml-1" title={t('created-by')}>
            {t('by')} {planincItem.created_by}
          </span>
        )}

        {planincItem.type === NoteType.TODO && (
          <Tooltip content={planincItem.isArchived ? t('restore') : t('complete')} delay={1000}>
            <div
              className="flex items-center cursor-pointer"
              onClick={handleTodoToggle}
            >
              <Icon
                icon={planincItem.isArchived ? "solar:refresh-circle-bold" : "mdi:circle-outline"}
                className={`${planincItem.isArchived ? 'text-blue-500' : 'text-green-500'} hover:opacity-80`}
                width="16"
                height="16"
              />
            </div>
          </Tooltip>
        )}

        <Tooltip content={t('edit-time')} delay={1000}>
          <div 
            className={`${isExpanded ? 'text-sm' : 'text-xs'} text-desc cursor-pointer transition-colors`}
            onClick={(e) => {
              e.stopPropagation();
              planinc.curSelectedNote = _.cloneDeep(planincItem);
              ShowEditTimeModel();
            }}
          >
            {planinc.config.value?.timeFormat == 'relative'
              ? dayjs(planinc.config.value?.isOrderByCreateTime ? planincItem.createdAt : planincItem.updatedAt).fromNow()
              : dayjs(planinc.config.value?.isOrderByCreateTime ? planincItem.createdAt : planincItem.updatedAt).format(planinc.config.value?.timeFormat ?? 'YYYY-MM-DD HH:mm:ss')
            }
          </div>
        </Tooltip>

        {/* `.hover-only-on-fine` replaces the old `opacity-0 group-hover/card:opacity-100`
            plus its `isIOSDevice ? 'opacity-100'` escape hatch: keying off the
            pointer capability covers every touch device, not just iOS. */}
        <Copy
          size={16}
          className="ml-auto hover-only-on-fine group-hover/card:translate-x-0 translate-x-1"
          content={planincItem.content + `\n${planincItem.attachments?.map(i => window.location.origin + i.path).join('\n')}`}
        />

        <CommentButton planincItem={planincItem} />

        {isShareMode && (
          <Tooltip content="RSS" delay={1000}>
            <div className="flex items-center gap-2">
              <Icon onClick={e => {
                window.open(window.location.origin + `/api/rss/${planincItem.accountId}/atom?row=20`)
              }} icon="mingcute:rss-2-fill" className='hover-only-on-fine group-hover/card:translate-x-0 ml-2 cursor-pointer hover:text-primary' width="16" height="16" />
            </div>
          </Tooltip>
        )}

        {!isShareMode && (
          <ShareButton planincItem={planincItem} />
        )}

        {/* History button for viewing note versions */}
        {!isShareMode && !!planincItem._count?.histories && planincItem._count?.histories > 0 && (
          <HistoryButton
            noteId={planincItem.id!}
            className={'hover-only-on-fine group-hover/card:translate-x-0 ml-2 cursor-pointer hover:text-primary text-desc mt-[1px]'}
          />
        )}

        {/* Trash/Recycle bin button */}
        {!isShareMode && (
          <Tooltip content={t('trash')} delay={1000}>
            {/* A recycled note deliberately keeps its delete action visible; only
                the normal case is a hover reveal. */}
            <Icon
              icon="mingcute:delete-2-line"
              width={iconSize}
              height={iconSize}
              className={`${planincItem.isRecycle ? 'opacity-100 text-red-500' : 'hover-only-on-fine group-hover/card:translate-x-0 text-desc'} ml-2 cursor-pointer hover:text-red-500`}
              onClick={(e) => {
                e.stopPropagation();
                PromiseCall(api.notes.trashMany.mutate({ ids: [planincItem.id!] })).then(() => {
                  planinc.updateTicker++;
                });
              }}
            />
          </Tooltip>
        )}

        {planincItem.isTop && (
          <Icon
            className={isIOSDevice ? 'ml-[10px] text-[#EFC646]' : "ml-auto group-hover/card:ml-2 text-[#EFC646]"}
            icon="solar:bookmark-bold"
            width={iconSize}
            height={iconSize}
          />
        )}

        {!isShareMode && (
          <LeftCickMenu
            className={isIOSDevice ? 'ml-[10px]' : (planincItem.isTop ? "ml-[10px]" : 'ml-auto group-hover/card:ml-2')}
            onTrigger={() => { planinc.curSelectedNote = _.cloneDeep(planincItem) }}
          />
        )}
      </div>
    </div>
  );
});

const ShareButton = observer(({ planincItem }: { planincItem: Note }) => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore);
  return (
    <Tooltip content={t('share')} delay={1000}>
      <div className="flex items-center gap-2">
        <Icon
          icon="tabler:share-2"
          width="16"
          height="16"
          className="cursor-pointer text-desc ml-2 hover-only-on-fine group-hover/card:translate-x-0 translate-x-1"
          onClick={async (e) => {
            e.stopPropagation()
            planinc.curSelectedNote = _.cloneDeep(planincItem)
            RootStore.Get(DialogStore).setData({
              isOpen: true,
              size: 'md',
              title: t('share'),
              content: <PlanIncShareDialog defaultSettings={{
                shareUrl: planincItem.shareEncryptedUrl ? window.location.origin + '/share/' + planincItem.shareEncryptedUrl : undefined,
                expiryDate: planincItem.shareExpiryDate ?? undefined,
                password: planincItem.sharePassword ?? '',
                isShare: planincItem.isShare
              }} />
            })
          }}
        />
      </div>
    </Tooltip>
  );
})
