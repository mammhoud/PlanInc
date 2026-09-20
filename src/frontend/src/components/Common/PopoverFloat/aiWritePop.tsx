import { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import PopoverFloat from '.';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { PlanIncStore } from '@/store/planincStore';
import { Icon } from '@/components/Common/Iconify/icons';
import { SendIcon } from '../Icons';
import { MarkdownRender } from '../MarkdownRender';
import { ScrollArea, ScrollAreaHandles } from '../ScrollArea';
import ReactDOM from 'react-dom';
import { useSideNav } from '@/platform/PlatformProvider';

export const showAiWriteSuggestions = () => {
  setTimeout(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      eventBus.emit('aiwrite:update', { rect })
    }
  })
}

const AiWritePop = observer(() => {
  const { t } = useTranslation()
  const isPc = useSideNav()
  const ai = RootStore.Get(AiStore)
  const scrollRef = useRef<ScrollAreaHandles>(null)
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    rect: null as DOMRect | null,
    show: false,
    hidden() {
      store.show = false
    },

    setData(args: { rect: DOMRect }) {
      store.rect = args.rect
      store.show = true
    },

    async handleSubmit() {
      if (!ai.writeQuestion.trim()) return
      try {
        ai.writeStream('custom', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content)
      } catch (error) {
        console.error('error:', error)
      } finally {
      }
    }
  }))

  useEffect(() => {
    eventBus.on('aiwrite:update', store.setData)
    eventBus.on('aiwrite:hidden', store.hidden)

    return () => {
      eventBus.off('aiwrite:update', store.setData)
      eventBus.off('aiwrite:hidden', store.hidden)
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollToBottom()
  }, [ai.writingResponseText])

  const isInsideDialog = () => {
    if (!store.rect) return false;
    const dialogElement = document.querySelector('.modal-content');
    if (!dialogElement) return false;
    
    const dialogRect = dialogElement.getBoundingClientRect();
    return (
      store.rect.top >= dialogRect.top &&
      store.rect.bottom <= dialogRect.bottom &&
      store.rect.left >= dialogRect.left &&
      store.rect.right <= dialogRect.right
    );
  };

  const renderPopover = () => {
    const popover = (
      <PopoverFloat
        show={store.show}
        onHide={store.hidden}
        anchorRect={store.rect}
        maxWidth={isPc ? 700 : 400}
        maxHeight={isPc ? 600 : 400}
        closeOnClickOutside={false}
      >
        <div className="flex flex-col gap-3 min-w-[300px]">
          <div className="flex gap-2">
            <div className="relative w-full">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary pointer-events-none">
                <Icon className='text-primary' icon="hugeicons:ai-beautify" width="16" height="16" />
              </span>
              <Input
                className='border-none pl-9 pr-9'
                value={ai.writeQuestion}
                onChange={(e) => ai.writeQuestion = e.target.value}
                placeholder={'Prompt...'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    store.handleSubmit()
                  }
                }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                {ai.isLoading ?
                  <Icon icon="mingcute:loading-line" width="16" height="16" /> :
                  <SendIcon onClick={store.handleSubmit} className='cursor-pointer primary-foreground group-hover:rotate-[-35deg] !transition-all' />}
              </span>
            </div>
          </div>
          {
            ai.writingResponseText != '' && <ScrollArea ref={scrollRef} className='p-2 max-h-[200px]' onBottom={() => { }}>
              {ai.isLoading ? <div className='text-sm'>{ai.writingResponseText}</div> : <MarkdownRender content={ai.writingResponseText} />}
            </ScrollArea>
          }
          {ai.isWriting && (
            <div id='ai-write-suggestions' className='flex gap-2 items-center'>
              <Button onClick={() => {
                ai.isWriting = false;
                eventBus.emit('editor:insert', ai.writingResponseText)
                ai.writingResponseText = ''
                store.hidden()
              }} size='sm' variant='secondary'><Icon icon="ic:sharp-check" className='green' />{t('accept')}</Button>
              <Button onClick={() => {
                ai.isWriting = false;
                ai.writingResponseText = ''
                store.hidden()
              }} size='sm' variant='destructive'><Icon icon="ic:sharp-close" className='red' />{t('reject')}</Button>
              <Button onClick={() => {
                ai.abortAiWrite();
              }} size='sm' variant='secondary'><Icon icon="mynaui:stop" className='planinc' />{t('stop')} </Button>
            </div>
          )}

          <div className='flex items-center gap-2'>
            <Button variant='ghost' size='sm' onClick={e => {
              ai.writeStream('expand', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content)
              // store.hidden()
            }}><Icon icon="proicons:text-expand" width="16" height="16" />{t('ai-expand')}</Button>
            <Button variant='ghost' size='sm' onClick={e => {
              ai.writeStream('polish', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content)
              // store.hidden()
            }}><Icon icon="lucide:scan-text" width="16" height="16" />{t('ai-polish')}</Button>
            <Button className='ml-auto' loading={ai.isLoading} size='icon-sm' onClick={e => {
              store.hidden()
            }}>
              <Icon icon="ic:sharp-close" />
            </Button>
          </div>
        </div>
      </PopoverFloat>
    );

    if (isInsideDialog()) {
      return ReactDOM.createPortal(
        popover,
        document.querySelector('.modal-content')!
      );
    }

    return ReactDOM.createPortal(
      popover,
      document.body
    );
  };

  return renderPopover();
});

export default AiWritePop;