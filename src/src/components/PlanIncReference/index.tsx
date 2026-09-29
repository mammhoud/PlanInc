import { api } from "@/lib/trpc"
import { Note } from "@/lib/apiTypes"
import { RootStore } from "@/store"
import { PromiseState } from "@/store/standard/PromiseState"
import { DialogStore } from "@/store/module/Dialog"
import { observer } from "mobx-react-lite"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { PlanIncCard } from "../PlanIncCard"
import { ScrollArea } from "../Common/ScrollArea"
import { Icon } from "../Common/Iconify/icons"

export const PlanIncReference = observer(({ item }: { item: Note }) => {
  const { t } = useTranslation()
  const store = RootStore.Local(() => ({
    outgoing: new PromiseState({
      function: async () => {
        return await api.notes.noteReferenceList.mutate({ noteId: item.id!, type: 'references' })
      }
    }),
    incoming: new PromiseState({
      function: async () => {
        return await api.notes.noteReferenceList.mutate({ noteId: item.id!, type: 'referencedBy' })
      }
    }),
  }))
  const reload = () => {
    store.outgoing.call()
    store.incoming.call()
  }
  useEffect(() => {
    reload()
  }, [item.id])

  const unlink = async (fromNoteId: number, toNoteId: number) => {
    await api.notes.removeReference.mutate({ fromNoteId, toNoteId })
    reload()
  }

  return <div className="flex md:flex-row flex-col gap-2 p-6 w-full bg-secondbackground rounded-2xl max-h-[80vh]">
    <div className="w-full md:w-1/2 hidden md:block">
      <PlanIncCard planincItem={item} />
    </div>
    <ScrollArea className="w-full md:w-1/2 flex flex-col gap-4 max-h-[80vh]" onBottom={() => { }}>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-desc">{t('links-to')}</p>
        {store.outgoing.value?.map((ref: any) => (
          <div key={ref.id} className="relative">
            <PlanIncCard planincItem={ref} />
            <button
              type="button"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-danger shadow hover:bg-danger hover:text-white"
              aria-label={t('remove')}
              title={t('remove')}
              onClick={() => unlink(item.id!, ref.id)}
            >
              <Icon icon="mingcute:delete-2-line" width="14" height="14" />
            </button>
          </div>
        ))}
        {!store.outgoing.isLoading && !store.outgoing.value?.length && (
          <p className="text-sm text-desc">{t('no-related-items')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-desc">{t('linked-from')}</p>
        {store.incoming.value?.map((ref: any) => (
          <div key={ref.id} className="relative">
            <PlanIncCard planincItem={ref} />
            <button
              type="button"
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-danger shadow hover:bg-danger hover:text-white"
              aria-label={t('remove')}
              title={t('remove')}
              onClick={() => unlink(ref.id, item.id!)}
            >
              <Icon icon="mingcute:delete-2-line" width="14" height="14" />
            </button>
          </div>
        ))}
        {!store.incoming.isLoading && !store.incoming.value?.length && (
          <p className="text-sm text-desc">{t('no-related-items')}</p>
        )}
      </div>
    </ScrollArea>
  </div >
})


export const ShowPlanIncReference = ({ item }: { item: Note }) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    onlyContent: true,
    showOnlyContentCloseButton: true,
    size: '4xl',
    content: <PlanIncReference item={item} />
  })
}
