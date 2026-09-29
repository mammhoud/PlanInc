import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { SideBarItem } from '@/components/Layout';
import { cn } from '@/lib/utils';

export type FolderTreeChild = {
  id: string;
  name: string;
  /** Small trailing hint (status, date, kind label). */
  meta?: string;
};

export type FolderTreeFolder = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  /** Overrides the default (children length). */
  count?: number;
  children?: FolderTreeChild[];
};

type Props = {
  folders: FolderTreeFolder[];
  selectedFolderId?: string | null;
  onSelectFolder: (id: string) => void;
  selectedChildId?: string | null;
  onSelectChild?: (folderId: string, childId: string) => void;
  /** Max children rendered per folder (default 30). */
  maxChildren?: number;
  /** When set, expanded state persists in localStorage under this key. */
  persistKey?: string;
  expandedByDefault?: boolean;
  /** Checkbox mode: folder click toggles expansion, children get checkboxes. */
  checkable?: boolean;
  checkedChildIds?: Set<string>;
  onToggleChildCheck?: (folderId: string, childId: string, checked: boolean) => void;
  /** External search text; auto-expands and filters matching folders/children. */
  filterText?: string;
  className?: string;
};

/**
 * Shared folder-style tree: expandable folders with icons, counts and an
 * optional document list inside each folder. Used by the Agenda directory,
 * the Study directory and the graph node picker.
 */
export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  selectedChildId,
  onSelectChild,
  maxChildren = 30,
  persistKey,
  expandedByDefault = true,
  checkable = false,
  checkedChildIds,
  onToggleChildCheck,
  filterText = '',
  className,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(persistKey);
        if (saved) return JSON.parse(saved) as Record<string, boolean>;
      } catch {
        // Corrupt state falls back to the default below.
      }
    }
    return {};
  });

  useEffect(() => {
    if (persistKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(persistKey, JSON.stringify(expanded));
      } catch {
        // Storage may be unavailable (private mode); expansion still works in memory.
      }
    }
  }, [expanded, persistKey]);

  const needle = filterText.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (!needle) return folders;
    return folders
      .map((folder) => {
        const children = (folder.children ?? []).filter((child) =>
          `${child.name} ${child.meta ?? ''}`.toLowerCase().includes(needle),
        );
        if (folder.name.toLowerCase().includes(needle)) return folder;
        if (children.length) return { ...folder, children };
        return null;
      })
      .filter((folder): folder is FolderTreeFolder => folder != null);
  }, [folders, needle]);

  const isExpanded = (id: string) => {
    if (needle) return true;
    if (id in expanded) return expanded[id];
    return expandedByDefault;
  };
  const toggleExpanded = (id: string) =>
    setExpanded((current) => ({ ...current, [id]: !isExpanded(id) }));

  const checkedCount = (folder: FolderTreeFolder) =>
    (folder.children ?? []).filter((child) => checkedChildIds?.has(child.id)).length;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {visibleFolders.map((folder) => {
        const open = isExpanded(folder.id);
        const children = (folder.children ?? []).slice(0, maxChildren);
        const hiddenChildren = Math.max(0, (folder.children ?? []).length - children.length);
        const count = folder.count ?? (folder.children ?? []).length;
        const selected = selectedFolderId === folder.id;
        return (
          <div key={folder.id}>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform hover:bg-content2"
                aria-label={open ? t('collapse-folder') : t('expand-folder')}
                aria-expanded={open}
                onClick={() => toggleExpanded(folder.id)}
              >
                <Icon
                  icon="mdi:chevron-right"
                  width="16"
                  height="16"
                  className={cn('transition-transform', open && 'rotate-90')}
                />
              </button>
              <button
                type="button"
                className={cn(SideBarItem, 'w-full flex-1', selected && '!bg-primary !text-primary-foreground')}
                aria-pressed={selected}
                onClick={() => {
                  if (checkable) toggleExpanded(folder.id);
                  else onSelectFolder(folder.id);
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: folder.color || 'var(--muted)' }}
                >
                  <Icon icon={folder.icon || 'tabler:folder'} width="12" height="12" className="text-white" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                {checkable && (folder.children?.length ?? 0) > 0 ? (
                  <span className="shrink-0 rounded-full bg-content2 px-1.5 text-xs text-foreground-500">
                    {checkedCount(folder)}/{folder.children?.length}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-content2 px-1.5 text-xs text-foreground-500">
                    {count}
                  </span>
                )}
              </button>
            </div>
            {open && children.length > 0 && (
              <ul className="ml-8 flex flex-col gap-0.5 border-l border-divider pl-1">
                {children.map((child) => {
                  const childSelected = selectedChildId === child.id;
                  const checked = checkedChildIds?.has(child.id) ?? false;
                  return (
                    <li key={child.id}>
                      {checkable ? (
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-content2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                            checked={checked}
                            onChange={(event) => onToggleChildCheck?.(folder.id, child.id, event.target.checked)}
                            aria-label={child.name}
                          />
                          <Icon icon="hugeicons:note" width="14" height="14" className="shrink-0 text-foreground-500" />
                          <span className="min-w-0 flex-1 truncate">{child.name}</span>
                          {child.meta && <span className="shrink-0 text-xs text-foreground-500">{child.meta}</span>}
                        </label>
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            SideBarItem,
                            'w-full !py-1.5 text-sm',
                            childSelected && '!bg-primary !text-primary-foreground',
                          )}
                          aria-current={childSelected}
                          onClick={() => onSelectChild?.(folder.id, child.id)}
                        >
                          <Icon icon="hugeicons:note" width="14" height="14" className="shrink-0 opacity-70" />
                          <span className="min-w-0 flex-1 truncate text-left">{child.name}</span>
                          {child.meta && <span className="shrink-0 text-xs opacity-70">{child.meta}</span>}
                        </button>
                      )}
                    </li>
                  );
                })}
                {hiddenChildren > 0 && (
                  <li className="px-2 py-1 text-xs text-foreground-500">+{hiddenChildren}</li>
                )}
              </ul>
            )}
          </div>
        );
      })}
      {!visibleFolders.length && (
        <p className="px-2 py-3 text-sm text-foreground-500">{t('no-data-here-well-then-time-to-write-a-note')}</p>
      )}
    </div>
  );
}
