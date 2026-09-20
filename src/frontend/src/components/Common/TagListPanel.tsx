import { useEffect, useState } from "react";
import TreeView, { flattenTree } from "react-accessible-treeview";
import { observer } from "mobx-react-lite";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { Icon } from '@/components/Common/Iconify/icons';
import { SideBarItem } from "../Layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { useTheme } from "next-themes";
import { ShowUpdateTagDialog } from "./UpdateTagPop";
import { api } from "@/lib/trpc";
import { PromiseCall } from "@/store/standard/PromiseState";
import { BaseStore } from "@/store/baseStore";
import { useTranslation } from "react-i18next";
import { eventBus } from "@/lib/event";
import { DialogStore } from "@/store/module/Dialog";
import { AiStore } from "@/store/aiStore";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSideNav } from '@/platform/PlatformProvider';

const Emoji = ({ icon }: { icon: string }) => {
  return <>
    {
      icon ? <>
        {
          // @ts-ignore
          icon?.includes(':') ?
            // @ts-ignore
            <Icon icon={icon} width="22" height="22" /> :
            icon
        }
      </> : <Icon icon="mingcute:hashtag-line" width="20" height="20" />
    }
  </>
}

const ShowEmojiPicker = (element, theme) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    title: 'Emoji Picker',
    content: <div className='w-full'>
      <EmojiPicker width='100%' className='border-none' emojiStyle={EmojiStyle.NATIVE} theme={theme == 'dark' ? Theme.DARK : Theme.LIGHT} onEmojiClick={async e => {
        await PromiseCall(api.tags.updateTagIcon.mutate({ id: element.id, icon: e.emoji }))
        RootStore.Get(DialogStore).close()
      }} />
    </div>
  })
}

const CustomIcon = observer(({ onSubmit }: { onSubmit: (icon: string) => void }) => {
  const [icon, setIcon] = useState('')
  return <div className='w-full flex flex-col gap-2'>
    <div className="space-y-1.5">
      <Label>Custom Icon</Label>
      <Input
        placeholder='Enter custom icon like "ri:star-smile-line"'
        value={icon}
        onChange={e => setIcon(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        PlanInc use <a className="text-blue-500" href="https://icon-sets.iconify.design/" target="_blank">Iconify</a> for custom icon
      </p>
    </div>
    <div className="flex justify-end">
      <Button onClick={() => { onSubmit(icon) }}>Submit</Button>
    </div>
  </div>
})

const ShowCustomIconPicker = (element, theme) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    title: 'Custom Icon',
    content: <CustomIcon onSubmit={async (icon) => {
      await PromiseCall(api.tags.updateTagIcon.mutate({ id: element.id, icon }))
      RootStore.Get(DialogStore).close()
    }} />
  })
}

