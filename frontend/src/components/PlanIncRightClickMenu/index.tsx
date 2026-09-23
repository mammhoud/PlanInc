import { observer } from "mobx-react-lite";
import { PlanIncStore } from '@/store/planincStore';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { ContextMenu, ContextMenuItem } from '@/components/Common/ContextMenu';
import { Icon } from '@/components/Common/Iconify/icons';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { RootStore } from "@/store";
import { DialogStore } from "@/store/module/Dialog";
import { PlanIncEditor } from "../PlanIncEditor";
import { useEffect, useState } from "react";
import { NoteType } from "@shared/lib/types";
import { AiStore } from "@/store/aiStore";
import { parseAbsoluteToLocal } from "@internationalized/date";
import i18n from "@/lib/i18n";
import { PlanIncShareDialog } from "../PlanIncShareDialog";
import { trashNotesWithUndo } from '@/lib/trashWithUndo';
import { BaseStore } from "@/store/baseStore";
import { PluginApiStore } from "@/store/plugin/pluginApiStore";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Note } from "@/lib/apiTypes";
import { PlanIncCard } from "../PlanIncCard";
import { useLocation } from "react-router-dom";
import { ShowCommentDialog } from "../PlanIncCard/commentButton";
import { FocusEditorFixMobile } from "@/components/Common/Editor/editorUtils";
import { useSideNav } from '@/platform/PlatformProvider';


export const ShowEditTimeModel = (showExpired: boolean = false) => {
  const planinc = RootStore.Get(PlanIncStore)
  RootStore.Get(DialogStore).setData({
    size: 'sm' as any,
    isOpen: true,
    onlyContent: true,
    isDismissable: false,
    showOnlyContentCloseButton: true,
    content: () => {
      const [createdAt, setCreatedAt] = useState(planinc.curSelectedNote?.createdAt ?
        parseAbsoluteToLocal(planinc.curSelectedNote.createdAt.toISOString()) : null);

      const [updatedAt, setUpdatedAt] = useState(planinc.curSelectedNote?.updatedAt ?
        parseAbsoluteToLocal(planinc.curSelectedNote.updatedAt.toISOString()) : null);

      const [expireAt, setExpireAt] = useState(planinc.curSelectedNote?.metadata?.expireAt ?
        parseAbsoluteToLocal(new Date(planinc.curSelectedNote.metadata.expireAt).toISOString()) : null);

      const handleSave = () => {
        if (showExpired) {
          // Handle expired date save
          const existingMetadata = planinc.curSelectedNote?.metadata || {};
          
          planinc.upsertNote.call({
            id: planinc.curSelectedNote?.id,
            metadata: {
              ...existingMetadata,
              expireAt: expireAt ? expireAt.toDate().toISOString() : null
            }
          });
        } else {
          // Handle created/updated date save
          if (!createdAt || !updatedAt) return;

          planinc.upsertNote.call({
            id: planinc.curSelectedNote?.id,
            createdAt: createdAt.toDate(),
            updatedAt: updatedAt.toDate()
          });
        }

        RootStore.Get(DialogStore).close();
      }

      return <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 p-4">
          {showExpired ? (
            <>
              <div className="space-y-1">
                <Label>{i18n.t('expiry-time')}</Label>
                <Input
                  type="datetime-local"
                  value={expireAt ? expireAt.toDate().toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setExpireAt(parseAbsoluteToLocal(new Date(e.target.value).toISOString()));
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground font-medium">{i18n.t('quick-select') || 'Quick Select'}:</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const now = new Date();
                      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                      setExpireAt(parseAbsoluteToLocal(tomorrow.toISOString()));
                    }}
                  >
                    {i18n.t('1-day') || '1 Day'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const now = new Date();
                      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                      setExpireAt(parseAbsoluteToLocal(nextWeek.toISOString()));
                    }}
                  >
                    {i18n.t('1-week') || '1 Week'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const now = new Date();
                      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
                      setExpireAt(parseAbsoluteToLocal(nextMonth.toISOString()));
                    }}
                  >
                    {i18n.t('1-month') || '1 Month'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExpireAt(null);
                    }}
                  >
                    {i18n.t('cancel')}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={handleSave}
                >
                  {i18n.t('save')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label>{i18n.t('created-at')}</Label>
                <Input
                  type="datetime-local"
                  value={createdAt ? createdAt.toDate().toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setCreatedAt(parseAbsoluteToLocal(new Date(e.target.value).toISOString()));
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>{i18n.t('updated-at')}</Label>
                <Input
                  type="datetime-local"
                  value={updatedAt ? updatedAt.toDate().toISOString().slice(0, 16) : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setUpdatedAt(parseAbsoluteToLocal(new Date(e.target.value).toISOString()));
                    }
                  }}
                />
              </div>
              <Button
                className="mt-2"
                onClick={handleSave}
              >
                {i18n.t('save')}
              </Button>
            </>
          )}
        </div>
      </div>
    }
  })
}

