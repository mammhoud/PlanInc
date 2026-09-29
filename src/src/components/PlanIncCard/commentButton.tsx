import Editor from '../Common/Editor';
import { useEffect, useState } from 'react';
import { api } from '@/lib/trpc';
import { UserStore } from '@/store/user';
import { PromisePageState, PromiseState } from '@/store/standard/PromiseState';
import { type Comment } from '@/lib/apiTypes';
import { Icon } from '@/components/Common/Iconify/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { PlanIncStore } from '@/store/planincStore';
import { Note } from '@/lib/apiTypes';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';
import { useTranslation } from 'react-i18next';

import { DialogStore } from '@/store/module/Dialog';
import { observer } from 'mobx-react-lite';
import { ScrollArea } from '../Common/ScrollArea';
import { MarkdownRender } from '../Common/MarkdownRender';
import { AnimatePresence, motion } from 'framer-motion';
import Avatar from "boring-avatars";
import { HubStore } from '@/store/hubStore';
import axios from 'axios';
import i18n from '@/lib/i18n';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { PlanIncItem } from '.';
import { getPlanIncEndpoint } from '@/lib/planincEndpoint';
import { FallbackImage } from '../Common/FallbackImage';
export type AvatarAccount = { image?: string; nickname?: string; name?: string; id?: any | number; };

export const UserAvatar = observer(({ account, guestName, isAuthor, planincItem, withoutName, size = 20 }: {
  account?: AvatarAccount;
  guestName?: string;
  isAuthor?: boolean;
  planincItem?: PlanIncItem;
  withoutName?: boolean;
  size?: number;
}) => {
  const { t } = useTranslation();
  const displayName = account ? (account.nickname || account.name) : (guestName || '');
  return (
    <div className="flex items-center gap-2">
      {account ? (
        <>
          {account.image ? (
            <FallbackImage src={planincItem?.originURL ? (planincItem.originURL + account.image) : getPlanIncEndpoint(account.image + `?token=${RootStore.Get(UserStore).tokenData.value?.token}`)} radius="full" alt="" width={size} height={size} />
          ) : (
            <Avatar
              size={size}
              name={displayName}
              variant="beam"
            />
          )}
          {!withoutName && <span className="text-sm font-medium">{displayName}</span>}
          {isAuthor && planincItem && String(account.id) === String(planincItem.accountId) && (
            <Badge variant="warning">{t('author')}</Badge>
          )}
        </>
      ) : (
        <>
          <Avatar
            size={size}
            name={displayName}
            variant="beam"
          />
          {!withoutName && <span className="text-sm font-medium">{displayName}</span>}
        </>
      )}
    </div>
  );
});

