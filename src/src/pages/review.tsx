import { useEffect, useRef } from 'react';
import { Swiper, SwiperSlide, } from "swiper/react";
import "swiper/css";
import "swiper/css/effect-cards";
import { EffectCards, Virtual } from 'swiper/modules';
import 'swiper/css/virtual';
import '../styles/swiper-cards.css';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@heroui/react';
import { LightningIcon, NotesIcon } from '@/components/Common/Icons';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import confetti from 'canvas-confetti';
import { FilesAttachmentRender } from '@/components/Common/AttachmentRender';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { PlanIncCard } from '@/components/PlanIncCard';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { useSideNav } from '@/platform/PlatformProvider';
const App = observer(() => {
  const planinc = RootStore.Get(PlanIncStore)
  const swiperRef = useRef(null);
  // The completion celebration is a *moment*, not a state. Without this latch
  // the effect re-fired on every dependency change while the queue was empty —
  // including the initial render before the review list had finished loading —
  // so the confetti burst repeatedly instead of once.
  const hasCelebrated = useRef(false);
  const { t } = useTranslation()
  const isPc = useSideNav()
  const store = RootStore.Local(() => ({
    currentIndex: 0,
    get currentNote() {
      return store.isRandomReviewMode
        ? planinc.randomReviewNoteList.value?.[store.currentIndex] ?? null
        : planinc.dailyReviewNoteList.value?.[store.currentIndex] ?? null
    },
    handleSlideChange: async (_swiper) => {
      store.currentIndex = _swiper.activeIndex
    },
    isRandomReviewMode: false,
    get isPlanInc() {
      return store.currentNote?.type == NoteType.PLANINC
    }
  }))

  useEffect(() => {
    planinc.reviewStats.call();
  }, []);

  useEffect(() => {
    // Reset the latch when leaving daily mode so a later return can celebrate
    // again; only daily mode celebrates. Wait for the first load to settle so
    // an empty pre-load list cannot look like a finished queue.
    if (store.isRandomReviewMode) {
      hasCelebrated.current = false
      return
    }
    if (planinc.dailyReviewNoteList.isLoading) return
    if (hasCelebrated.current) return
    if (planinc.dailyReviewNoteList.value?.length != 0) return
    hasCelebrated.current = true
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6, x: isPc ? 0.6 : 0.5 }
    });
  }, [planinc.dailyReviewNoteList.value, planinc.dailyReviewNoteList.isLoading, store.isRandomReviewMode])

  const reviewNotes = store.isRandomReviewMode
    ? planinc.randomReviewNoteList.value ?? []
    : planinc.dailyReviewNoteList.value ?? []

  return (
    <ScrollArea fixMobileTopBar className="App h-full overflow-hidden mt-2">
      <div className="flex justify-center mb-2">
        <Button
          color={store.isRandomReviewMode ? "primary" : "default"}
          variant={store.isRandomReviewMode ? "solid" : "flat"}
          className="text-sm"
          startContent={<Icon icon="tabler:cards" width="16" height="16" />}
          onPress={() => {
            store.isRandomReviewMode = !store.isRandomReviewMode
            if (store.isRandomReviewMode) {
              planinc.randomReviewNoteList.call({ limit: 30 })
            } else {
              planinc.dailyReviewNoteList.call()
            }
          }}
        >
          {t('random-mode')}
        </Button>
        {store.isRandomReviewMode && (
          <Button
            className="ml-2 text-sm"
            isIconOnly
            onPress={() => {
              planinc.randomReviewNoteList.call({ limit: 30 });
            }}
          >
            <Icon icon="fluent:arrow-sync-24-filled" width="16" height="16" className="hover:rotate-180 !transition-all" />
          </Button>
        )}
      </div>

      {/* Review habit strip (R1): reviewed-today, streak, queue progress.
          Labels reuse existing i18n keys only (parity rule); the streak is
          an icon + number like the kanban counts. */}
      <div className="flex justify-center items-center gap-4 mb-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <LightningIcon />
          {planinc.reviewStats.value?.streakDays ?? 0}
        </span>
        <span>
          {t('reviewed')} {t('today')}: {planinc.reviewStats.value?.reviewedToday ?? 0}
        </span>
        <span>
          {t('done')} {planinc.reviewStats.value?.reviewedToday ?? 0}
          {' / '}
          {t('total')} {(planinc.reviewStats.value?.reviewedToday ?? 0) + (planinc.reviewStats.value?.queueSize ?? 0)}
        </span>
      </div>

      {
        reviewNotes.length != 0 && <>
          <Swiper
            onSwiper={(swiper) => {
              //@ts-ignore
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => store.handleSlideChange(swiper)}
            effect={"cards"}
            grabCursor={true}
            modules={[EffectCards, Virtual]}
            // A fixed 300px card overflowed a 320px viewport; the width is now
            // capped by the viewport below the md tier and fixed above it.
            className="mt-5 md:mt-4 w-[min(300px,90vw)] h-[calc(100vh_-_300px)] md:w-[550px] "
            allowSlideNext={true}
            allowSlidePrev={true}
            touchRatio={1}
            resistance={true}
            resistanceRatio={0.5}
            centeredSlides={true}
            virtual={{
              enabled: true,
              slides: reviewNotes,
              cache: true,
              addSlidesBefore: 1,
              addSlidesAfter: 1,
            }}
          >
            {
              reviewNotes.map((i, index) => (
                <SwiperSlide key={i.id} virtualIndex={index} data-id={i.id} className='bg-background shadow-lg p-4 w-full overflow-hidden h-full'>
                  <div className='bg-background p-0 w-full overflow-y-scroll h-full'>
                    <div className='flex items-center gap-2 mb-2'>
                      <div className='text-xs text-desc'>{dayjs(i.createdAt).fromNow()}</div>
                      {
                        store.isPlanInc ?
                          <div className='flex items-center justify-start ml-auto'>
                            <Icon className='text-yellow-500' icon="basil:lightning-solid" width="12" height="12" />
                            <div className='text-desc text-xs font-bold ml-1'>{t('type-plan')}</div>
                          </div> :
                          <div className='flex items-center justify-start  ml-auto'>
                            <Icon className='text-blue-500' icon="solar:notes-minimalistic-bold-duotone" width="12" height="12" />
                            <div className='text-desc text-xs font-bold ml-1'>{t('note')}</div>
                          </div>
                      }
                    </div>
                    <MarkdownRender content={i.content} onChange={(newContent) => {
                      i.content = newContent
                      planinc.upsertNote.call({ id: i.id, content: newContent, refresh: false })
                    }} />
                    <div className={i.attachments?.length != 0 ? 'my-2' : ''}>
                      <FilesAttachmentRender columns={2} files={i.attachments ?? []} preview />
                    </div>
                  </div>
                </SwiperSlide>
              ))
            }
          </Swiper>

          <div className="mt-8 flex items-center justify-center px-6 gap-4">
            {
              !store.isRandomReviewMode &&
              <Tooltip content={t('reviewed')}>
                <Button onPress={async e => {
                  if (!store.currentNote) return
                  await PromiseCall(api.notes.reviewNote.mutate({ id: store.currentNote!.id! }))
                  planinc.dailyReviewNoteList.call()
                  planinc.reviewStats.call()
                }} isIconOnly color='primary' startContent={<Icon icon="ci:check-all" width="24" height="24" />} />
              </Tooltip>
            }
            <Tooltip content={store.isPlanInc ? t('convert-to-note') : t('convert-to-planinc')}>
              <Button isIconOnly onPress={async e => {
                if (!store.currentNote) return
                await planinc.upsertNote.call({ id: store.currentNote.id, type: store.isPlanInc ? NoteType.NOTE : NoteType.PLANINC })
                await api.notes.reviewNote.mutate({ id: store.currentNote!.id! })
                await planinc.dailyReviewNoteList.call()
                planinc.reviewStats.call()
              }}
                color='default'
                startContent={store.isPlanInc ? <NotesIcon /> : <LightningIcon />}>
              </Button>
            </Tooltip>

            <Tooltip content={t('edit')} >
              <Button onPress={async e => {
                if (!store.currentNote) return
                const note = await api.notes.detail.mutate({ id:  store.currentNote.id! })
                RootStore.Get(DialogStandaloneStore).setData({
                  isOpen: true,
                  onlyContent: true,
                  showOnlyContentCloseButton: true,
                  size: '4xl',
                  content: <PlanIncCard planincItem={note!} withoutHoverAnimation />
                })
              }} isIconOnly color='default' startContent={<Icon icon="tabler:edit" width="20" height="20" />}></Button>
            </Tooltip>


            <Tooltip content={t('archive')} >
              <Button onPress={async e => {
                if (!store.currentNote) return
                await planinc.upsertNote.call({ id: store.currentNote.id, isArchived: true })
                await planinc.dailyReviewNoteList.call()
              }} isIconOnly color='default' startContent={<Icon icon="eva:archive-outline" width="20" height="20" />}></Button>
            </Tooltip>

            <Button
              onPress={async e => {
                if (!store.currentNote) return
                showTipsDialog({
                  title: t('confirm-to-delete'),
                  content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
                  onConfirm: async () => {
                    await api.notes.deleteMany.mutate({ ids: [store.currentNote!.id!] })
                    await planinc.dailyReviewNoteList.call()
                    RootStore.Get(DialogStandaloneStore).close()
                  }
                })
              }} isIconOnly color='danger' startContent={<Icon icon="mingcute:delete-2-line" width="20" height="20" />}></Button>
          </div>
        </>
      }

      {reviewNotes.length == 0 && <div className='select-none text-ignore flex items-center justify-center gap-2 w-full mt-2 md:mt-10'>
        <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
        <div className='text-md text-ignore font-bold'>{t('congratulations-youve-reviewed-everything-today')}</div>
      </div>}
    </ScrollArea>

  );
})

export default App;