export const ShowEditPlanIncModel = (size: string = '2xl', mode: 'create' | 'edit' = 'edit', initialData?: { file?: File, text?: string }) => {
  const planinc = RootStore.Get(PlanIncStore)
  RootStore.Get(DialogStore).setData({
    size: size as any,
    isOpen: true,
    onlyContent: true,
    isDismissable: false,
    showOnlyContentCloseButton: true,
    content: <PlanIncEditor isInDialog mode={mode} initialData={initialData} key={`editor-key-${mode}`} onSended={() => {
      RootStore.Get(DialogStore).close()
      planinc.isCreateMode = false
    }} />
  })
}

const handleEdit = (isDetailPage: boolean) => {
  ShowEditPlanIncModel(isDetailPage ? '5xl' : '5xl')
  FocusEditorFixMobile()
}

const handleMultiSelect = () => {
  const planinc = RootStore.Get(PlanIncStore)
  planinc.isMultiSelectMode = true
  planinc.onMultiSelectNote(planinc.curSelectedNote?.id!)
}

const handleSelectAll = () => {
  const planinc = RootStore.Get(PlanIncStore)
  planinc.isMultiSelectMode = true

  const currentPath = new URLSearchParams(window.location.search).get('path');
  let items: Array<{ id?: number | null }> | undefined;

  if (currentPath === 'notes') {
    items = planinc.noteOnlyList.value;
  } else if (currentPath === 'todo') {
    items = planinc.todoList.value;
  } else if (currentPath === 'archived') {
    items = planinc.archivedList.value;
  } else if (currentPath === 'trash') {
    items = planinc.trashList.value;
  } else if (currentPath === 'all') {
    items = planinc.noteList.value;
  } else {
    items = planinc.planincList.value;
  }

  const ids = (items || [])
    .map(n => n.id)
    .filter((id): id is number => typeof id === 'number');

  // Assign directly to avoid toggle side-effects
  planinc.curMultiSelectIds = Array.from(new Set(ids));
}

const handleTop = () => {
  const planinc = RootStore.Get(PlanIncStore)
  planinc.upsertNote.call({
    id: planinc.curSelectedNote?.id,
    isTop: !planinc.curSelectedNote?.isTop
  })
}

const handlePublic = () => {
  const planinc = RootStore.Get(PlanIncStore)
  RootStore.Get(DialogStore).setData({
    size: 'md' as any,
    isOpen: true,
    title: i18n.t('share'),
    isDismissable: false,
    content: <PlanIncShareDialog defaultSettings={{
      shareUrl: planinc.curSelectedNote?.shareEncryptedUrl ? window.location.origin + '/share/' + planinc.curSelectedNote?.shareEncryptedUrl : undefined,
      expiryDate: planinc.curSelectedNote?.shareExpiryDate ?? undefined,
      password: planinc.curSelectedNote?.sharePassword ?? '',
      isShare: planinc.curSelectedNote?.isShare
    }} />
  })

  // planinc.upsertNote.call({
  //   id: planinc.curSelectedNote?.id,
  //   isShare: !planinc.curSelectedNote?.isShare
  // })
}

