import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderTree, type FolderTreeFolder } from './FolderTree';
import dayjs from '@/lib/dayjs';

export type AgendaTypeParam = 'all' | 'planinc' | 'note' | 'todo';

type CategoryRow = { id: number; name: string; color?: string; icon?: string };

export type AgendaDirectoryItem = {
  id: number;
  categoryId: number | null;
  title: string;
  createdAt?: string | Date;
};

type Props = {
  type: AgendaTypeParam;
  onTypeChange: (next: AgendaTypeParam) => void;
  categories: CategoryRow[];
  categoryFilter: number | 'all' | 'none';
  onCategoryChange: (next: number | 'all' | 'none') => void;
  showCategories?: boolean;
  showUncategorised?: boolean;
  /** Plans/notes backing the directory; each becomes a document row in its folder. */
  items?: AgendaDirectoryItem[];
  /** Open a document row: receives the note id and its folder's category. */
  onOpenItem?: (noteId: number, categoryId: number | null) => void;
  selectedItemId?: number | null;
};

const MAX_DOCS_PER_FOLDER = 30;

/**
 * Left directory for the Agenda stream: folder-style groups for types first
 * (the default first view), then plan categories, each category folder holding
 * its documents as an expandable tree with counts.
 */
export function AgendaDirectory({
  type,
  onTypeChange,
  categories,
  categoryFilter,
  onCategoryChange,
  showCategories = true,
  showUncategorised = true,
  items = [],
  onOpenItem,
  selectedItemId,
}: Props) {
  const { t } = useTranslation();

  const stripTitle = (value: unknown) =>
    String(value ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 42);

  const toDoc = (item: AgendaDirectoryItem) => ({
    id: String(item.id),
    name: stripTitle(item.title) || `#${item.id}`,
    meta: item.createdAt ? dayjs(item.createdAt).format('MM-DD') : undefined,
  });

  const docsOf = (categoryId: number | null) =>
    items.filter((item) => (item.categoryId ?? null) === categoryId).map(toDoc);

  const typeFolders: FolderTreeFolder[] = useMemo(
    () =>
      (
        [
          { id: 'all', label: t('all'), icon: 'solar:layers-linear' },
          { id: 'planinc', label: t('type-plan'), icon: 'solar:bill-list-linear' },
          { id: 'note', label: t('type-note'), icon: 'hugeicons:note' },
          { id: 'todo', label: t('type-task'), icon: 'solar:bill-check-linear' },
        ] as const
      ).map((row) => ({ id: row.id, name: row.label, icon: row.icon })),
    [t],
  );

  const categoryFolders: FolderTreeFolder[] = useMemo(() => {
    const folders: FolderTreeFolder[] = [
      {
        id: 'all',
        name: t('all-categories'),
        icon: 'tabler:folder',
        count: items.length,
        children: items.map(toDoc),
      },
      ...categories.map((category) => ({
        id: String(category.id),
        name: category.name,
        icon: category.icon || 'tabler:folder',
        color: category.color,
        count: docsOf(category.id).length,
        children: docsOf(category.id),
      })),
    ];
    if (showUncategorised) {
      folders.push({
        id: 'none',
        name: t('uncategorised'),
        icon: 'tabler:folder-off',
        count: docsOf(null).length,
        children: docsOf(null),
      });
    }
    return folders;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, items, showUncategorised, t]);

  const selectedCategoryId =
    categoryFilter === 'all' ? 'all' : categoryFilter === 'none' ? 'none' : String(categoryFilter);

  const handleChild = (_folderId: string, childId: string) => {
    if (!onOpenItem) return;
    const noteId = Number(childId);
    if (!Number.isFinite(noteId)) return;
    const item = items.find((candidate) => candidate.id === noteId);
    onOpenItem(noteId, item ? (item.categoryId ?? null) : null);
  };

  return (
    <nav
      className="flex w-full shrink-0 flex-col gap-1 md:w-52 md:border-r md:border-divider md:pr-3"
      aria-label={t('agenda-directory')}
      data-testid="agenda-directory"
    >
      <div className="ml-1 mt-1 text-xs font-bold text-primary">{t('directory-types')}</div>
      <FolderTree
        folders={typeFolders}
        selectedFolderId={type}
        onSelectFolder={(id) => onTypeChange(id as AgendaTypeParam)}
        persistKey="planinc:agenda:types-expanded"
      />
      {showCategories && (
        <>
          <div className="ml-1 mt-3 text-xs font-bold text-primary">{t('directory-categories')}</div>
          <FolderTree
            folders={categoryFolders}
            selectedFolderId={selectedCategoryId}
            onSelectFolder={(id) => {
              if (id === 'all') onCategoryChange('all');
              else if (id === 'none') onCategoryChange('none');
              else onCategoryChange(Number(id));
            }}
            selectedChildId={selectedItemId != null ? String(selectedItemId) : null}
            onSelectChild={handleChild}
            maxChildren={MAX_DOCS_PER_FOLDER}
            persistKey="planinc:agenda:folders-expanded"
          />
        </>
      )}
    </nav>
  );
}
