import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { useTranslation } from 'react-i18next';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { ShowUpdateTagDialog } from '../Common/UpdateTagPop';
import { showTipsDialog } from '../Common/TipsDialog';
import { PlanIncStore } from '@/store/planincStore';
import { api } from '@/lib/trpc';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { MultiSelectToolbar } from '../Common/MultiSelectToolbar';
import { trashNotesWithUndo } from '@/lib/trashWithUndo';

export const PlanIncMultiSelectPop = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const isArchivedView = planinc.noteListFilterConfig.isArchived;

  const actions = [
    {
      icon: isArchivedView ? "eva:archive-outline" : "eva:archive-outline",
      text: isArchivedView ? t('recovery') : t('archive'),
      onClick: async () => {
        await RootStore.Get(ToastPlugin).promise(
          api.notes.updateMany.mutate({ ids: planinc.curMultiSelectIds, isArchived: !isArchivedView }),
          {
            loading: t('in-progress'),
            success: <b>{t('your-changes-have-been-saved')}</b>,
            error: <b>{t('operation-failed')}</b>,
          });
        planinc.onMultiSelectRest();
      }
    },
    {
      icon: "solar:tag-outline",
      text: t('add-tag'),
      onClick: () => {
        ShowUpdateTagDialog({
          type: 'select',
          onSave: async (tagName) => {
            await RootStore.Get(ToastPlugin).promise(
              api.tags.updateTagMany.mutate({ tag: tagName, ids: planinc.curMultiSelectIds }),
              {
                loading: t('in-progress'),
                success: <b>{t('your-changes-have-been-saved')}</b>,
                error: <b>{t('operation-failed')}</b>,
              });
            planinc.onMultiSelectRest();
          }
        });
      }
    },
    {
      icon: "hugeicons:chat",
      text: t('select-as-agent'),
      onClick: async () => {
        await RootStore.Get(ToastPlugin).promise(
          api.tags.updateTagMany.mutate({ tag: 'agent', ids: planinc.curMultiSelectIds }),
          {
            loading: t('in-progress'),
            success: <b>{t('your-changes-have-been-saved')}</b>,
            error: <b>{t('operation-failed')}</b>,
          });
        planinc.onMultiSelectRest();
      }
    },
    {
      icon: "solar:trash-bin-trash-outline",
      text: t('trash'),
      onClick: () => {
        // Reversible, so it needs no confirm — the toast carries the Undo.
        void trashNotesWithUndo(planinc.curMultiSelectIds);
        planinc.onMultiSelectRest();
      }
    },
    {
      icon: "mingcute:delete-2-line",
      text: t('delete'),
      isDeleteButton: true,
      onClick: () => {
        showTipsDialog({
          title: t('confirm-to-delete'),
          content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
          onConfirm: async () => {
            await RootStore.Get(ToastPlugin).promise(
              api.notes.deleteMany.mutate({ ids: planinc.curMultiSelectIds }),
              {
                loading: t('in-progress'),
                success: <b>{t('your-changes-have-been-saved')}</b>,
                error: <b>{t('operation-failed')}</b>,
              });
            planinc.curMultiSelectIds.map(i => api.ai.embeddingDelete.mutate({ id: i }));
            planinc.onMultiSelectRest();
            RootStore.Get(DialogStandaloneStore).close();
          }
        });
      }
    }
  ];

  return (
    <MultiSelectToolbar
      show={planinc.isMultiSelectMode}
      actions={actions}
      onClose={() => planinc.onMultiSelectRest()}
    />
  );
});