const handleArchived = () => {
  const planinc = RootStore.Get(PlanIncStore)
  if (planinc.curSelectedNote?.isRecycle) {
    return planinc.upsertNote.call({
      id: planinc.curSelectedNote?.id,
      isRecycle: false,
      isArchived: false
    })
  }

  if (planinc.curSelectedNote?.isArchived) {
    return planinc.upsertNote.call({
      id: planinc.curSelectedNote?.id,
      isArchived: false,
    })
  }

  if (!planinc.curSelectedNote?.isArchived) {
    return planinc.upsertNote.call({
      id: planinc.curSelectedNote?.id,
      isArchived: true
    })
  }
}

const handleAITag = () => {
  const planinc = RootStore.Get(PlanIncStore)
  const aiStore = RootStore.Get(AiStore)
  aiStore.autoTag.call(planinc.curSelectedNote?.id!, planinc.curSelectedNote?.content!)
}

const handleTrash = () => {
  const planinc = RootStore.Get(PlanIncStore)
  void trashNotesWithUndo([planinc.curSelectedNote?.id])
}

const handleDelete = async () => {
  const planinc = RootStore.Get(PlanIncStore)
  PromiseCall(api.notes.deleteMany.mutate({ ids: [planinc.curSelectedNote?.id!] }))
  PromiseCall(api.ai.embeddingDelete.mutate({ id: planinc.curSelectedNote?.id! }))
}

const handleRelatedNotes = async () => {
  const planinc = RootStore.Get(PlanIncStore);
  const dialog = RootStore.Get(DialogStore);
  const toast = RootStore.Get(ToastPlugin);

  try {
    const noteId = planinc.curSelectedNote?.id;
    if (!noteId) return;
    toast.loading(i18n.t('loading'));
    const relatedNotes = await api.notes.relatedNotes.query({ id: noteId });
    toast.dismiss();
    if (relatedNotes.length === 0) {
      toast.error(i18n.t('no-related-notes-found'));
      return;
    }

    dialog.setData({
      size: 'lg' as any,
      isOpen: true,
      title: i18n.t('related-notes'),
      isDismissable: true,
      content: () => {
        return (
          <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
            {relatedNotes.map((note: Note) => (
              <PlanIncCard key={note.id} planincItem={note} withoutHoverAnimation/>
            ))}
          </div>
        );
      }
    });
  } catch (error) {
    toast.dismiss();
    toast.error(i18n.t('operation-failed'));
    console.error("Failed to fetch related notes:", error);
  }
};

const handleComment = () => {
  const planinc = RootStore.Get(PlanIncStore)
  if (planinc.curSelectedNote?.id) {
    ShowCommentDialog(planinc.curSelectedNote.id)
  }
}

export const EditItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2">
    <Icon icon="tabler:edit" width="20" height="20" />
    <div>{t('edit')}</div>
  </div>
})

export const MutiSelectItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2" >
    <Icon icon="mingcute:multiselect-line" width="20" height="20" />
    <div>{t('multiple-select')}</div>
  </div>
})

export const SelectAllItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2">
    <Icon icon="lucide:square-check" width="20" height="20" />
    <div>{t('select-all')}</div>
  </div>
})

export const ConvertItemFunction = () => {
  const planinc = RootStore.Get(PlanIncStore)
  planinc.upsertNote.call({
    id: planinc.curSelectedNote?.id,
    type: planinc.curSelectedNote?.type == NoteType.NOTE ? NoteType.PLANINC : NoteType.NOTE
  })
}

export const ConvertItem = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore)
  return <div className="flex items-start gap-2">
    <Icon icon="ri:exchange-2-line" width="20" height="20" />
    <div>{t('convert-to')} {planinc.curSelectedNote?.type == NoteType.NOTE ?
      <span className='text-yellow-500'>{t('planinc')}</span> : <span className='text-blue-500'>{t('note')}</span>}</div>
  </div>
})

export const TopItem = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore)
  return <div className="flex items-start gap-2">
    <Icon icon="lets-icons:pin" width="20" height="20" />
    <div>{planinc.curSelectedNote?.isTop ? t('cancel-top') : t('top')}</div>
  </div>
})

export const PublicItem = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore)
  return <div className="flex items-start gap-2">
    <Icon icon="ic:outline-share" width="20" height="20" />
    <div>{t('share')}</div>
  </div>
})

