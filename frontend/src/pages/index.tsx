import { PlanIncStore } from '@/store/planincStore';
import { observer } from 'mobx-react-lite';
import Masonry from 'react-masonry-css';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { PlanIncEditor } from '@/components/PlanIncEditor';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { PlanIncCard } from '@/components/PlanIncCard';
import { PlanIncAddButton } from '@/components/PlanIncAddButton';
import { ShowEditPlanIncModel } from '@/components/PlanIncRightClickMenu';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useMemo, useState, useEffect, useRef } from 'react';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useDragCard, DraggablePlanIncCard } from '@/hooks/useDragCard';
import { PlanningViewSwitch, usePlanningView } from '@/components/PlanincPlanning/PlanningViewSwitch';
import { PlanningPagination } from '@/components/PlanincPlanning/PlanningPagination';
import { AgendaDirectory, type AgendaTypeParam } from '@/components/PlanincPlanning/AgendaDirectory';
import { Button, Chip, Select, SelectItem } from '@heroui/react';
import { api } from '@/lib/trpc';
import { usePlatform, useSideNav } from '@/platform/PlatformProvider';
import { cardColumnsFor, preferredCardColumns } from '@/platform/responsive';

interface TodoGroup {
  displayDate: string;
  todos: any[];
}

const DEFAULT_NOTE_PAGE_SIZE = 12;

const readStoredPageSize = () => {
  if (typeof window === 'undefined') return DEFAULT_NOTE_PAGE_SIZE;
  const saved = Number(window.localStorage.getItem('planinc:notes:pageSize'));
  return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_NOTE_PAGE_SIZE;
};