// Recursive Comment Component for nested rendering
const NestedComment = observer(({
  comment,
  planincItem,
  depth = 0,
  Store
}: {
  comment: Comment['items'][0],
  planincItem: PlanIncItem,
  depth?: number,
  Store: any
}) => {
  const { t } = useTranslation();
  const user = RootStore.Get(UserStore);
  const maxDepth = 5; // Limit nesting depth to prevent UI issues

  return (
    <div
      key={comment.id}
      className={`mb-2 border-divider p-2 rounded-2xl bg-background ${depth > 0 ? 'ml-6' : ''}`}
      style={{ marginLeft: `${Math.min(depth * 24, maxDepth * 24)}px` }}
    >
      <div className="flex items-center justify-between">
        <UserAvatar
          account={comment.account || undefined}
          guestName={comment.guestName || undefined}
          isAuthor={true}
          planincItem={planincItem}
        />
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => Store.handleReply(comment.id, comment.account?.nickname || comment.account?.name || comment.guestName || '')}
          >
            <Icon icon="akar-icons:comment" width="16" height="16" />
          </Button>
          {(user.id === comment.note?.account?.id || user.id === comment.account?.id) && !planincItem.originURL && (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => Store.handleDelete.call(comment.id)}
            >
              <Icon icon="akar-icons:trash" width="16" height="16" />
            </Button>
          )}
        </div>
      </div>
      <div className="p-2 -mt-2">
        <MarkdownRender content={comment.content} />
        <div className="text-xs text-desc mt-1 flex items-center gap-2">
          <span>{dayjs(comment.createdAt).fromNow()}</span>
          {Store.safeUA(comment?.guestUA ?? '') && (
            <>
              <span>·</span>
              <span>{t('from')} {Store.safeUA(comment?.guestUA ?? '')}</span>
            </>
          )}
        </div>
      </div>

      {/* Render nested replies recursively */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply) => (
            <NestedComment
              key={reply.id}
              comment={reply}
              planincItem={planincItem}
              depth={depth + 1}
              Store={Store}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export const CommentDialog = observer(({ planincItem }: { planincItem: PlanIncItem }) => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const [content, setContent] = useState('');
  const user = RootStore.Get(UserStore);
  const hubStore = RootStore.Get(HubStore);

  const Store = RootStore.Local(() => ({
    reply: {
      id: null as number | null,
      name: ''
    },
    commentList: new PromisePageState({
      function: async ({ page, size }) => {
        if (planincItem.originURL) {
          const res = await axios.post(planincItem.originURL + '/api/v1/comment/list', {
            noteId: planincItem.id,
            page,
            size,
            orderBy: 'desc'
          })
          return res.data.items
        }

        const res = await api.comments.list.query({
          noteId: planincItem.id!,
          page,
          size,
          orderBy: 'desc'
        })
        return res.items
      }
    }),
    handleReply: (commentId: number, commentName: string) => {
      Store.reply = {
        id: commentId,
        name: commentName
      }
    },
    handleSendComment: new PromiseState({
      function: async ({ content }: { content: string }) => {
        if (!content.trim()) return;
        const params: any = {
          content,
          noteId: planincItem.id
        }
        if (Store.reply.id) {
          params.parentId = Store.reply.id
        }

        if (planincItem.originURL) {
          await axios.post(planincItem.originURL + '/api/v1/comment/create', {
            ...params,
            guestName: user.userInfo.value?.nickName ?? user.userInfo.value?.name
          });
        } else {
          await api.comments.create.mutate(params);
        }

        await Store.commentList.resetAndCall({});
        setContent('');
        planinc.updateTicker++
      }
    }),
    handleDelete: new PromiseState({
      function: async (commentId: number) => {
        if (planincItem.originURL) {
          await axios.post(planincItem.originURL + '/api/v1/comment/delete', {
            id: commentId
          });
        } else {
          await api.comments.delete.mutate({ id: commentId });
        }
        await Store.commentList.resetAndCall({});
        planinc.updateTicker++
      }
    }),
    safeUA: (ua: string) => {
      try {
        const _ua = JSON.parse(ua)
        return _ua.os.name + ' ' + _ua.browser.name
      } catch (error) {
        return ""
      }
    }
  }));

  useEffect(() => {
    Store.commentList.resetAndCall({});
  }, []);

  return (
    <div>
      {/* Comment List */}
      {Store.commentList.isEmpty ? (
        <div className="text-center text-gray-500 py-4">{t('no-comments-yet')}</div>
      ) : (
        <ScrollArea className="md:max-h-[550px] max-h-[400px] overflow-y-auto -mt-4" onBottom={async () => {
          await Store.commentList.callNextPage({});
        }}>
          {Store.commentList.value?.map((comment: Comment['items'][0]) => (
            <NestedComment
              key={comment.id}
              comment={comment}
              planincItem={planincItem}
              depth={0}
              Store={Store}
            />
          ))}
        </ScrollArea>
      )}

      {/* Reply UI */}
      <AnimatePresence>
        {Store.reply.id && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between mt-3 p-2 bg-background rounded-lg"
          >
            <div className="text-sm text-yellow-500 font-bold">
              {t('reply-to')} <span>@{Store.reply.name}</span>
            </div>
            <Icon
              icon="material-symbols:close"
              className="cursor-pointer text-default-400 hover:text-default-500"
              width="18"
              onClick={() => Store.reply = { id: null, name: '' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor */}
      <div className="pt-3">
        <Editor
          mode='comment'
          content={content}
          onChange={setContent}
          onSend={async ({ content }) => {
            await Store.handleSendComment.call({ content })
          }}
          isSendLoading={Store.handleSendComment.loading.value}
          originFiles={[]}
          originReference={[]}
          hiddenToolbar
        />
      </div>
    </div>
  );
});

export const SimpleCommentList = observer(({ planincItem }: { planincItem: PlanIncItem }) => {
  const { t } = useTranslation();
  const commentList = planincItem.comments;

  if (!commentList || commentList?.length === 0) {
    return <div className="text-center text-gray-500 py-2">{t('no-comments-yet')}</div>;
  }

  return (
    <div className="bg-secondbackground rounded-lg px-1 py-2 mt-1">
      {commentList.map((comment: Comment['items'][0]) => (
        <div key={comment.id} className="pb-[2px] ">
          <div className="ml-1 text-xs flex-1">
            <span className='font-bold text-primary mr-1'> {comment.guestName || comment.account?.nickname || comment.account?.name || t('anonymous')}:</span>
            {comment.content}
          </div>
        </div>
      ))}
    </div>
  );
});

export const ShowCommentDialog = async (noteId: number) => {
  const planinc = RootStore.Get(PlanIncStore);
  const dialog = RootStore.Get(DialogStore);

  try {
    dialog.setData({
      isOpen: true,
      size: 'lg',
      title: i18n.t('comment'),
      content: <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
    });

    const noteDetail = await planinc.noteDetail.call({ id: noteId });

    if (!noteDetail) {
      RootStore.Get(ToastPlugin).error(i18n.t('note-not-found'));
      dialog.setData({ isOpen: false });
      return;
    }

    dialog.setData({
      isOpen: true,
      size: 'lg',
      title: `${i18n.t('comment')} ${noteDetail._count?.comments ? `(${noteDetail._count.comments})` : ''}`,
      content: <CommentDialog planincItem={noteDetail} />
    });

  } catch (error) {
    console.error('Failed to load note detail:', error);
    RootStore.Get(ToastPlugin).error(i18n.t('failed-to-load-comments'));
    dialog.setData({ isOpen: false });
  }
};

export const CommentButton = observer(({ planincItem, alwaysShow = false }: { planincItem: Note, alwaysShow?: boolean }) => {
  const { t } = useTranslation();
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'lg',
      title: `${i18n.t('comment')} ${planincItem._count?.comments ? `(${planincItem._count.comments})` : ''}`,
      content: <CommentDialog planincItem={planincItem} />
    });
  };

  return (
    <Tooltip delayDuration={1500}>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          {/* Was `isIOSDevice ? 'opacity-60' : 'opacity-0 group-hover/card:…'` — an OS
              check standing in for a touch check, and still unreachable on any
              non-iOS touch device. `.hover-only-on-fine` keys off the pointer. */}
          <Icon
            icon="akar-icons:comment"
            width="15"
            height="15"
            className={`cursor-pointer ml-2 ${alwaysShow ? '!text-ignore' : '!text-desc hover-only-on-fine group-hover/card:translate-x-0 translate-x-1'}`}
            onClick={handleClick}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>{t('comment')}</TooltipContent>
    </Tooltip>
  );
});

export const CommentCount = observer(({ planincItem }: { planincItem: Note }) => {
  if (planincItem?._count?.comments == 0) return null;
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'lg',
      title: `${i18n.t('comment')} ${planincItem._count?.comments ? `(${planincItem._count.comments})` : ''}`,
      content: <CommentDialog planincItem={planincItem} />
    });
  };
  return (
    <div className="flex items-center gap-1 hover:bg-background rounded-full px-1 py-0.5 cursor-pointer" onClick={handleClick}>
      <CommentButton planincItem={planincItem} alwaysShow={true} />
      <span className="text-sm text-ignore">{planincItem?._count?.comments}</span>
    </div>
  );
});
