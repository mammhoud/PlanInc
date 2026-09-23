import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { PlanIncStore } from '@/store/planincStore';
import { NoteType } from '@shared/lib/types';
import { allSettings } from '@/pages/settings';
import { eventBus } from '@/lib/event';
import { cn } from '@/lib/utils';

/** Emitted to toggle this palette from anywhere (hotkeys, menus, tests). */
export const OPEN_COMMAND_PALETTE_EVENT = 'open-command-palette';
/** Emitted by the palette's search action so the shipped GlobalSearch opens instead of a second search. */
export const OPEN_GLOBAL_SEARCH_EVENT = 'open-global-search';

type PaletteSection = 'action' | 'navigation' | 'setting';

type PaletteItem = {
  id: string;
  section: PaletteSection;
  title: string;
  keywords: string[];
  run: () => void;
};

const SECTION_ORDER: PaletteSection[] = ['action', 'navigation', 'setting'];
const SECTION_LABEL: Record<PaletteSection, string> = {
  action: 'Actions',
  navigation: 'Navigation',
  setting: 'Settings',
};

// Route targets mirror the router in App.tsx. Labels are plain strings rather than new i18n keys so
// this change adds no locale churn; localising them is a follow-up, not a hidden dependency.
const NAVIGATION: { path: string; title: string; keywords: string[] }[] = [
  { path: '/?path=agenda', title: 'Agenda', keywords: ['agenda', 'plans', 'notes', 'tasks', 'home', '日程', '议程'] },
  { path: '/?path=agenda&type=note', title: 'Agenda notes', keywords: ['notes', 'cards', '笔记'] },
  { path: '/?path=agenda&type=todo', title: 'Agenda plans', keywords: ['plans', 'todo', 'tasks', '计划'] },
  { path: '/all', title: 'All notes', keywords: ['all', 'everything', '全部'] },
  { path: '/dashboard', title: 'Dashboard', keywords: ['dashboard', 'overview', '仪表盘'] },
  { path: '/resources', title: 'Resources', keywords: ['resources', 'files', 'attachments', '资源', '文件'] },
  { path: '/tickets', title: 'Tickets', keywords: ['tickets', 'tasks', '工单'] },
  { path: '/study', title: 'Study', keywords: ['study', 'flashcards', 'questions', '学习'] },
  { path: '/skills', title: 'Skills', keywords: ['skills', 'mastery', 'expert', '技能'] },
  { path: '/graph', title: 'Graph', keywords: ['graph', 'links', 'backlinks', '图谱', '关系'] },
  { path: '/review', title: 'Review', keywords: ['review', 'daily', '回顾'] },
  { path: '/ai', title: 'AI chat', keywords: ['ai', 'chat', 'assistant', '对话'] },
  { path: '/hub', title: 'Hub', keywords: ['hub', 'feeds', 'rss'] },
  { path: '/insights', title: 'Insights', keywords: ['insights', 'analytics', 'reports', 'metrics', '统计'] },
  { path: '/?path=trash', title: 'Recycle Bin', keywords: ['trash', 'bin', 'recycle', 'deleted'] },
  { path: '/plugin', title: 'Plugins', keywords: ['plugins', 'extensions', '插件'] },
  { path: '/settings', title: 'Settings', keywords: ['settings', 'preferences', '设置'] },
];

const matches = (item: PaletteItem, query: string) => {
  if (!query) return true;
  const haystack = [item.title, ...item.keywords].join(' ').toLowerCase();
  // Every whitespace-separated token must appear, so "new note" narrows rather than widens.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(token => haystack.includes(token));
};

export const CommandPalette = observer(
  ({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const user = RootStore.Get(UserStore);
    const planinc = RootStore.Get(PlanIncStore);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!isOpen) {
        setQuery('');
        setActiveIndex(0);
        return;
      }
      // Radix moves focus on open; the palette wants the caret in the query field.
      const frame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }, [isOpen]);

    const close = () => onOpenChange(false);

    const items = useMemo<PaletteItem[]>(() => {
      const actions: PaletteItem[] = [
        {
          id: 'action:new-note',
          section: 'action',
          title: 'New note',
          keywords: ['new', 'note', 'create', 'add', '新建', '笔记'],
          run: () => {
            void planinc.upsertNote.call({ type: NoteType.NOTE });
            navigate('/');
          },
        },
        {
          id: 'action:search',
          section: 'action',
          title: 'Search notes, resources and tags',
          keywords: ['search', 'find', 'query', '搜索', '查找'],
          run: () => eventBus.emit(OPEN_GLOBAL_SEARCH_EVENT),
        },
      ];

      const navigation: PaletteItem[] = NAVIGATION.map(entry => ({
        id: `nav:${entry.path}`,
        section: 'navigation',
        title: entry.title,
        keywords: [...entry.keywords, entry.path],
        run: () => navigate(entry.path),
      }));

      // Same visibility rule the settings page and the global search apply.
      const settings: PaletteItem[] = allSettings
        .filter(setting => !setting.requireAdmin || user.isSuperAdmin)
        .map(setting => ({
          id: `setting:${setting.key}`,
          section: 'setting',
          title: t(setting.title),
          keywords: [setting.key, setting.group, ...(setting.keywords ?? [])],
          // The settings page reads `?section=`, which is how the global search deep-links today.
          run: () => navigate(`/settings?section=${setting.key}`),
        }));

      return [...actions, ...navigation, ...settings];
    }, [navigate, planinc, t, user]);

    const filtered = useMemo(() => items.filter(item => matches(item, query)), [items, query]);
    const grouped = useMemo(
      () =>
        SECTION_ORDER.map(section => ({
          section,
          entries: filtered.filter(item => item.section === section),
        })).filter(group => group.entries.length > 0),
      [filtered],
    );

    useEffect(() => {
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      const node = listRef.current?.querySelector<HTMLElement>('[data-palette-active="true"]');
      node?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, filtered.length]);

    const runItem = (item: PaletteItem | undefined) => {
      if (!item) return;
      close();
      item.run();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(index => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(index => (filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        runItem(filtered[activeIndex]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 gap-0 overflow-hidden max-w-xl">
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or jump to…"
              className="border-0 shadow-none focus-visible:ring-0 h-9"
              aria-label="Command palette query"
            />
          </div>

          <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
            {grouped.length === 0 && (
              <div className="px-3 py-6 text-sm text-desc text-center">No matching commands</div>
            )}

            {grouped.map(group => (
              <div key={group.section} className="mb-2">
                <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-desc">
                  {SECTION_LABEL[group.section]}
                </div>
                {group.entries.map(item => {
                  const index = filtered.indexOf(item);
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-palette-active={isActive ? 'true' : 'false'}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2',
                        isActive ? 'bg-hover text-foreground' : 'text-foreground/80 hover:bg-hover/60',
                      )}
                    >
                      <span className="truncate">{item.title}</span>
                      {group.section === 'setting' && (
                        <span className="text-[11px] text-desc uppercase">{item.id.split(':')[1]}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  },
);
