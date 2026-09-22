import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { PlanningCrudModal } from '@/components/PlanincPlanning/PlanningCrudModal';
import type { PlanningFormValues } from '@/components/PlanincPlanning/PlanningCrudModal';
import { PlanningViewSwitch, usePlanningView, planningViewGridClass } from '@/components/PlanincPlanning/PlanningViewSwitch';
import { PlanningPagination } from '@/components/PlanincPlanning/PlanningPagination';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';

export default function StudyPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = usePlanningView('planinc:study:view', 'cards');
  const load = async () => {
    setIsLoading(true);
    try {
      setItems(await api.study.list.query());
      setError('');
    } catch (cause) {
      console.error('Failed to load study items', cause);
      setError(t('operation-failed'));
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [selectedTag, selectedCategory, pageSize]);
  const availableTags = [...new Set(items.flatMap((item) => item.tags ?? []))].sort();
  const availableCategories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  const visibleItems = useMemo(
    () => items.filter((item) => (!selectedTag || (item.tags ?? []).includes(selectedTag)) && (!selectedCategory || item.category === selectedCategory)),
    [items, selectedTag, selectedCategory],
  );
  const pagedItems = useMemo(() => visibleItems.slice((page - 1) * pageSize, page * pageSize), [visibleItems, page, pageSize]);
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(visibleItems.length / pageSize))));
  }, [visibleItems.length, pageSize]);

  const save = async (data: PlanningFormValues, id?: number) => {
    if (id == null) await api.study.create.mutate({ ...data, status: data.status as 'planned' | 'active' | 'complete' });
    else await api.study.update.mutate({ id, ...data, status: data.status as 'planned' | 'active' | 'complete' });
    await load();
  };

  const remove = (item: any) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-will-be-delete-resource-are-you-sure'),
      onConfirm: async () => {
        await api.study.delete.mutate({ id: item.id });
        if (editingItem?.id === item.id) setEditingItem(null);
        await load();
      },
    });
  };

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-24 md:px-6">
      <div className="flex items-center gap-2 pt-2"><Icon icon="hugeicons:book-edit" width="24" height="24" /><h1 className="text-xl font-bold">{t('study')}</h1></div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-tag')}><Button size="sm" variant={selectedTag ? 'secondary' : 'default'} onClick={() => setSelectedTag('')}>{t('all')}</Button>{availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTag === tag ? 'default' : 'secondary'} onClick={() => setSelectedTag(tag)}>#{tag}</Button>)}</div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-category')}><Button size="sm" variant={selectedCategory ? 'secondary' : 'default'} onClick={() => setSelectedCategory('')}>{t('all-categories')}</Button>{availableCategories.map((categoryName) => <Button key={categoryName} size="sm" variant={selectedCategory === categoryName ? 'default' : 'secondary'} onClick={() => setSelectedCategory(categoryName)}>{categoryName}</Button>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlanningViewSwitch value={viewMode} onChange={setViewMode} ariaLabel={t('study-view')} />
        <Button onClick={() => { setEditingItem(null); setIsCrudOpen(true); }}><Icon icon="material-symbols:add" width="16" height="16" />{t('add-study-item')}</Button>
      </div>
      {error && <p className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      {isLoading && <p className="py-8 text-center text-muted-foreground">{t('in-progress')}</p>}
      <div className={planningViewGridClass(viewMode)}>{!isLoading && pagedItems.map((item) => <Card key={item.id}><CardContent className="gap-2"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">{item.title}</h2><p className="text-xs text-muted-foreground">{item.category || t('uncategorized')}</p></div><div className="flex items-center gap-2"><Badge>{t(item.status)}</Badge><Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => { setEditingItem(item); setIsCrudOpen(true); }}><Icon icon="hugeicons:edit-02" width="18" height="18" /></Button><Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => remove(item)}><Icon icon="hugeicons:delete-02" width="18" height="18" /></Button></div></div><p className="text-sm text-muted-foreground">{item.description}</p><div className="flex gap-1 overflow-x-auto">{(item.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}</div></CardContent></Card>)}</div>
      {!isLoading && !visibleItems.length && <p className="py-10 text-center text-muted-foreground">{t('no-study-items')}</p>}
      {!isLoading && visibleItems.length > 0 && (
        <PlanningPagination page={page} pageSize={pageSize} total={visibleItems.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
      <PlanningFab label={t('add-study-item')} onPress={() => { setEditingItem(null); setIsCrudOpen(true); }} />
      <PlanningCrudModal kind="study" isOpen={isCrudOpen} item={editingItem} onClose={() => { setIsCrudOpen(false); setEditingItem(null); }} onSave={save} />
    </ScrollArea>
  );
}
