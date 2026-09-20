import { PlanIncStore } from '@/store/planincStore';
import { observer } from 'mobx-react-lite';
import Masonry from 'react-masonry-css';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { PlanIncEditor } from '@/components/PlanIncEditor';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { PlanIncCard } from '@/components/PlanIncCard';
import { PlanIncAddButton } from '@/components/PlanIncAddButton';
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
import { Button, Chip, Select, SelectItem } from '@heroui/react';
import { api } from '@/lib/trpc';
import { useSideNav } from '@/platform/PlatformProvider';

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
  const planinc = RootStore.Get(PlanIncStore)
  planinc.use()
  planinc.useQuery();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isTodoView = searchParams.get('path') === 'todo';
  const isNotesView = searchParams.get('path') === 'notes';
  const isArchivedView = searchParams.get('path') === 'archived';
  const isTrashView = searchParams.get('path') === 'trash';
  const isAllView = searchParams.get('path') === 'all';
  const [activeId, setActiveId] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [isDragForbidden, setIsDragForbidden] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const currentListState = useMemo(() => {
    if (isNotesView) {
      return planinc.noteOnlyList;
    } else if (isTodoView) {
      return planinc.todoList;
    } else if (isArchivedView) {
      return planinc.archivedList;
    } else if (isTrashView) {
      return planinc.trashList;
    } else if (isAllView) {
      return planinc.noteList;
    } else {
      return planinc.planincList;
    }
  }, [isNotesView, isTodoView, isArchivedView, isTrashView, isAllView, planinc]);

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

  useEffect(() => {
    api.planningCategories.list.query()
      .then((rows) => setCategories(rows))
      .catch((cause) => { console.error('Failed to load plan categories', cause); setCategories([]); });
  }, [location.pathname]);

  const loadedNotes = useMemo(() => currentListState.value ?? [], [currentListState.value]);

  // The category filter narrows the stream before pagination, so a board column
  // and the footer always describe the same set of plans.
  const filteredNotes = useMemo(() => {
    if (!isTodoView || categoryFilter === 'all') return loadedNotes;
    if (categoryFilter === 'none') return loadedNotes.filter((note) => note.categoryId == null);
    return loadedNotes.filter((note) => note.categoryId === categoryFilter);
  }, [loadedNotes, categoryFilter, isTodoView]);

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

  // Use drag card hook only for non-todo views, and only over the current page
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

  // Group only the current page of todos so the timeline respects pagination.
  const todosByDate = useMemo(() => {
    if (!isTodoView || !pagedNotes.length) return {} as Record<string, TodoGroup>;
    const todoItems = pagedNotes;
    const groupedTodos: Record<string, TodoGroup> = {};
    todoItems.forEach(todo => {
      const date = dayjs(todo.createdAt).format('YYYY-MM-DD');
      const isToday = dayjs().isSame(dayjs(todo.createdAt), 'day');
      const isYesterday = dayjs().subtract(1, 'day').isSame(dayjs(todo.createdAt), 'day');
      let displayDate;
      if (isToday) {
        displayDate = t('today');
      } else if (isYesterday) {
        displayDate = t('yesterday');
      } else {
        displayDate = dayjs(todo.createdAt).format('MM/DD (ddd)');
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
  }, [pagedNotes, isTodoView, t]);

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
    columns.push({ id: null, name: t('uncategorised'), color: '#5A6B7B', icon: 'tabler:archive' });
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

  // Calendar cells for the visible month, each carrying the plans filed that day.
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
        plans: pagedNotes.filter((note) => dayjs(note.createdAt).isSame(date, 'day')),
      });
    }
    return days;
  }, [calendarMonth, pagedNotes]);

  const listGridClass = activeViewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-2';

  return (
    <div
      style={{
        maxWidth: planinc.config.value?.maxHomePageWidth ? `${planinc.config.value?.maxHomePageWidth}px` : '100%'
      }}
      className={`pt-1 md:p-0 relative h-full flex flex-col-reverse md:flex-col mx-auto w-full`}>

      {store.showEditor && isPc && !planinc.config.value?.hidePcEditor && <div className='px-2 md:px-6' >
        <PlanIncEditor mode='create' key='create-key' onHeightChange={height => {
          if (!isPc) return
          store.editorHeight = height
        }} />
      </div>}
      {(!isPc || planinc.config.value?.hidePcEditor) && <PlanIncAddButton />}

      <LoadingAndEmpty
        isLoading={currentListState.isLoading}
        isEmpty={currentListState.isEmpty}
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
          style={{ height: store.showEditor ? `calc(100% - ${(isPc ? (!store.showEditor ? store.editorHeight : 10) : 0)}px)` : '100%' }}
          className={`px-2 mt-0 md:${planinc.config.value?.hidePcEditor ? 'mt-0' : 'mt-4'} md:px-6 w-full h-full !transition-all scroll-area`}>

          {/* Shared controls: the same switch/pagination drive the note streams and
              the plans surface (board, calendar, timeline or cards). */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            {isTodoView ? (
              <div className="flex flex-wrap items-center gap-2" aria-label={t('category-filter')}>
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
              </div>
            ) : <span />}
            <PlanningViewSwitch
              value={activeViewMode}
              onChange={setActiveViewMode}
              modes={isTodoView ? ['kanban', 'calendar', 'cards', 'timeline'] : undefined}
            />
          </div>

          {isTodoView ? (
            activeViewMode === 'kanban' ? (
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
            ) : activeViewMode === 'calendar' ? (
              <div className="calendar-view">
                <div className="mb-3 flex items-center justify-between gap-2">
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
                            className="truncate rounded-md bg-content2 px-1 py-0.5 text-[11px]"
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
                breakpointCols={{
                  default: planinc.config?.value?.largeDeviceCardColumns ? Number(planinc.config?.value?.largeDeviceCardColumns) : 2,
                  1280: planinc.config?.value?.mediumDeviceCardColumns ? Number(planinc.config?.value?.mediumDeviceCardColumns) : 2,
                  768: planinc.config?.value?.smallDeviceCardColumns ? Number(planinc.config?.value?.smallDeviceCardColumns) : 1
                }}
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
    </div>
  );
});

export default Home;
