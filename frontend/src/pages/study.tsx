import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';
import { PlanningCrudModal } from '@/components/PlanincPlanning/PlanningCrudModal';
import type { PlanningFormValues } from '@/components/PlanincPlanning/PlanningCrudModal';
import { PlanningViewSwitch, usePlanningView, planningViewGridClass } from '@/components/PlanincPlanning/PlanningViewSwitch';
import { PlanningPagination } from '@/components/PlanincPlanning/PlanningPagination';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import dayjs from '@/lib/dayjs';

type StatusFilter = 'all' | 'planned' | 'active' | 'complete';
type KindFilter = 'all' | 'note' | 'question';
type SrsRating = 'again' | 'hard' | 'good' | 'easy';

const isQuestionCard = (item: any) => Boolean(item?.question || item?.answer);

const isDue = (item: any) => {
  if (!isQuestionCard(item)) return false;
  if (!item.srsDueAt) return true;
  return dayjs(item.srsDueAt).valueOf() <= Date.now();
};

export default function StudyPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = usePlanningView('planinc:study:view', 'cards');
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  // Spaced-repetition review deck (SM-2 ratings against due question cards).
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [isRating, setIsRating] = useState(false);

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
  useEffect(() => { setPage(1); }, [selectedTag, selectedCategory, searchText, statusFilter, kindFilter, pageSize]);

  const availableTags = [...new Set(items.flatMap((item) => item.tags ?? []))].sort();
  const availableCategories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  const dueCount = useMemo(() => items.filter(isDue).length, [items]);
  const questionCount = useMemo(() => items.filter(isQuestionCard).length, [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => {
      if (selectedTag && !(item.tags ?? []).includes(selectedTag)) return false;
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (kindFilter === 'question' && !isQuestionCard(item)) return false;
      if (kindFilter === 'note' && isQuestionCard(item)) return false;
      if (searchText.trim()) {
        const needle = searchText.trim().toLowerCase();
        const hay = [item.title, item.description, item.question, item.answer, item.category, ...(item.tags ?? [])]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    }),
    [items, selectedTag, selectedCategory, statusFilter, kindFilter, searchText],
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

  const toggleReveal = (id: number) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openReview = async () => {
    try {
      const due = await api.study.dueList.query({ limit: 50 });
      setReviewQueue(due);
      setReviewIndex(0);
      setReviewRevealed(false);
      setIsReviewOpen(due.length > 0);
      if (!due.length) setError('');
    } catch (cause) {
      console.error('Failed to load review queue', cause);
      setError(t('operation-failed'));
    }
  };

  const rateCurrent = async (rating: SrsRating) => {
    const card = reviewQueue[reviewIndex];
    if (!card || isRating) return;
    setIsRating(true);
    try {
      await api.study.review.mutate({ id: card.id, rating });
      setReviewQueue((current) => current.filter((_, index) => index !== reviewIndex));
      setReviewRevealed(false);
      setReviewIndex((current) => Math.min(current, Math.max(0, reviewQueue.length - 2)));
      await load();
    } catch (cause) {
      console.error('Failed to record review rating', cause);
      setError(t('operation-failed'));
    } finally {
      setIsRating(false);
    }
  };

  const closeReview = () => {
    setIsReviewOpen(false);
    setReviewQueue([]);
    setReviewIndex(0);
    setReviewRevealed(false);
  };

  const currentCard = reviewQueue[reviewIndex] ?? null;

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-24 md:px-6">
      <div className="flex items-center gap-2 pt-2">
        <Icon icon="hugeicons:book-edit" width="24" height="24" />
        <h1 className="text-xl font-bold">{t('study')}</h1>
        <Badge variant="secondary" className="ml-1">{t('questions-count', { count: questionCount })}</Badge>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon icon="lets-icons:search" width="16" height="16" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('search')}
            className="pl-9"
            placeholder={t('search-study')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => void openReview()} disabled={dueCount === 0} aria-label={t('review-due')}>
          <Icon icon="tabler:cards" width="16" height="16" />
          {t('review-due')}
          {dueCount > 0 && <Badge className="ml-1 bg-primary/15 text-primary" variant="secondary">{dueCount}</Badge>}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label={t('status')}>
        {(['all', 'planned', 'active', 'complete'] as const).map((value) => (
          <Button key={value} size="sm" variant={statusFilter === value ? 'default' : 'secondary'} onClick={() => setStatusFilter(value)}>
            {value === 'all' ? t('all') : t(value)}
          </Button>
        ))}
        <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden />
        {(['all', 'note', 'question'] as const).map((value) => (
          <Button key={value} size="sm" variant={kindFilter === value ? 'default' : 'secondary'} onClick={() => setKindFilter(value)}>
            {value === 'all' ? t('all-kinds') : value === 'note' ? t('topics') : t('questions')}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-tag')}>
        <Button size="sm" variant={selectedTag ? 'secondary' : 'default'} onClick={() => setSelectedTag('')}>{t('all')}</Button>
        {availableTags.map((tag) => (
          <Button key={tag} size="sm" variant={selectedTag === tag ? 'default' : 'secondary'} onClick={() => setSelectedTag(tag)}>#{tag}</Button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-category')}>
        <Button size="sm" variant={selectedCategory ? 'secondary' : 'default'} onClick={() => setSelectedCategory('')}>{t('all-categories')}</Button>
        {availableCategories.map((categoryName) => (
          <Button key={categoryName} size="sm" variant={selectedCategory === categoryName ? 'default' : 'secondary'} onClick={() => setSelectedCategory(categoryName)}>{categoryName}</Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlanningViewSwitch value={viewMode} onChange={setViewMode} ariaLabel={t('study-view')} />
        <Button onClick={() => { setEditingItem(null); setIsCrudOpen(true); }}>
          <Icon icon="material-symbols:add" width="16" height="16" />
          {t('add-study-item')}
        </Button>
      </div>
      {error && <p className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      <LoadingAndEmpty
        isLoading={isLoading}
        isEmpty={!isLoading && !visibleItems.length}
        emptyMessage={t('no-study-items')}
        isAbsolute={false}
        className="py-4"
      />
      <div className={planningViewGridClass(viewMode)}>
        {!isLoading && pagedItems.map((item) => (
          <Card key={item.id}>
            <CardContent className="gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button type="button" className="w-full text-left" onClick={() => setDetailItem(item)}>
                    <h2 className="truncate font-semibold hover:text-primary">{item.title}</h2>
                  </button>
                  <p className="text-xs text-muted-foreground">{item.category || t('uncategorized')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge>{t(item.status)}</Badge>
                  <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => { setEditingItem(item); setIsCrudOpen(true); }}>
                    <Icon icon="hugeicons:edit-02" width="18" height="18" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => remove(item)}>
                    <Icon icon="hugeicons:delete-02" width="18" height="18" />
                  </Button>
                </div>
              </div>
              {item.description && <p className="line-clamp-3 text-sm text-muted-foreground">{item.description}</p>}
              {isQuestionCard(item) && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{t('question')}</Badge>
                    {isDue(item) && <Badge className="bg-primary/15 text-primary" variant="secondary">{t('due')}</Badge>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm font-medium">{item.question || item.title}</p>
                  {revealedIds.has(item.id) ? (
                    <div className="space-y-1">
                      <Badge variant="outline">{t('answer')}</Badge>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.answer || '—'}</p>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => toggleReveal(item.id)}>
                      <Icon icon="mdi:eye-show-outline" width="16" height="16" />
                      {t('show-answer')}
                    </Button>
                  )}
                  {item.srsLastAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('last-reviewed')}: {dayjs(item.srsLastAt).format('YYYY-MM-DD')} · {t('interval-days', { count: item.srsInterval || 0 })}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-1 overflow-x-auto">
                {(item.tags ?? []).map((tag: string) => (
                  <Badge key={tag} variant="secondary">#{tag}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!isLoading && visibleItems.length > 0 && (
        <PlanningPagination page={page} pageSize={pageSize} total={visibleItems.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
      <PlanningFab label={t('add-study-item')} onPress={() => { setEditingItem(null); setIsCrudOpen(true); }} />
      <PlanningCrudModal kind="study" isOpen={isCrudOpen} item={editingItem} onClose={() => { setIsCrudOpen(false); setEditingItem(null); }} onSave={save} />
      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailItem?.title}</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{t(detailItem.status)}</Badge>
                <Badge variant="outline">{detailItem.category || t('uncategorized')}</Badge>
                {isQuestionCard(detailItem) && <Badge variant="secondary">{t('question')}</Badge>}
                {isDue(detailItem) && <Badge>{t('due')}</Badge>}
              </div>
              <p className="whitespace-pre-wrap text-muted-foreground">{detailItem.description || t('no-description')}</p>
              {isQuestionCard(detailItem) && (
                <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('question')}</p>
                    <p className="whitespace-pre-wrap text-sm font-medium">{detailItem.question || detailItem.title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('answer')}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{detailItem.answer || '—'}</p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {(detailItem.tags ?? []).map((tag: string) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" onClick={() => { setEditingItem(detailItem); setDetailItem(null); setIsCrudOpen(true); }}>{t('edit')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDetailItem(null)}>{t('close')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isReviewOpen} onOpenChange={(open) => { if (!open) closeReview(); }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('review-due')}</DialogTitle>
          </DialogHeader>
          {currentCard ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{reviewIndex + 1} / {reviewQueue.length}</span>
                <span>{t('ease-label', { value: Number(currentCard.srsEase || 2.5).toFixed(2) })}</span>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('question')}</p>
                <p className="whitespace-pre-wrap text-sm font-medium">{currentCard.question || currentCard.title}</p>
              </div>
              {reviewRevealed ? (
                <div className="rounded-xl border border-border bg-background p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('answer')}</p>
                  <p className="whitespace-pre-wrap text-sm">{currentCard.answer || '—'}</p>
                </div>
              ) : (
                <Button className="w-full" variant="secondary" onClick={() => setReviewRevealed(true)}>
                  <Icon icon="mdi:eye-show-outline" width="16" height="16" />
                  {t('show-answer')}
                </Button>
              )}
              {reviewRevealed && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button variant="destructive" disabled={isRating} onClick={() => void rateCurrent('again')}>{t('again')}</Button>
                  <Button variant="secondary" disabled={isRating} onClick={() => void rateCurrent('hard')}>{t('hard')}</Button>
                  <Button variant="secondary" disabled={isRating} onClick={() => void rateCurrent('good')}>{t('good')}</Button>
                  <Button disabled={isRating} onClick={() => void rateCurrent('easy')}>{t('easy')}</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">{t('congratulations-youve-reviewed-everything-today')}</div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={closeReview}>{t('cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
