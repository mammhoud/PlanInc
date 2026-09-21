import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import i18n from '@/lib/i18n';

/**
 * Move notes to the Recycle Bin and offer an inline undo.
 *
 * Trashing is reversible server-side (`isRecycle` is a flag, not a row removal), so the app does
 * not need a confirmation dialog for it — a toast with Undo is both faster and safer than the
 * hard-delete path, which stays behind its own confirm. Every trash call site goes through here so
 * the undo affordance exists uniformly instead of only where someone remembered to add it.
 */
export async function trashNotesWithUndo(ids: Array<number | undefined | null>): Promise<void> {
  const noteIds = ids.filter((id): id is number => typeof id === 'number' && id > 0);
  if (noteIds.length === 0) return;

  const planinc = RootStore.Get(PlanIncStore);
  const toast = RootStore.Get(ToastPlugin);

  try {
    await api.notes.trashMany.mutate({ ids: noteIds });
    planinc.updateTicker++;

    toast.undo(i18n.t('moved-to-recycle-bin'), {
      label: i18n.t('undo'),
      onUndo: async () => {
        try {
          await api.notes.updateMany.mutate({ ids: noteIds, isRecycle: false });
          planinc.updateTicker++;
        } catch (error) {
          toast.error((error as Error).message);
        }
      },
    });
  } catch (error) {
    toast.error((error as Error).message);
  }
}
