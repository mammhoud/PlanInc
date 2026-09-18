import { observer } from "mobx-react-lite";
import { PlanIncStore } from '@/store/planincStore';
import { Card } from '@heroui/react';
import { RootStore } from '@/store';
import { ContextMenuTrigger } from '@/components/Common/ContextMenu';
import { Note } from '@shared/lib/types';
import { ShowEditPlanIncModel } from "../PlanIncRightClickMenu";
import { useMediaQuery } from "usehooks-ts";
import { _ } from '@/lib/lodash';
import { useState } from "react";
import { CardBlogBox } from "./cardBlogBox";
import { NoteContent } from "./noteContent";
import { helper } from "@/lib/helper";
import { CardHeader } from "./cardHeader";
import { CardFooter } from "./cardFooter";
import { FocusEditorFixMobile } from "../Common/Editor/editorUtils";
import { AvatarAccount, SimpleCommentList } from "./commentButton";
import { PluginApiStore } from "@/store/plugin/pluginApiStore";
import { PluginRender } from "@/store/plugin/pluginRender";
import { useLocation } from "react-router-dom";
import { SwipeableCard } from "./SwipeableCard";
import { api } from "@/lib/trpc";
import { FullscreenEditor } from "./FullscreenEditor";


export type PlanIncItem = Note & {
  isBlog?: boolean;
  title?: string;
  originURL?: string;
  isExpand?: boolean;
}

interface PlanIncCardProps {
  planincItem: PlanIncItem;
  className?: string;
  account?: AvatarAccount;
  isShareMode?: boolean;
  forceBlog?: boolean;
  defaultExpanded?: boolean;
  glassEffect?: boolean;
  withoutHoverAnimation?: boolean;
  withoutBoxShadow?: boolean;
}

export const PlanIncCard = observer(({ planincItem, account, isShareMode = false, glassEffect = false, forceBlog = false, withoutBoxShadow = false, withoutHoverAnimation = false, className, defaultExpanded = false }: PlanIncCardProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const planinc = RootStore.Get(PlanIncStore);
  const pluginApi = RootStore.Get(PluginApiStore);
  const { pathname } = useLocation();
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);

  // Set isExpand flag to prevent drag when fullscreen editor is open for this note
  planincItem.isExpand = planinc.fullscreenEditorNoteId === planincItem.id;

  if (forceBlog) {
    planincItem.isBlog = true
  } else {
    planincItem.isBlog = ((planincItem.content?.length ?? 0) > (planinc.config.value?.textFoldLength ?? 1000)) && !pathname.includes('/share/')
  }
  planincItem.title = planincItem.content?.split('\n').find(line => {
    if (!line.trim()) return false;
    if (helper.regex.isContainHashTag.test(line)) return false;
    return true;
  }) || '';


  const handleClick = () => {
    if (planinc.isMultiSelectMode) {
      planinc.onMultiSelectNote(planincItem.id!);
    } else if (planincItem.isBlog && !isShareMode) {
      setIsFullscreenEditorOpen(true);
      planinc.fullscreenEditorNoteId = planincItem.id!;
    }
  };

  const handleContextMenu = () => {
    if (isShareMode) return;
    planinc.curSelectedNote = _.cloneDeep(planincItem);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isShareMode) return;
    planinc.curSelectedNote = _.cloneDeep(planincItem);
    ShowEditPlanIncModel();
    FocusEditorFixMobile()
  };

  const handleSwipePin = () => {
    planinc.upsertNote.call({
      id: planincItem.id,
      isTop: !planincItem.isTop
    });
  };

  const handleSwipeDelete = () => {
    api.notes.trashMany.mutate({ ids: [planincItem.id!] }).then(() => {
      planinc.updateTicker++;
    });
  };

  return (
    <>
      {/* Fullscreen Editor Overlay */}
      <FullscreenEditor
        planincItem={planincItem}
        isOpen={isFullscreenEditorOpen}
        onClose={() => setIsFullscreenEditorOpen(false)}
      />

      {(() => {
        const cardContent = (
          <div
            {...(!isShareMode && {
              onContextMenu: handleContextMenu,
              onDoubleClick: handleDoubleClick
            })}
            onClick={handleClick}
          >
            <Card
              onContextMenu={e => !isPc && e.stopPropagation()}
              shadow='none'
              className={`
                flex flex-col p-4 ${glassEffect ? 'bg-transparent' : 'bg-background'} !transition-all group/card
                ${isPc && !planincItem.isShare && !withoutHoverAnimation ? 'hover:translate-y-1' : ''}
                ${planincItem.isBlog ? 'cursor-pointer' : ''}
                ${planinc.curMultiSelectIds?.includes(planincItem.id!) ? 'border-2 border-primary' : ''}
                ${className}
              `}
            >
              <div className="w-full">
                <CardHeader planincItem={planincItem} planinc={planinc} isShareMode={isShareMode} isExpanded={defaultExpanded} account={account} />

                {planincItem.isBlog && (
                  <CardBlogBox planincItem={planincItem} isExpanded={defaultExpanded} />
                )}

                {!planincItem.isBlog && <NoteContent planincItem={planincItem} planinc={planinc} isExpanded={defaultExpanded} isShareMode={isShareMode} />}

                {/* Custom Footer Slots */}
                {pluginApi.customCardFooterSlots
                  .filter(slot => {
                    if (slot.isHidden) return false;
                    if (slot.showCondition && !slot.showCondition(planincItem)) return false;
                    if (slot.hideCondition && slot.hideCondition(planincItem)) return false;
                    return true;
                  })
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((slot) => (
                    <div
                      key={slot.name}
                      className={`mt-4 ${slot.className || ''}`}
                      style={slot.style}
                      onClick={slot.onClick}
                      onMouseEnter={slot.onHover}
                      onMouseLeave={slot.onLeave}
                    >
                      <div style={{ maxWidth: slot.maxWidth }}>
                        <PluginRender content={slot.content} data={planincItem} />
                      </div>
                    </div>
                  ))}

                <CardFooter planincItem={planincItem} planinc={planinc} isShareMode={isShareMode} />
                {!planinc.config.value?.isHideCommentInCard && planincItem.comments && planincItem.comments.length > 0 && (
                  <SimpleCommentList planincItem={planincItem} />
                )}
              </div>
            </Card>
          </div>
        );

        const wrappedContent = isShareMode ? cardContent : (
          <ContextMenuTrigger id="planinc-item-context-menu">
            {cardContent}
          </ContextMenuTrigger>
        );

        // On mobile, wrap with SwipeableCard for swipe actions
        if (!isPc && !isShareMode) {
          return (
            <SwipeableCard
              onPin={handleSwipePin}
              onDelete={handleSwipeDelete}
              isPinned={planincItem.isTop}
            >
              {wrappedContent}
            </SwipeableCard>
          );
        }

        return wrappedContent;
      })()}
    </>
  );
});