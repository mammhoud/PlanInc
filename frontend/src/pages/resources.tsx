import { RootStore } from "@/store";
import { ResourceStore } from "@/store/resourceStore";
import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useCallback, useState } from "react";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from "react-i18next";
import { DndContext, TouchSensor, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { toJS } from "mobx";
import { MemoizedResourceItem } from "@/components/PlanIncResource/ResourceItem";
import { ResourceMultiSelectPop } from "@/components/PlanIncResource/ResourceMultiSelectpop";
import { Breadcrumbs, BreadcrumbItem, Button, Input } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PhotoProvider } from "react-photo-view";
import { useNavigate } from "react-router-dom";
import { UploadFileWrapper } from "@/components/Common/UploadFile";
import { PlanningViewSwitch, usePlanningView } from "@/components/PlanincPlanning/PlanningViewSwitch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/trpc";
import { ToastPlugin } from "@/store/module/Toast/Toast";

type ResourcesSection = 'files' | 'archive' | 'agent';

const Page = observer(() => {
  const navigate = useNavigate();
  const resourceStore = RootStore.Get(ResourceStore);
  const { t } = useTranslation();
  const [viewMode, setViewMode] = usePlanningView('planinc:resources:view', 'list');
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'updated'>('updated');
  const [section, setSection] = useState<ResourcesSection>('files');
  const [archivedNotes, setArchivedNotes] = useState<any[]>([]);
  const [agentNotes, setAgentNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const loadKnowledgeNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const [archived, tags] = await Promise.all([
        api.notes.list.mutate({ page: 1, size: 100, isArchived: true, isRecycle: false }),
        api.tags.list.query(),
      ]);
      setArchivedNotes((archived as any[]) ?? []);
      const agentTag = ((tags as any[]) ?? []).find((tag) => String(tag?.name ?? '').toLowerCase() === 'agent');
      if (!agentTag) {
        setAgentNotes([]);
        return;
      }
      const agentTagId = Number(String(agentTag.id ?? agentTag).split(':').pop());
      if (!Number.isFinite(agentTagId)) {
        setAgentNotes([]);
        return;
      }
      const agentNotesPage = await api.notes.list.mutate({
        page: 1,
        size: 100,
        tagId: agentTagId,
        isArchived: false,
        isRecycle: false,
      });
      setAgentNotes((agentNotesPage as any[]) ?? []);
    } catch (cause) {
      console.error('Failed to load archive/agent notes', cause);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section !== 'files') void loadKnowledgeNotes();
  }, [section, loadKnowledgeNotes]);

  const archiveQuery = searchText.trim().toLowerCase();
  const visibleArchived = useMemo(
    () => archivedNotes.filter((note) => !archiveQuery || String(note.content ?? note.title ?? '').toLowerCase().includes(archiveQuery)),
    [archivedNotes, archiveQuery],
  );
  const visibleAgentNotes = useMemo(
    () => agentNotes.filter((note) => !archiveQuery || String(note.content ?? note.title ?? '').toLowerCase().includes(archiveQuery)),
    [agentNotes, archiveQuery],
  );

  const restoreNote = async (note: any) => {
    try {
      await api.notes.updateMany.mutate({ ids: [note.id], isArchived: false });
      await RootStore.Get(ToastPlugin).success(t('recovery'));
      await loadKnowledgeNotes();
    } catch (cause) {
      console.error('Failed to restore note', cause);
      await RootStore.Get(ToastPlugin).error(t('operation-failed'));
    }
  };

  const trashNote = async (note: any) => {
    try {
      await api.notes.trashMany.mutate({ ids: [note.id] });
      await RootStore.Get(ToastPlugin).success(t('moved-to-recycle-bin'));
      await loadKnowledgeNotes();
    } catch (cause) {
      console.error('Failed to trash note', cause);
      await RootStore.Get(ToastPlugin).error(t('operation-failed'));
    }
  };

  const openNote = (note: any) => {
    navigate(`/detail?id=${note.id}`);
  };

  const notePreview = (note: any) => {
    return String(note?.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#*_`>\[\]()]/g, '')
      .trim()
      .slice(0, 220);
  };

  // Distance-based activation keeps folder clicks working — a click must not start a drag.
  // Touch keeps the long-press pattern the rest of the app uses (see useDragCard).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // Folders are the only drop targets, so a drop elsewhere resolves to no `over` and is ignored —
  // the store's handler keeps its existing react-beautiful-dnd result shape, translated here.
  const handleResourceDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    const sourceIndex = active.data.current?.index;
    const destinationIndex = over?.data.current?.index;
    if (typeof sourceIndex !== 'number' || typeof destinationIndex !== 'number') return;
    // `index` addresses the rendered (sorted/filtered) list, which is not the
    // order of the store's raw list — pass identities so the store can resolve
    // the drop target and dragged row correctly.
    void resourceStore.handleDragEnd({
      source: { index: sourceIndex, id: active.data.current?.resourceId },
      destination: { index: destinationIndex, folderName: over?.data.current?.folderName },
    });
  }, [resourceStore]);
  const resources = useMemo(() => {
    const allResources = toJS(resourceStore.planinc.resourceList.value) || [];
    // Filter out .folder placeholder files
    return allResources.filter(resource => resource.name !== '.folder');
  }, [resourceStore.planinc.resourceList.value]);
  const visibleResources = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return resources
      .filter((resource) => {
        if (!query) return true;
        return (resource.name || resource.folderName || '').toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (sortMode === 'name') {
          return (a.folderName || a.name).localeCompare(b.folderName || b.name);
        }
        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      });
  }, [resources, searchText, sortMode]);

  const selectedItems = resourceStore.selectedItems;

  const handleMoveSelectedToParent = useCallback(async () => {
    if (!resourceStore.currentFolder) return;
    const selectedResources = Array.from(selectedItems)
      .map(id => resources.find(r => r.id === id))
      .filter((item): item is NonNullable<typeof item> => item != null);

    if (selectedResources.length > 0) {
      await resourceStore.moveToParentFolder(selectedResources);
    }
  }, [resourceStore, selectedItems, resources]);

  const folderBreadcrumbs = useMemo(() => {
    if (!resourceStore.currentFolder) return [];
    return ['Root', ...resourceStore.currentFolder.split('/')];
  }, [resourceStore.currentFolder]);

  resourceStore.use();

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleResourceDragEnd}>
        <ScrollArea
          fixMobileTopBar
          onBottom={section === 'files' ? resourceStore.loadNextPage : undefined}
          className="md:px-6 h-[calc(100%_-_5px)] md:h-[calc(100vh_-_100px)] px-2 md:max-w-[1000px] w-full overflow-x-hidden mx-auto"
        >
          <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label={t('resources')}>
            {([
              { id: 'files' as const, label: t('resources'), icon: 'solar:database-linear' },
              { id: 'archive' as const, label: t('archive-resources'), icon: 'solar:box-minimalistic-linear' },
              { id: 'agent' as const, label: t('agent-notes'), icon: 'hugeicons:chat' },
            ]).map((tab) => (
              <Button
                key={tab.id}
                size="sm"
                variant={section === tab.id ? 'solid' : 'bordered'}
                onPress={() => setSection(tab.id)}
                startContent={<Icon icon={tab.icon} width="16" height="16" />}
              >
                {tab.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onPress={() => navigate('/?path=trash')}
              startContent={<Icon icon="hugeicons:delete-02" width="16" height="16" />}
            >
              {t('open-bin')}
            </Button>
          </div>

          <div className="flex items-center justify-between ">
            <div className="flex items-center gap-2">
              <AnimatePresence mode="wait">
                {resourceStore.currentFolder && (
                  <motion.div
                    key={resourceStore.currentFolder}
                    initial={{ y: -10, opacity: 0, height: 0 }}
                    animate={{ y: 0, opacity: 1, height: "auto" }}
                    exit={{ y: -10, opacity: 0, height: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 30,
                      duration: 0.15
                    }}
                  >
                    <Breadcrumbs variant="solid" className="ml-[-8px]" size='lg'>
                      {folderBreadcrumbs.map((folder, index) => (
                        <BreadcrumbItem
                          key={folder}
                          onPress={() => {
                            if (index === 0) {
                              resourceStore.navigateBack(navigate);
                            } else {
                              const currentPathSegments = resourceStore.currentFolder?.split('/') || [];
                              const clickedPathLevel = index;
                              const stepsToGoBack = currentPathSegments.length - clickedPathLevel;

                              for (let i = 0; i < stepsToGoBack; i++) {
                                resourceStore.navigateBack(navigate);
                              }
                            }
                          }}
                        >
                          {folder}
                        </BreadcrumbItem>
                      ))}
                    </Breadcrumbs>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 mt-2 ">
              <Input
                aria-label={t('search')}
                className="min-w-40 max-w-60"
                size="sm"
                value={searchText}
                onValueChange={setSearchText}
                placeholder={t('search')}
                startContent={<Icon icon="hugeicons:search-list-01" className="w-4 h-4" />}
              />
              {section === 'files' && (
                <>
              <Button
                size="sm"
                variant="bordered"
                onPress={() => setSortMode(sortMode === 'updated' ? 'name' : 'updated')}
                startContent={<Icon icon="solar:sort-by-time-broken" className="w-4 h-4" />}
              >
                {sortMode === 'updated' ? t('recent') : t('name')}
              </Button>
              <PlanningViewSwitch
                value={viewMode === 'grid' ? 'grid' : 'list'}
                onChange={setViewMode}
                modes={['list', 'grid']}
                ariaLabel={t('resource-view')}
              />
                </>
              )}
            </div>

            {section === 'files' && (
            <div className="flex items-center gap-2 mt-2 ">
              <UploadFileWrapper
                destinationFolder={
                  resourceStore.currentFolder && resourceStore.currentFolder !== 'Root'
                    ? resourceStore.currentFolder
                    : undefined
                }
                onUpload={() => { resourceStore.refreshTicker++; }}
              >
                <Button
                  size="sm"
                  variant="bordered"
                  startContent={<Icon icon="tabler:upload" className="w-5 h-5" />}
                >
                  {t('upload')}
                </Button>
              </UploadFileWrapper>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25
                }}
              >
                <Button
                  size="sm"
                  color="primary"
                  onPress={resourceStore.handleNewFolder}
                  startContent={<Icon icon="material-symbols:create-new-folder-outline" className="w-5 h-5" />}
                >
                  {t('new-folder')}
                </Button>
              </motion.div>

              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25
                }}
              >
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={() => {
                    if (selectedItems.size === visibleResources.length) {
                      resourceStore.clearSelection();
                    } else {
                      resourceStore.selectAllFiles(visibleResources);
                    }
                  }}
                  startContent={
                    <Icon
                      icon={
                        selectedItems.size === visibleResources.length
                          ? "material-symbols:close"
                          : "material-symbols:select-all"
                      }
                      className="w-5 h-5"
                    />
                  }
                >
                  {selectedItems.size === visibleResources.length ? t('deselect-all') : t('select-all')}
                </Button>
              </motion.div>

              {selectedItems.size > 0 && resourceStore.currentFolder && resourceStore.currentFolder !== 'Root' && (
                <motion.div
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 20, opacity: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25
                  }}
                >
                  <Button
                    variant="light"
                    onPress={handleMoveSelectedToParent}
                    startContent={<Icon icon="material-symbols:drive-file-move-outline" className="w-5 h-5" />}
                  >
                    {t('move-to-parent')}
                  </Button>
                </motion.div>
              )}
              {selectedItems.size > 0 && (
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => {
                    const selectedResources = resources.filter((resource) => resource.id && selectedItems.has(resource.id));
                    void resourceStore.downloadResources(selectedResources);
                  }}
                  startContent={<Icon icon="material-symbols:download" className="w-5 h-5" />}
                >
                  {t('download')}
                </Button>
              )}
            </div>
            )}
          </div>

          {section === 'files' && (
            <>
          <LoadingAndEmpty
            isLoading={resourceStore.planinc.resourceList.isLoading}
            isEmpty={!resourceStore.planinc.resourceList.isLoading && visibleResources.length === 0}
            emptyMessage={t('there-are-no-resources-yet-go-upload-them-now')}
            action={
              <UploadFileWrapper
                destinationFolder={
                  resourceStore.currentFolder && resourceStore.currentFolder !== 'Root'
                    ? resourceStore.currentFolder
                    : undefined
                }
                onUpload={() => { resourceStore.refreshTicker++; }}
              >
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Icon icon="tabler:upload" width="16" height="16" />}
                >
                  {t('upload')}
                </Button>
              </UploadFileWrapper>
            }
          />
          <PhotoProvider>
            {visibleResources.length > 0 && (
              <div className={`py-2 min-h-[200px] ${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 items-start' : ''}`}>
                {visibleResources.map((item, index) => (
                  <MemoizedResourceItem
                    key={item.isFolder ? `folder-${item.folderName}` : `file-${item.id}`}
                    item={item}
                    index={index}
                    isSelected={selectedItems.has(item.id!)}
                    onSelect={resourceStore.toggleSelect}
                    onFolderClick={(folder) => resourceStore.navigateToFolder(folder, navigate)}
                  />
                ))}
              </div>
            )}

          </PhotoProvider>
            </>
          )}

          {(section === 'archive' || section === 'agent') && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {section === 'archive' ? t('archive-resources-description') : t('agent-notes-description')}
              </p>
              <LoadingAndEmpty
                isLoading={notesLoading}
                isEmpty={!notesLoading && (section === 'archive' ? visibleArchived : visibleAgentNotes).length === 0}
                emptyMessage={section === 'archive' ? t('no-archived-notes') : t('no-agent-notes')}
                isAbsolute={false}
                className="py-4"
              />
              {(section === 'archive' ? visibleArchived : visibleAgentNotes).map((note) => (
                <Card key={note.id}>
                  <CardContent className="gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openNote(note)}>
                        <h2 className="truncate font-semibold hover:text-primary">{notePreview(note) || t('notes')}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {note.isArchived ? t('archived') : t('agent-notes')}
                          {note.updatedAt ? ` · ${new Date(note.updatedAt).toLocaleDateString()}` : ''}
                        </p>
                      </button>
                      <div className="flex shrink-0 gap-2">
                        {note.isArchived && (
                          <Button size="sm" variant="secondary" onPress={() => void restoreNote(note)}>
                            {t('recovery')}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onPress={() => void trashNote(note)}>
                          {t('trash')}
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(note.tags ?? []).map((tag: any) => (
                        <Badge key={String(tag?.id ?? tag?.name ?? tag)} variant="secondary">
                          #{String(tag?.name ?? tag)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

        </ScrollArea>
      </DndContext>
      <ResourceMultiSelectPop />
    </>
  );
});

export default Page;