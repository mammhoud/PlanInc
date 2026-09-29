import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { Note } from '@/lib/apiTypes';
import { cn } from '@/lib/utils';
import { RootStore } from '@/store';
import { PromiseState } from '@/store/standard/PromiseState';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { PlanIncCard } from '../PlanIncCard';
import { Icon } from '../Common/Iconify/icons';

export type NoteReference = {
  toNoteId?: number;
  fromNoteId?: number;
  toNote?: { createdAt?: string; updatedAt?: string; content?: string };
  fromNote?: { createdAt?: string; updatedAt?: string; content?: string };
};

const stripHtml = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').trim();

/**
 * Shared related-notes query. `PlanIncReference` (modal) and `RelatedItems`
 * (inline strip) both read from it, so there is one source of truth.
 */
export const useRelatedNotes = (noteId?: number) => {
  const store = RootStore.Local(() => ({
    outgoing: new PromiseState({
      function: async () =>
        noteId != null
          ? await api.notes.noteReferenceList.mutate({ noteId, type: 'references' })
          : [],
    }),
    incoming: new PromiseState({
      function: async () =>
        noteId != null
          ? await api.notes.noteReferenceList.mutate({ noteId, type: 'referencedBy' })
          : [],
    }),
  }));

  useEffect(() => {
    if (noteId != null) {
      store.outgoing.call();
      store.incoming.call();
    }
  }, [noteId]);

  return store;
};

export const openRelatedNote = async (noteId?: number) => {
  if (noteId == null) return;
  const note = await api.notes.detail.mutate({ id: noteId });
  RootStore.Get(DialogStandaloneStore).setData({
    isOpen: true,
    onlyContent: true,
    showOnlyContentCloseButton: true,
    size: '4xl',
    content: <PlanIncCard planincItem={note!} withoutHoverAnimation />,
  });
};

interface RelatedItemsProps {
  /** The note whose references should be shown. */
  note?: Note;
  /** Already-loaded references (skips the fetch, e.g. from a card payload). */
  references?: NoteReference[];
  referencedBy?: NoteReference[];
  className?: string;
  max?: number;
}

/**
 * Inline "Related" strip any module can embed: `<RelatedItems note={note} />`.
 * Reuses existing i18n keys only (PI-009 parity).
 */
export const RelatedItems = observer(
  ({ note, references, referencedBy, className, max = 6 }: RelatedItemsProps) => {
    const { t } = useTranslation();
    const preloaded = references != null || referencedBy != null;
    const store = useRelatedNotes(preloaded ? undefined : note?.id);
    const outgoing: NoteReference[] = references ?? store.outgoing.value ?? [];
    const incoming: NoteReference[] = referencedBy ?? store.incoming.value ?? [];

    if (!outgoing.length && !incoming.length) return null;

    const chip = (id: number | undefined, content: unknown, incomingRef: boolean, key: string) => (
      <button
        key={key}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void openRelatedNote(id);
        }}
        className="max-w-[260px] truncate rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        title={stripHtml(content)}
      >
        <Icon
          icon="iconamoon:arrow-top-right-1"
          width="12"
          height="12"
          className={incomingRef ? 'mr-1 inline rotate-180 text-primary' : 'mr-1 inline text-primary'}
        />
        {stripHtml(content).slice(0, 60) || t('related-items')}
      </button>
    );

    return (
      <section
        className={cn('related-items flex flex-col gap-2', className)}
        aria-label={t('related-items')}
        data-related-count={outgoing.length + incoming.length}
      >
        <p className="text-xs font-bold uppercase tracking-wider text-desc">
          {t('related-items')}
        </p>
        <div className="flex flex-wrap gap-2">
          {outgoing
            .slice(0, max)
            .map((ref, index) =>
              chip(ref.toNoteId, ref.toNote?.content, false, `out-${ref.toNoteId}-${index}`),
            )}
          {incoming
            .slice(0, max)
            .map((ref, index) =>
              chip(ref.fromNoteId, ref.fromNote?.content, true, `in-${ref.fromNoteId}-${index}`),
            )}
        </div>
      </section>
    );
  },
);
