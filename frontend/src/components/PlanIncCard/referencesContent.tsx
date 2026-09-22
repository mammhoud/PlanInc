import { api } from "@/lib/trpc"
import { PlanIncItem } from "./index"
import { RootStore } from "@/store"
import { DialogStandaloneStore } from "@/store/module/DialogStandalone"
import { PlanIncCard } from "./index"
import { getDisplayTime } from "@/lib/helper"
import { Icon } from '@/components/Common/Iconify/icons'
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useTranslation } from "react-i18next"

export const ReferencesContent = ({ planincItem, className }: { planincItem: PlanIncItem, className?: string }) => {
  const { t } = useTranslation()
  if (!planincItem.references || planincItem.references?.length == 0 && (!planincItem.referencedBy || planincItem.referencedBy?.length == 0)) return null
  return <div className={cn('flex flex-col gap-2', className)}>
    {planincItem.references?.map(item => {
      return <div key={item.toNoteId} className='planinc-reference flex flex-col gap-1 rounded-md !p-2' onClick={async (e) => {
        e.stopPropagation()
        const note = await api.notes.detail.mutate({ id: item.toNoteId! })
        RootStore.Get(DialogStandaloneStore).setData({
          isOpen: true,
          onlyContent: true,
          showOnlyContentCloseButton: true,
          size: '4xl',
          content: <PlanIncCard planincItem={note!} withoutHoverAnimation />
        })
      }}>
        <div className='text-desc text-xs ml-1 select-none flex'>
          {getDisplayTime(item.toNote?.createdAt, item.toNote?.updatedAt)}
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <span className="ml-auto inline-flex">
                <Icon icon="iconamoon:arrow-top-right-1" className='text-primary' width="16" height="16" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('reference')}</TooltipContent>
          </Tooltip>
        </div>
        <div className='text-default-700 text-xs font-bold ml-1 select-none line-clamp-3 '>{item.toNote?.content}</div>
      </div>
    })}

    {planincItem.referencedBy?.map(item => {
      return <div key={item.fromNoteId} className='planinc-reference flex flex-col gap-1 rounded-md !p-2' onClick={async (e) => {
        e.stopPropagation()
        const note = await api.notes.detail.mutate({ id: item.fromNoteId! })
        RootStore.Get(DialogStandaloneStore).setData({
          isOpen: true,
          onlyContent: true,
          showOnlyContentCloseButton: true,
          size: '4xl',
          content: <PlanIncCard planincItem={note!} withoutHoverAnimation />
        })
      }}>
        <div className='text-desc text-xs ml-1 select-none flex'>
          {getDisplayTime(item.fromNote?.createdAt, item.fromNote?.updatedAt)}
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <span className="ml-auto inline-flex">
                <Icon icon="iconamoon:arrow-top-right-1" className='text-primary rotate-180' width="16" height="16" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('reference-by')}</TooltipContent>
          </Tooltip>

        </div>
        <div className='text-default-700 text-xs font-bold ml-1 select-none line-clamp-3 '>{item.fromNote?.content}</div>
      </div>
    })}
  </div>
}