export const TagListPanel = observer(() => {
  const planinc = RootStore.Get(PlanIncStore);
  const base = RootStore.Get(BaseStore);
  const { theme } = useTheme();
  const isPc = useSideNav()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const isSelected = (id) => {
    return planinc.noteListFilterConfig.tagId == id && searchParams.get('path') == 'all'
  }
  useEffect(() => { }, [planinc.noteListFilterConfig.tagId])
  return (
    <>
      <div className="ml-2 my-2 text-xs font-bold text-primary">{t('total-tags')}</div>
      <TreeView
        className="mb-4"
        data={flattenTree({
          name: "",
          children: planinc.tagList.value?.listTags,
        })}
        aria-label="directory tree"
        togglableSelect
        clickAction="EXCLUSIVE_SELECT"
        onNodeSelect={(e) => {
        }}
        multiSelect={false}
        nodeRenderer={({
          element,
          isBranch,
          isExpanded,
          getNodeProps,
          level,
          handleSelect,
        }) => (
          <div {...getNodeProps()} style={{ paddingLeft: 20 * (level - 1) + 6 }} >
            <div className={`${SideBarItem}relative group ${(isSelected(element.id)) ? '!bg-primary !text-primary-foreground' : ''}`}
              onClick={e => {
                //@ts-ignore
                base.currentRouter = planinc.allTagRouter
                planinc.updateTagFilter(Number(element.id))
                navigate('/?path=all&tagId=' + element.id, { replace: true })
              }}
            >
              {isBranch ? (
                <div className="flex items-center justify-center h-[24px]">
                  <div className="flex items-center justify-center group-hover:opacity-100 opacity-0 w-0 h-0 group-hover:w-[24px] group-hover:h-[24px] !transition-all" >
                    {isExpanded ?
                      <Icon icon="gravity-ui:caret-down" className="!transition-all" width="20" height="20" />
                      : <Icon icon="gravity-ui:caret-right" className="!transition-all" width="20" height="20" />
                    }
                  </div>
                  <div className="group-hover:opacity-0 opacity-100 w-[24px] group-hover:w-0 !transition-all">
                    {
                      element.metadata?.icon ? <Emoji icon={element.metadata?.icon as string} />
                        : <Icon icon="mingcute:hashtag-line" width="20" height="20" />
                    }
                  </div>
                </div>
              ) : (
                <div>
                  <Emoji icon={element.metadata?.icon as string} />
                </div>
              )}

              <div className="truncate overflow-hidden whitespace-nowrap" title={element.name}>
                {element.name}
                {isBranch && element.children?.length > 0 && (
                  <span className="ml-1 text-xs opacity-60">({element.children.length})</span>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="ml-auto group-hover:opacity-100 opacity-0 !transition-all group-hover:translate-x-0 translate-x-2 cursor-pointer">
                    <Icon icon="ri:more-fill" width="20" height="20" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label="Static Actions">
                  {
                    planinc.showAi ? <DropdownMenuItem key="aiEmoji" onSelect={async () => {
                      if (!isPc) {
                        eventBus.emit('close-sidebar')
                      }
                      await RootStore.Get(AiStore).autoEmoji.call(Number(element.id!), element.name)
                    }}>
                      <div className="flex items-center gap-2">
                        <Icon icon="ri:robot-line" width="20" height="20" />
                        {t('ai-emoji')}
                      </div>
                    </DropdownMenuItem> : <></>
                  }
                  <DropdownMenuItem key="aiEmoji" onSelect={async () => {
                    if (!isPc) {
                      eventBus.emit('close-sidebar')
                    }
                    ShowCustomIconPicker(element, theme)
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon icon="ri:star-smile-line" width="20" height="20" />
                      {t('custom-icon')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="updateIcon" onSelect={async () => {
                    if (!isPc) {
                      eventBus.emit('close-sidebar')
                    }
                    ShowEmojiPicker(element, theme)
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon icon="gg:smile" width="20" height="20" />
                      {t('update-tag-icon')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="Update" onSelect={async () => {
                    if (!isPc) {
                      eventBus.emit('close-sidebar')
                    }
                    ShowUpdateTagDialog({
                      defaultValue: (element.metadata?.path! as string),
                      onSave: async (tagName) => {
                        await PromiseCall(api.tags.updateTagName.mutate({
                          id: element.id as number,
                          oldName: element.metadata?.path as string,
                          newName: tagName
                        }))
                        navigate('/?path=all')
                      }
                    })
                  }}  >
                    <div className="flex items-center gap-2">
                      <Icon icon="ic:outline-drive-file-rename-outline" width="20" height="20" />
                      {t('update-name')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="moveUp" onSelect={async () => {
                    if (!isPc) {
                      eventBus.emit('close-sidebar')
                    }
                    const findSiblings = (tags: any[], targetId: number) => {
                      for (const tag of tags) {
                        if (tag.id === targetId) {
                          return tags;
                        }
                        if (tag.children) {
                          const result = findSiblings(tag.children, targetId);
                          if (result) return result;
                        }
                      }
                      return null;
                    };

                    const siblings = findSiblings(planinc.tagList.value?.listTags || [], element.id as number);
                    if (siblings) {
                      const currentIndex = siblings.findIndex(t => t.id === element.id);
                      if (currentIndex > 0 && siblings[currentIndex - 1]) {
                        const prevTag = siblings[currentIndex - 1];
                        await PromiseCall(api.tags.updateTagOrder.mutate({
                          id: element.id as number,
                          sortOrder: prevTag.sortOrder - 1
                        }));
                        await planinc.tagList.call();
                      }
                    }
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon icon="icon-park-outline:up-one" width="20" height="20" />
                      {t('move-up')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="moveDown" onSelect={async () => {
                    if (!isPc) {
                      eventBus.emit('close-sidebar')
                    }
                    const findSiblings = (tags: any[], targetId: number) => {
                      for (const tag of tags) {
                        if (tag.id === targetId) {
                          return tags;
                        }
                        if (tag.children) {
                          const result = findSiblings(tag.children, targetId);
                          if (result) return result;
                        }
                      }
                      return null;
                    };

                    const siblings = findSiblings(planinc.tagList.value?.listTags || [], element.id as number);
                    if (siblings) {
                      const currentIndex = siblings.findIndex(t => t.id === element.id);
                      if (currentIndex >= 0 && currentIndex < siblings.length - 1 && siblings[currentIndex + 1]) {
                        const nextTag = siblings[currentIndex + 1];
                        await PromiseCall(api.tags.updateTagOrder.mutate({
                          id: element.id as number,
                          sortOrder: nextTag.sortOrder + 1
                        }));
                        await planinc.tagList.call();
                      }
                    }
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon className="rotate-180" icon="icon-park-outline:up-one" width="20" height="20" />
                      {t('move-down')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="deletetag" className="text-destructive" onSelect={async () => {
                    PromiseCall(api.tags.deleteOnlyTag.mutate(({ id: element.id as number })))
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon icon="hugeicons:delete-02" width="20" height="20" />
                      {t('delete-only-tag')}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem key="delete" className="text-destructive" onSelect={async () => {
                    PromiseCall(api.tags.deleteTagWithAllNote.mutate(({ id: element.id as number })))
                  }}>
                    <div className="flex items-center gap-2">
                      <Icon icon="hugeicons:delete-02" width="20" height="20" />
                      {t('delete-tag-with-note')}
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div >
        )}
      />
    </>
  );
});
