import { RootStore } from "@/store";
import { ResourceStore } from "@/store/resourceStore";
import { observer } from "mobx-react-lite";
import { useMemo, useCallback, useState } from "react";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from "react-i18next";
import { DragDropContext, Droppable } from 'react-beautiful-dnd-next';
import { toJS } from "mobx";
import { MemoizedResourceItem } from "@/components/PlanIncResource/ResourceItem";
import { ResourceMultiSelectPop } from "@/components/PlanIncResource/ResourceMultiSelectpop";
import { Breadcrumbs, BreadcrumbItem, Button, Input } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PhotoProvider } from "react-photo-view";
import { useNavigate } from "react-router-dom";
import { UploadFileWrapper } from "@/components/Common/UploadFile";
const Page = observer(() => {
  const navigate = useNavigate();
  const resourceStore = RootStore.Get(ResourceStore);
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchText, setSearchText] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'updated'>('updated');
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
      <DragDropContext onDragEnd={resourceStore.handleDragEnd}>
        <ScrollArea
          fixMobileTopBar
          onBottom={resourceStore.loadNextPage}
          className="md:px-6 h-[calc(100%_-_5px)] md:h-[calc(100vh_-_100px)] px-2 md:max-w-[1000px] w-full overflow-x-hidden mx-auto"
        >
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
                    <UploadFileWrapper
                      destinationFolder={resourceStore.currentFolder || undefined}
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
                startContent={<Icon icon="tabler:search" className="w-4 h-4" />}
              />
              <Button
                size="sm"
                variant="bordered"
                onPress={() => setSortMode(sortMode === 'updated' ? 'name' : 'updated')}
                startContent={<Icon icon="tabler:sort-ascending" className="w-4 h-4" />}
              >
                {sortMode === 'updated' ? t('recent') : t('name')}
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'solid' : 'bordered'}
                isIconOnly
                aria-label={t('list-view')}
                onPress={() => setViewMode('list')}
              >
                <Icon icon="tabler:list" className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'grid' ? 'solid' : 'bordered'}
                isIconOnly
                aria-label={t('grid-view')}
                onPress={() => setViewMode('grid')}
              >
                <Icon icon="tabler:layout-grid" className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 mt-2 ">
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
                          ? "material-symbols:deselect"
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
          </div>

          <LoadingAndEmpty
            isLoading={resourceStore.planinc.resourceList.isLoading}
            isEmpty={!resources.length}
            emptyMessage={t('no-resources-found')}
          />
          <PhotoProvider>
            {resources.length > 0 && (
              <Droppable droppableId="resources">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`py-2 min-h-[200px] ${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 items-start' : ''}`}
                  >
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
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            )}

          </PhotoProvider>

        </ScrollArea>
      </DragDropContext>
      <ResourceMultiSelectPop />
    </>
  );
});

export default Page;