export const ArchivedItem = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore)
  return <div className="flex items-start gap-2">
    <Icon icon="eva:archive-outline" width="20" height="20" />
    {planinc.curSelectedNote?.isArchived || planinc.curSelectedNote?.isRecycle ? t('recovery') : t('archive')}
  </div>
})

export const AITagItem = observer(() => {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2">
      <Icon icon="majesticons:tag-line" width="20" height="20" />
      <div>{t('ai-tag')}</div>
    </div>
  );
});

export const RelatedNotesItem = observer(() => {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2">
      <Icon icon="mdi:note-search-outline" width="20" height="20" />
      <div>{t('related-notes')}</div>
    </div>
  );
});

export const CommentItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2">
    <Icon icon="akar-icons:comment" width="20" height="20" />
    <div>{t('comment')}</div>
  </div>
})

export const TrashItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2 text-red-500">
    <Icon icon="mingcute:delete-2-line" width="20" height="20" />
    <div>{t('trash')}</div>
  </div>
})

export const DeleteItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2 text-red-500">
    <Icon icon="mingcute:delete-2-line" width="20" height="20" />
    <div>{t('delete')}</div>
  </div>
})

export const EditTimeItem = observer(() => {
  const { t } = useTranslation();
  return <div className="flex items-start gap-2">
    <Icon icon="mdi:clock-edit-outline" width="20" height="20" />
    <div>{t('edit-time')}</div>
  </div>
})

export const PlanIncRightClickMenu = observer(() => {
  const [isDetailPage, setIsDetailPage] = useState(false)
  const location = useLocation()
  
  const planinc = RootStore.Get(PlanIncStore)
  const pluginApi = RootStore.Get(PluginApiStore)
  const isPc = useSideNav()

  useEffect(() => {
    setIsDetailPage(location.pathname.includes('/detail'))
  }, [location.pathname])

  return <ContextMenu className='font-bold' id="planinc-item-context-menu" hideOnLeave={false} animation="zoom">
    <ContextMenuItem onClick={() => handleEdit(isDetailPage)}>
      <EditItem />
    </ContextMenuItem>

    {!isDetailPage ? (
      <>
        <ContextMenuItem onClick={() => handleMultiSelect()}>
          <MutiSelectItem />
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleSelectAll()}>
          <SelectAllItem />
        </ContextMenuItem>
      </>
    ) : <></>}

    <ContextMenuItem onClick={() => ShowEditTimeModel()}>
      <EditTimeItem />
    </ContextMenuItem>

    <ContextMenuItem onClick={ConvertItemFunction}>
      <ConvertItem />
    </ContextMenuItem>

    <ContextMenuItem onClick={handleTop}>
      <TopItem />
    </ContextMenuItem>

    <ContextMenuItem onClick={handleArchived}>
      <ArchivedItem />
    </ContextMenuItem>

    {!planinc.curSelectedNote?.isRecycle ? (
      <ContextMenuItem onClick={handlePublic}>
      <PublicItem />
    </ContextMenuItem>
    ) : <></>}

    {!isPc ? (
      <ContextMenuItem onClick={handleComment}>
        <CommentItem />
      </ContextMenuItem>
    ) : <></>}

    {planinc.config.value?.mainModelId ? (
      <ContextMenuItem onClick={handleAITag}>
        <AITagItem />
      </ContextMenuItem>
    ) : <></>}

    {planinc.config.value?.mainModelId ? (
      <ContextMenuItem onClick={handleRelatedNotes}>
        <RelatedNotesItem />
      </ContextMenuItem>
    ) : <></>}

    {pluginApi.customRightClickMenus.map((menu) => (
      <ContextMenuItem key={menu.name} onClick={() => menu.onClick(planinc.curSelectedNote!)} disabled={menu.disabled}>
        <div className="flex items-start gap-2">
          {menu.icon && <Icon icon={menu.icon} width="20" height="20" />}
          <div>{menu.label}</div>
        </div>
      </ContextMenuItem>
    ))}

    {!planinc.curSelectedNote?.isRecycle ? (
      <ContextMenuItem onClick={handleTrash}>
        <TrashItem />
      </ContextMenuItem>
    ) : <></>}

    {planinc.curSelectedNote?.isRecycle ? (
      <ContextMenuItem onClick={handleDelete}>
        <DeleteItem />
      </ContextMenuItem>
    ) : <></>}
  </ContextMenu>
})

