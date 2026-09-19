import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { PlanningCrudModal } from '@/components/PlanincPlanning/PlanningCrudModal';

export default function StudyPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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
  const availableTags = [...new Set(items.flatMap((item) => item.tags ?? []))].sort();
  const availableCategories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  const visibleItems = items.filter((item) => (!selectedTag || (item.tags ?? []).includes(selectedTag)) && (!selectedCategory || item.category === selectedCategory));

  const save = async (data: { title: string; description: string; status: string; category: string; tags: string[] }, id?: number) => {
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
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-20 md:px-6">
      <div className="flex items-center gap-2 pt-2"><Icon icon="hugeicons:book-open-01" width="24" height="24" /><h1 className="text-xl font-bold">{t('study')}</h1></div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-tag')}><Button size="sm" variant={selectedTag ? 'flat' : 'solid'} onPress={() => setSelectedTag('')}>{t('all')}</Button>{availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTag === tag ? 'solid' : 'flat'} onPress={() => setSelectedTag(tag)}>#{tag}</Button>)}</div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-category')}><Button size="sm" variant={selectedCategory ? 'flat' : 'solid'} onPress={() => setSelectedCategory('')}>{t('all-categories')}</Button>{availableCategories.map((categoryName) => <Button key={categoryName} size="sm" variant={selectedCategory === categoryName ? 'solid' : 'flat'} onPress={() => setSelectedCategory(categoryName)}>{categoryName}</Button>)}</div>
      <div className="flex justify-end"><Button color="primary" onPress={() => { setEditingItem(null); setIsCrudOpen(true); }}>{t('add-study-item')}</Button></div>
      {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
      {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}
      <div className="grid gap-3 md:grid-cols-2">{!isLoading && visibleItems.map((item) => <Card key={item.id}><CardBody className="gap-2"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">{item.title}</h2><p className="text-xs text-foreground-400">{item.category || t('uncategorized')}</p></div><div className="flex items-center gap-2"><Chip size="sm">{t(item.status)}</Chip><Button isIconOnly variant="flat" aria-label={t('edit')} onPress={() => { setEditingItem(item); setIsCrudOpen(true); }}><Icon icon="hugeicons:edit-02" width="18" height="18" /></Button><Button isIconOnly variant="flat" color="danger" aria-label={t('delete')} onPress={() => remove(item)}><Icon icon="hugeicons:delete-02" width="18" height="18" /></Button></div></div><p className="text-sm text-foreground-500">{item.description}</p><div className="flex gap-1 overflow-x-auto">{(item.tags ?? []).map((tag) => <Chip key={tag} size="sm" variant="flat">#{tag}</Chip>)}</div></CardBody></Card>)}</div>
      {!isLoading && !visibleItems.length && <p className="py-10 text-center text-foreground-500">{t('no-study-items')}</p>}
      <PlanningCrudModal kind="study" isOpen={isCrudOpen} item={editingItem} onClose={() => { setIsCrudOpen(false); setEditingItem(null); }} onSave={save} />
    </ScrollArea>
  );
}
