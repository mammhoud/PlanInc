import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Common/Iconify/icons';
import { openRelatedNote } from '@/components/PlanIncReference/RelatedItems';

export type LinkEntityType = 'note' | 'ticket' | 'study' | 'resource' | 'agent';

const stripHtml = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').trim();

interface RelatedLinksProps {
  entityType: LinkEntityType;
  entityId: number | null | undefined;
  className?: string;
  max?: number;
}

/**
 * Inline "Related" strip for planning entities. Bridges tickets/study back to
 * the note (or other item) they were linked from, using the same planningLinks
 * data as the modal. Reuses existing i18n keys only (PI-009 parity).
 */
export function RelatedLinks({ entityType, entityId, className, max = 6 }: RelatedLinksProps) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    if (entityId == null) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    void api.planningLinks.list
      .query({ entityType, entityId }, { context: { skipBatch: true } })
      .then((next) => {
        if (!cancelled) setLinks(next);
      })
      .catch((cause) => console.error('Failed to load related links', cause));
    void api.notes.list
      .mutate({ page: 1, size: 50, isRecycle: false, isArchived: false })
      .then((next) => {
        if (!cancelled) setNotes(next);
      })
      .catch((cause) => console.error('Failed to load related notes', cause));
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (!links.length) return null;

  const resolve = (link: any) => {
    const outgoing = link.sourceType === entityType && link.sourceId === entityId;
    const otherType = (outgoing ? link.targetType : link.sourceType) as LinkEntityType;
    const otherId = outgoing ? link.targetId : link.sourceId;
    if (otherType === 'note') {
      const note = notes.find((item) => item.id === otherId);
      return {
        key: `link-${link.id}`,
        otherType,
        otherId,
        label: note ? stripHtml(note.content).slice(0, 60) || `note:${otherId}` : `note:${otherId}`,
      };
    }
    return {
      key: `link-${link.id}`,
      otherType,
      otherId,
      label: link.label || `${otherType}:${otherId}`,
    };
  };

  return (
    <section
      className={cn('related-items flex flex-col gap-2', className)}
      aria-label={t('related-items')}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-desc">{t('related-items')}</p>
      <div className="flex flex-wrap gap-2">
        {links.slice(0, max).map((link) => {
          const item = resolve(link);
          return (
            <button
              key={item.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (item.otherType === 'note') void openRelatedNote(item.otherId);
              }}
              className="max-w-[260px] truncate rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              title={item.label}
            >
              <Icon
                icon="iconamoon:arrow-top-right-1"
                width="12"
                height="12"
                className="mr-1 inline text-primary"
              />
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