export const LeftCickMenu = observer(({ onTrigger, className }: { onTrigger: () => void, className: string }) => {
  const [isDetailPage, setIsDetailPage] = useState(false)
  const planinc = RootStore.Get(PlanIncStore)
  const pluginApi = RootStore.Get(PluginApiStore)
  const location = useLocation()
  const isPc = useSideNav()

  useEffect(() => {
    setIsDetailPage(location.pathname.includes('/detail'))
  }, [location.pathname])

  const disabledKeys = isDetailPage ? ['MutiSelectItem'] : []

  return <Dropdown onOpenChange={e => onTrigger()}>
    <DropdownTrigger >
      <div onClick={onTrigger} className={`${className} text-desc hover:text-primary cursor-pointer hover:scale-1.3 !transition-all`}>
        <Icon icon="fluent:more-vertical-16-regular" width="16" height="16" />
      </div>
    </DropdownTrigger>
    <DropdownMenu aria-label="Static Actions" disabledKeys={disabledKeys}>
      <DropdownItem key="EditItem" onPress={() => handleEdit(isDetailPage)}><EditItem /></DropdownItem>
      {!isDetailPage ? (
        <>
          <DropdownItem key="MutiSelectItem" onPress={() => handleMultiSelect()}>
            <MutiSelectItem />
          </DropdownItem>
          <DropdownItem key="SelectAllItem" onPress={() => handleSelectAll()}>
            <SelectAllItem />
          </DropdownItem>
        </>
      ) : null}
      <DropdownItem key="EditTimeItem" onPress={() => ShowEditTimeModel()}> <EditTimeItem /></DropdownItem>
      <DropdownItem key="ConvertItem" onPress={ConvertItemFunction}> <ConvertItem /></DropdownItem>
      <DropdownItem key="TopItem" onPress={handleTop}> <TopItem />  </DropdownItem>
      <DropdownItem key="ArchivedItem" onPress={handleArchived}>
        <ArchivedItem />
      </DropdownItem>

      {!planinc.curSelectedNote?.isRecycle ? (
        <DropdownItem key="ShareItem" onPress={handlePublic}> 
          <PublicItem />  
        </DropdownItem>
      ) : <></>}

      {!isPc ? (
        <DropdownItem key="CommentItem" onPress={handleComment}>
          <CommentItem />
        </DropdownItem>
      ) : <></>}

      {planinc.config.value?.mainModelId ? (
        <DropdownItem key="AITagItem" onPress={handleAITag}>
          <AITagItem />
        </DropdownItem>
      ) : <></>}

      {planinc.config.value?.mainModelId ? (
        <DropdownItem key="RelatedNotesItem" onPress={handleRelatedNotes}>
          <RelatedNotesItem />
        </DropdownItem>
      ) : <></>}

      {
        pluginApi.customRightClickMenus.length > 0 ?
          <>
            {
              pluginApi.customRightClickMenus.map((menu) => (
                <DropdownItem key={menu.name} onPress={() => menu.onClick(planinc.curSelectedNote!)}>
                  <div className="flex items-start gap-2">
                    {menu.icon && <Icon icon={menu.icon} width="20" height="20" />}
                    <div>{menu.label}</div>
                  </div>
                </DropdownItem>
              ))
            }
          </> :
          <></>
      }

      {!planinc.curSelectedNote?.isRecycle ? (
        <DropdownItem key="TrashItem" onPress={handleTrash}>
          <TrashItem />
        </DropdownItem>
      ) : <></>}

      {planinc.curSelectedNote?.isRecycle ? (
        <DropdownItem key="DeleteItem" className="text-danger" onPress={handleDelete}>
          <DeleteItem />
        </DropdownItem>
      ) : <></>}

    </DropdownMenu>
  </Dropdown>
})