const Home = observer(() => {
  const { t } = useTranslation();
  const isPc = useSideNav()
  const { tier, viewportWidth } = usePlatform()
  const planinc = RootStore.Get(PlanIncStore)
  planinc.use()
  planinc.useQuery();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const rawPath = searchParams.get('path');
  // Legacy Notes/Plans deep links open Agenda with the matching type filter.
  const isAgendaView = rawPath === 'agenda' || rawPath === 'notes' || rawPath === 'todo';
  const agendaTypeParam: AgendaTypeParam = (() => {
    if (rawPath === 'notes') return 'note';
    if (rawPath === 'todo') return 'todo';
    const value = searchParams.get('type');
    return value === 'planinc' || value === 'note' || value === 'todo' ? value : 'all';
  })();
  // Plan-oriented surfaces (kanban/calendar/timeline/categories) for tasks and
  // for the mixed Agenda stream; pure note streams keep the card/masonry UX.
  const isTodoView = isAgendaView && (agendaTypeParam === 'todo' || agendaTypeParam === 'all');
  const isArchivedView = rawPath === 'archived';
  const isTrashView = rawPath === 'trash';
  const isAllView = rawPath === 'all';
  const [activeId, setActiveId] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [isDragForbidden, setIsDragForbidden] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const currentListState = useMemo(() => {
    if (isAgendaView) {
      return planinc.agendaList;
    } else if (isArchivedView) {
      return planinc.archivedList;
    } else if (isTrashView) {
      return planinc.trashList;
    } else if (isAllView) {
      return planinc.noteList;
    } else {
      return planinc.planincList;
    }
  }, [isAgendaView, isArchivedView, isTrashView, isAllView, planinc]);

  const setAgendaType = (next: AgendaTypeParam) => {
    const params = new URLSearchParams(searchParams);
    params.set('path', 'agenda');
    if (next === 'all') params.delete('type');
    else params.set('type', next);
    setSearchParams(params, { replace: false });
  };

  const [viewMode, setViewMode] = usePlanningView('planinc:notes:view', 'cards');
  // Plans keep their own persisted view: a board is the useful default there,
  // while the note streams still open as cards.
  const [plansViewMode, setPlansViewMode] = usePlanningView('planinc:plans:view', 'kanban');
  const activeViewMode = isTodoView ? plansViewMode : viewMode;
  const setActiveViewMode = isTodoView ? setPlansViewMode : setViewMode;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readStoredPageSize);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | 'all' | 'none'>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().startOf('month'));
  // Kanban grouping (category lanes vs finish-status lanes), persisted per device.
  const [kanbanGroup, setKanbanGroup] = useState<'category' | 'status'>(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('planinc:plans:kanban-group') === 'status' ? 'status' : 'category');
  // Completed plans live in the archived stream; opt-in to merge them into the board.
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    api.planningCategories.list.query()
      .then((rows) => setCategories(rows))
      .catch((cause) => { console.error('Failed to load plan categories', cause); setCategories([]); });
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('planinc:plans:kanban-group', kanbanGroup);
  }, [kanbanGroup]);

  // Pull the archived stream once so completed (archived) TODOs can back the
  // Done lane when the user opts in. The open todoList never contains them.
  useEffect(() => {
    if (isTodoView && showCompleted && !planinc.archivedList.value?.length && !planinc.archivedList.isLoading) {
      void planinc.archivedList.resetAndCall({});
    }
  }, [isTodoView, showCompleted, planinc]);

  // Category filter only applies to plan-oriented Agenda surfaces (tasks / all).
  const showPlanControls = isAgendaView && (agendaTypeParam === 'todo' || agendaTypeParam === 'all');

  const loadedNotes = useMemo(() => currentListState.value ?? [], [currentListState.value]);

  // Completed TODOs merged in when opted in (deduped by id), so the board can
  // show a real Done lane instead of completed work vanishing.
  const completedTodos = useMemo(() => {
    if (!isTodoView || !showCompleted) return [];
    return (planinc.archivedList.value ?? []).filter((note) => note.type === NoteType.TODO && !note.isRecycle);
  }, [isTodoView, showCompleted, planinc.archivedList.value]);

  // The task date of a plan is its deadline; plans without one fall back to
  // creation order. Calendar, timeline and status lanes all share this.
  const taskDateOf = (note: any) => note?.metadata?.expireAt ?? note?.createdAt;

  type PlanStatus = 'overdue' | 'due-soon' | 'open' | 'no-deadline' | 'completed';
  const planStatusOf = (note: any): PlanStatus => {
    if (note?.isArchived) return 'completed';
    const deadline = note?.metadata?.expireAt;
    if (!deadline) return 'no-deadline';
    const due = dayjs(deadline);
    if (due.isBefore(dayjs(), 'day')) return 'overdue';
    if (due.diff(dayjs(), 'day') <= 3) return 'due-soon';
    return 'open';
  };

  // The category filter narrows the stream before pagination, so a board column
  // and the footer always describe the same set of plans.
  const filteredNotes = useMemo(() => {
    let base = loadedNotes;
    if (showPlanControls && showCompleted && completedTodos.length) {
      const openIds = new Set(base.map((note) => note.id));
      base = [...base, ...completedTodos.filter((note) => !openIds.has(note.id))];
    }
    if (!showPlanControls || categoryFilter === 'all') return base;
    if (categoryFilter === 'none') return base.filter((note) => note.categoryId == null);
    return base.filter((note) => note.categoryId === categoryFilter);
  }, [loadedNotes, completedTodos, categoryFilter, showPlanControls, showCompleted]);

  const pagedNotes = useMemo(
    () => filteredNotes.slice((page - 1) * pageSize, page * pageSize),
    [filteredNotes, page, pageSize],
  );

  // Persist the chosen page size and keep the current page in range.
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('planinc:notes:pageSize', String(pageSize));
  }, [pageSize]);
  useEffect(() => { setPage(1); }, [activeViewMode, pageSize, location.pathname, searchParams.toString(), categoryFilter]);
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(filteredNotes.length / pageSize))));
  }, [filteredNotes.length, pageSize]);

  useEffect(() => {
    const noteId = searchParams.get('noteId');
    if (noteId) {
      planinc.scrollToNote(Number(noteId));
      const timer = setTimeout(() => planinc.clearScrollToNote(), 2000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const changePage = (next: number) => {
    setPage(next);
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  };

  // Use drag card hook only for non-plan surfaces, and only over the current page
  // so drag reordering never crosses pagination boundaries.
  const { localNotes, sensors, setLocalNotes, handleDragStart, handleDragEnd, handleDragOver } = useDragCard({
    notes: isTodoView ? undefined : pagedNotes,
    activeId,
    setActiveId,
    insertPosition,
    setInsertPosition,
    isDragForbidden,
    setIsDragForbidden
  });

  const store = RootStore.Local(() => ({
    editorHeight: 30,
    get showEditor() {
      return !planinc.noteListFilterConfig.isArchived && !planinc.noteListFilterConfig.isRecycle
    },
    get showLoadAll() {
      return currentListState.isLoadAll
    }
  }))

  // Inline composer is collapsed by default on desktop; the floating add
  // button (same as every other surface) opens the modal editor instead.
  const [composerOpen, setComposerOpen] = useState(false);
  const showInlineComposer =
    composerOpen && store.showEditor && isPc && !planinc.config.value?.hidePcEditor;

  // Group only the current page of todos so the timeline respects pagination.
  // Grouping key is the task date (deadline, falling back to creation).
  const todosByDate = useMemo(() => {
    if (!showPlanControls || !pagedNotes.length) return {} as Record<string, TodoGroup>;
    const todoItems = agendaTypeParam === 'todo' ? pagedNotes.filter((n) => n.type === NoteType.TODO) : pagedNotes;
    const groupedTodos: Record<string, TodoGroup> = {};
    todoItems.forEach(todo => {
      const taskDate = taskDateOf(todo);
      const date = dayjs(taskDate).format('YYYY-MM-DD');
      const isToday = dayjs().isSame(dayjs(taskDate), 'day');
      const isYesterday = dayjs().subtract(1, 'day').isSame(dayjs(taskDate), 'day');
      let displayDate;
      if (isToday) {
        displayDate = t('today');
      } else if (isYesterday) {
        displayDate = t('yesterday');
      } else {
        displayDate = dayjs(taskDate).format('MM/DD (ddd)');
      }
      if (!groupedTodos[date]) {
        groupedTodos[date] = {
          displayDate,
          todos: []
        };
      }
      groupedTodos[date].todos.push(todo);
    });
    return Object.entries(groupedTodos)
      .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
      .reduce((acc, [date, data]) => {
        acc[date] = data;
        return acc;
      }, {} as Record<string, TodoGroup>);
  }, [pagedNotes, showPlanControls, agendaTypeParam, t]);

  // Restore scroll position when returning from editor
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('restore-scroll-position');
    if (savedPosition && scrollAreaRef.current) {
      const position = Number(savedPosition);
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = position;
        }
        // Clear the saved position after restoring
        sessionStorage.removeItem('restore-scroll-position');
      }, 100);
    }
  }, [location.key]);

  // Board columns: every enabled category plus an implicit uncategorised one,
  // so nothing can fall out of the board.
  const categoryColumns = useMemo(() => {
    const columns = categories.map((category) => ({
      id: category.id as number | null,
      name: String(category.name),
      color: String(category.color),
      icon: String(category.icon),
    }));
    columns.push({ id: null, name: t('uncategorised'), color: '#5A6B7B', icon: 'tabler:folder' });
    return columns.map((column) => ({
      ...column,
      plans: pagedNotes.filter((note) => (note.categoryId ?? null) === column.id),
    }));
  }, [categories, pagedNotes, t]);

  const assignCategory = async (noteId: number, categoryId: number | null) => {
    try {
      await api.planningCategories.assign.mutate({ noteId, categoryId });
      await currentListState.resetAndCall({});
    } catch (cause) {
      console.error('Failed to move the plan', cause);
    }
  };

  // Calendar cells for the visible month, each carrying the plans due that day.
  // Placement uses the task date (deadline, falling back to creation) so a
  // plan with a future deadline no longer sits on its creation day.
  const calendarDays = useMemo(() => {
    const start = calendarMonth.startOf('month');
    const startOfGrid = start.startOf('week');
    const days: { key: string; date: ReturnType<typeof dayjs>; isCurrentMonth: boolean; plans: any[] }[] = [];
    for (let index = 0; index < 42; index += 1) {
      const date = startOfGrid.add(index, 'day');
      days.push({
        key: date.format('YYYY-MM-DD'),
        date,
        isCurrentMonth: date.month() === start.month(),
        plans: pagedNotes.filter((note) => dayjs(taskDateOf(note)).isSame(date, 'day')),
      });
    }
    return days;
  }, [calendarMonth, pagedNotes]);

  // Finish-status lanes for the kanban: urgency buckets derived from the same
  // deadline the card footer shows, plus a real Completed lane backed by the
  // archived stream (see showCompleted above).
  const STATUS_COLUMNS: { id: 'overdue' | 'due-soon' | 'open' | 'no-deadline' | 'completed'; color: string; icon: string }[] = [
    { id: 'overdue', color: 'var(--destructive)', icon: 'mdi:alert-circle-outline' },
    { id: 'due-soon', color: 'var(--warning)', icon: 'mdi:clock-alert-outline' },
    { id: 'open', color: 'var(--info)', icon: 'mdi:circle-outline' },
    { id: 'no-deadline', color: 'var(--muted-foreground)', icon: 'mdi:calendar-question' },
    { id: 'completed', color: 'var(--success)', icon: 'mdi:check-circle-outline' },
  ];

  const statusColumns = useMemo(() => STATUS_COLUMNS.map((column) => ({
    ...column,
    name: t(`plan-status-${column.id}`),
    plans: pagedNotes.filter((note) => planStatusOf(note) === column.id),
  })), [pagedNotes, t]);

  const visibleStatusColumns = useMemo(
    () => (showCompleted ? statusColumns : statusColumns.filter((column) => column.id !== 'completed')),
    [statusColumns, showCompleted],
  );

  const setPlanDone = async (noteId: number, done: boolean) => {
    try {
      await planinc.upsertNote.call({ id: noteId, isArchived: done });
      await currentListState.resetAndCall({});
      if (showCompleted) await planinc.archivedList.resetAndCall({});
    } catch (cause) {
      console.error('Failed to update plan status', cause);
    }
  };

  const listGridClass = activeViewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-2';

  const body = (
    <>
      {showInlineComposer && (
        <div className='px-2 md:px-6'>
          <PlanIncEditor mode='create' key='create-key' onHeightChange={height => {
            if (!isPc) return
            store.editorHeight = height
          }} />
        </div>
      )}

      <LoadingAndEmpty
        isLoading={currentListState.isLoading}
        isEmpty={currentListState.isEmpty}
        action={
          !currentListState.isLoading && currentListState.isEmpty && !isTrashView ? (
            <Button
              size="sm"
              variant="flat"
              onPress={() => ShowEditPlanIncModel('2xl', 'create')}
              startContent={<Icon icon="tabler:plus" width="16" height="16" />}
            >
              {t('add-to-planinc')}
            </Button>
          ) : null
        }
      />

      {
        !currentListState.isEmpty &&
        <ScrollArea
          ref={scrollAreaRef}
          fixMobileTopBar
          onRefresh={async () => {
            await currentListState.resetAndCall({})
          }}
          onBottom={() => {
            planinc.onBottom();
          }}
          style={{ height: showInlineComposer ? `calc(100% - ${isPc ? store.editorHeight : 10}px)` : '100%' }}
          className={`px-2 mt-0 md:mt-0 md:px-6 w-full h-full !transition-all scroll-area`}>

          {/* Shared controls: sticky so the view switcher stays reachable while
              scrolling. Left: category chips; right: views. Type switching lives
              in the Agenda directory on agenda surfaces. */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-background py-2">
            {showPlanControls ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label={t('category-filter')}>
                <Chip
                  size="sm"
                  variant={categoryFilter === 'all' ? 'solid' : 'flat'}
                  className="cursor-pointer"
                  onClick={() => setCategoryFilter('all')}
                >
                  {t('all-categories')}
                </Chip>
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    size="sm"
                    variant={categoryFilter === category.id ? 'solid' : 'flat'}
                    className="cursor-pointer"
                    style={categoryFilter === category.id ? undefined : { borderColor: category.color, color: category.color }}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    {category.name}
                  </Chip>
                ))}
                <Chip
                  size="sm"
                  variant={categoryFilter === 'none' ? 'solid' : 'flat'}
                  className="cursor-pointer"
                  onClick={() => setCategoryFilter('none')}
                >
                  {t('uncategorised')}
                </Chip>
                {activeViewMode === 'kanban' && (
                  <div className="flex items-center gap-1" role="group" aria-label={t('kanban-group')}>
                    <Button
                      size="sm"
                      variant={kanbanGroup === 'category' ? 'solid' : 'ghost'}
                      aria-pressed={kanbanGroup === 'category'}
                      onPress={() => setKanbanGroup('category')}
                    >
                      {t('group-by-category')}
                    </Button>
                    <Button
                      size="sm"
                      variant={kanbanGroup === 'status' ? 'solid' : 'ghost'}
                      aria-pressed={kanbanGroup === 'status'}
                      onPress={() => setKanbanGroup('status')}
                    >
                      {t('group-by-status')}
                    </Button>
                  </div>
                )}
                <Button
                  size="sm"
                  variant={showCompleted ? 'solid' : 'ghost'}
                  aria-pressed={showCompleted}
                  onPress={() => setShowCompleted((value) => !value)}
                >
                  <Icon icon={showCompleted ? 'mdi:check-circle' : 'mdi:circle-outline'} width="16" height="16" />
                  {t('show-completed')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1" role="group" aria-label={t('type-filter')}>
                {([
                  { id: 'all' as const, label: t('all'), icon: 'solar:layers-linear' },
                  { id: 'planinc' as const, label: t('type-plan'), icon: 'solar:bill-list-linear' },
                  { id: 'note' as const, label: t('type-note'), icon: 'hugeicons:note' },
                  { id: 'todo' as const, label: t('type-task'), icon: 'solar:bill-check-linear' },
                ]).map((row) => (
                  <Button
                    key={row.id}
                    size="sm"
                    variant={agendaTypeParam === row.id ? 'solid' : 'ghost'}
                    aria-pressed={agendaTypeParam === row.id}
                    onPress={() => setAgendaType(row.id)}
                  >
                    <Icon icon={row.icon} width="16" height="16" />
                    {row.label}
                  </Button>
                ))}
              </div>
            )}
            <PlanningViewSwitch
              value={activeViewMode}
              onChange={setActiveViewMode}
              modes={
                showPlanControls
                  ? ['kanban', 'calendar', 'cards', 'timeline', 'list', 'grid']
                  : agendaTypeParam === 'note' || agendaTypeParam === 'planinc'
                    ? ['cards', 'grid', 'list']
                    : undefined
              }
            />
          </div>

          {showPlanControls ? (
            activeViewMode === 'kanban' ? (
              kanbanGroup === 'status' ? (
                <div className="flex gap-3 overflow-x-auto pb-3" aria-label={t('view-kanban')}>
                  {visibleStatusColumns.map((column) => (
                    <section key={column.id} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-content2 p-3">
                      <header className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: column.color }}>
                            <Icon icon={column.icon} width="14" height="14" className="text-white" />
                          </span>
                          <h3 className="text-sm font-semibold">{column.name}</h3>
                        </span>
                        <Chip size="sm" variant="flat">{column.plans.length}</Chip>
                      </header>
                      <div className="flex flex-col gap-2">
                        {column.plans.map((plan) => (
                          <div key={plan.id} className="flex flex-col gap-1">
                            <PlanIncCard planincItem={plan} />
                            {plan.isArchived ? (
                              <Button size="sm" variant="flat" onPress={() => void setPlanDone(plan.id, false)}>
                                <Icon icon="solar:refresh-circle-bold" width="16" height="16" />
                                {t('reopen')}
                              </Button>
                            ) : (
                              <Button size="sm" variant="flat" onPress={() => void setPlanDone(plan.id, true)}>
                                <Icon icon="mdi:check-circle-outline" width="16" height="16" />
                                {t('mark-complete')}
                              </Button>
                            )}
                          </div>
                        ))}
                        {!column.plans.length && <p className="py-4 text-center text-xs text-muted-foreground">{t('no-data-here-well-then-time-to-write-a-note')}</p>}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
              <div className="flex gap-3 overflow-x-auto pb-3" aria-label={t('view-kanban')}>
                {categoryColumns.map((column) => (
                  <section key={column.id ?? 'none'} className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl bg-content2 p-3">
                    <header className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: column.color }}>
                          <Icon icon={column.icon} width="14" height="14" className="text-white" />
                        </span>
                        <h3 className="text-sm font-semibold">{column.name}</h3>
                      </span>
                      <Chip size="sm" variant="flat">{column.plans.length}</Chip>
                    </header>
                    <div className="flex flex-col gap-2">
                      {column.plans.map((plan) => (
                        <div key={plan.id} className="flex flex-col gap-1">
                          <PlanIncCard planincItem={plan} />
                          <Select
                            size="sm"
                            aria-label={`${t('move-to-category')}: ${String(plan.content ?? '').slice(0, 40)}`}
                            placeholder={t('move-to-category')}
                            selectedKeys={[]}
                            onSelectionChange={(keys) => {
                              const target = Array.from(keys)[0];
                              if (target === undefined) return;
                              void assignCategory(plan.id, target === 'none' ? null : Number(target));
                            }}
                          >
                            <SelectItem key="none">{t('uncategorised')}</SelectItem>
                            {categories.map((category) => (
                              <SelectItem key={String(category.id)}>{category.name}</SelectItem>
                            ))}
                          </Select>
                        </div>
                      ))}
                      {!column.plans.length && <p className="py-4 text-center text-xs text-gray-500">{t('no-data-here-well-then-time-to-write-a-note')}</p>}
                    </div>
                  </section>
                ))}
              </div>
              )
            ) : activeViewMode === 'calendar' ? (
              <div className="calendar-view">
                <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:justify-between">
                  <Button size="sm" variant="flat" onPress={() => setCalendarMonth((current) => current.subtract(1, 'month'))}>{t('previous-month')}</Button>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold">{calendarMonth.format('MMMM YYYY')}</h3>
                    <Button size="sm" variant="light" onPress={() => setCalendarMonth(dayjs().startOf('month'))}>{t('this-month')}</Button>
                  </div>
                  <Button size="sm" variant="flat" onPress={() => setCalendarMonth((current) => current.add(1, 'month'))}>{t('next-month')}</Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-500">
                  {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => (
                    <span key={day}>{t(`weekday-${day}`)}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => (
                    <div
                      key={day.key}
                      className={`min-h-[92px] rounded-xl border p-1 ${day.isCurrentMonth ? 'border-divider bg-content1' : 'border-transparent bg-content2/40 opacity-60'}`}
                    >
                      <div className={`mb-1 text-right text-xs font-semibold ${day.date.isSame(dayjs(), 'day') ? 'text-primary' : 'text-gray-500'}`}>
                        {day.date.date()}
                      </div>
                      <div className="flex flex-col gap-1">
                        {day.plans.slice(0, 3).map((plan) => (
                          <span
                            key={plan.id}
                            title={String(plan.content ?? '').slice(0, 80)}
                            className={`truncate rounded-md px-1 py-0.5 text-[11px] ${planStatusOf(plan) === 'overdue' ? 'bg-destructive/15 font-semibold text-destructive' : planStatusOf(plan) === 'completed' ? 'bg-success/15 text-success line-through' : 'bg-content2'}`}
                          >
                            {String(plan.content ?? '').replace(/<[^>]+>/g, '').slice(0, 28)}
                          </span>
                        ))}
                        {day.plans.length > 3 && <span className="text-[11px] text-gray-500">+{day.plans.length - 3}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeViewMode === 'timeline' || activeViewMode === 'list' ? (
              <div className="timeline-view relative">
                {Object.entries(todosByDate).map(([date, { displayDate, todos }]) => (
                  <div key={date} className="mb-6 relative">
                    <div className="flex items-center mb-2 relative z-10">
                      <div className="w-4 h-4 rounded-sm bg-primary absolute left-[4.5px] transform translate-x-[-50%]"></div>
                      <h3 className="text-base font-bold ml-5">{displayDate}</h3>
                    </div>
                    <div className="md:pl-4">
                      {todos.map(todo => (
                        <div key={todo.id} className="mb-3">
                          <PlanIncCard planincItem={todo} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(todosByDate).length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Icon icon="mdi:clipboard-text-outline" width="48" height="48" className="mx-auto mb-2 opacity-50" />
                    <p>{t('no-data-here-well-then-time-to-write-a-note')}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className={activeViewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3 md:grid-cols-2'}>
                {pagedNotes.map((todo) => (
                  <div key={todo.id}>
                    <PlanIncCard planincItem={todo} />
                  </div>
                ))}
              </div>
            )
          ) : activeViewMode === 'cards' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <Masonry
                // One column count for the active tier, from the same registry
                // settings the settings panel writes. The previous three-point
                // object carried its own 768/1280 pair and its own fall-backs
                // (1/2/2), which disagreed with the registry defaults (1/2/4)
                // and ignored the other five tiers — so an ultrawide window kept
                // the 1280px count. `cardColumnsFor` also clamps a preference to
                // the tier, and the responsive override selects the tier.
                breakpointCols={cardColumnsFor(
                  viewportWidth,
                  preferredCardColumns(tier.name, {
                    small: Number(planinc.config.value?.smallDeviceCardColumns ?? 1),
                    medium: Number(planinc.config.value?.mediumDeviceCardColumns ?? 2),
                    large: Number(planinc.config.value?.largeDeviceCardColumns ?? 4),
                  }),
                )}
                className="card-masonry-grid"
                columnClassName="card-masonry-grid_column">
                {
                  localNotes?.map((i) => {
                    const showInsertLine = insertPosition === i.id && activeId !== i.id;
                    return (
                      <DraggablePlanIncCard
                        key={i.id}
                        planincItem={i}
                        showInsertLine={showInsertLine}
                        insertPosition="top"
                        isDragForbidden={isDragForbidden && showInsertLine}
                      />
                    );
                  })
                }
              </Masonry>
              <DragOverlay>
                {activeId ? (
                  <div className="rotate-3 scale-105 opacity-90 max-w-sm shadow-xl">
                    <PlanIncCard
                      planincItem={localNotes.find(n => n.id === activeId)}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className={listGridClass}>
              {localNotes?.map((i) => (
                <div key={i.id}>
                  <PlanIncCard planincItem={i} />
                </div>
              ))}
            </div>
          )}

          {filteredNotes.length > 0 && (
            <PlanningPagination
              page={page}
              pageSize={pageSize}
              total={filteredNotes.length}
              onPageChange={changePage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48]}
            />
          )}

          {store.showLoadAll && <div className='select-none w-full text-center text-sm font-bold text-ignore my-4'>{t('all-notes-have-been-loaded', { items: currentListState.value?.length })}</div>}
        </ScrollArea>
      }
    </>
  );

  return (
    <div
      style={{
        maxWidth: planinc.config.value?.maxHomePageWidth ? `${planinc.config.value?.maxHomePageWidth}px` : '100%'
      }}
      className={`pt-1 md:p-0 relative h-full flex flex-col-reverse md:flex-col mx-auto w-full`}>

      {/* Floating add matches every other planning surface; the inline
          composer stays collapsed unless explicitly expanded. */}
      <PlanIncAddButton />
      {isPc && !planinc.config.value?.hidePcEditor && (
        <button
          type="button"
          className="sr-only focus:not-sr-only fixed bottom-4 left-4 z-50 rounded-xl bg-background px-3 py-2 text-sm shadow"
          onClick={() => setComposerOpen((open) => !open)}
        >
          {composerOpen ? t('close') : t('add-to-planinc')}
        </button>
      )}

      {isAgendaView && isPc ? (
        <div className="flex h-full min-h-0 w-full gap-0 px-2 md:px-4">
          <AgendaDirectory
            type={agendaTypeParam}
            onTypeChange={setAgendaType}
            categories={categories}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            showCategories={showPlanControls}
          />
          <div className="flex min-w-0 flex-1 flex-col">{body}</div>
        </div>
      ) : (
        body
      )}
    </div>
  );
});

export default Home;
