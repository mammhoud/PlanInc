import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { EditorStore } from '../../editorStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { PlanIncStore } from '@/store/planincStore';
import { RootStore } from '@/store/root';
import { AiStore } from '@/store/aiStore';
import { observer } from 'mobx-react-lite';
import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';
import { SendIcon } from '@/components/Common/Icons';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { eventBus } from '@/lib/event';
import { PluginApiStore } from '@/store/plugin/pluginApiStore';

export const AIWriteButton = observer(() => {
  const { t } = useTranslation();
  const planinc = RootStore.Get(PlanIncStore);
  const ai = RootStore.Get(AiStore);
  const scrollRef = useRef<any>(null);
  const pluginApi = RootStore.Get(PluginApiStore);

  const localStore = RootStore.Local(() => ({
    show: false,
    setShow: (show: boolean) => {
      localStore.show = show;
    },

    async handleSubmit() {
      if (!ai.writeQuestion.trim()) return;
      try {
        ai.writeStream('custom', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content);
      } catch (error) {
        console.error('error:', error);
      }
    }
  }));

  useEffect(() => {
    scrollRef.current?.scrollToBottom();
  }, [ai.writingResponseText]);

  return (
    <Popover
      open={localStore.show}
      onOpenChange={localStore.setShow}
    >
      <PopoverTrigger asChild>
        <div onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          localStore.setShow(true);
        }}>
          <IconButton
            tooltip={t('ai-write')}
            icon="hugeicons:quill-write-01"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className='flex flex-col p-3 bg-background md:max-w-[500px] max-w-[full]'>
        <div className="flex flex-col gap-3 w-full">
          <div className="flex gap-2 items-center">
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
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    localStore.handleSubmit();
                  }
                }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                {ai.isLoading ?
                  <Icon icon="mingcute:loading-line" width="16" height="16" /> :
                  <SendIcon onClick={localStore.handleSubmit} className='cursor-pointer primary-foreground group-hover:rotate-[-35deg] !transition-all' />
                }
              </span>
            </div>

          </div>

          <div className='flex flex-wrap gap-2'>
            {pluginApi.customAiPrompts.map((prompt, index) => (
              <Button
                key={index}
                variant='ghost'
                size='sm'
                onClick={() => {
                  ai.writeQuestion = prompt.prompt;
                  localStore.handleSubmit();
                }}
              >
                {prompt.icon && <Icon icon={prompt.icon} width="16" height="16" />}
                {prompt.name}
              </Button>
            ))}
          </div>

          {ai.writingResponseText && (
            <ScrollArea ref={scrollRef} className='p-2 max-h-[400px] max-w-full w-full max-w-full' onBottom={() => { }}>
              {ai.isLoading ?
                <div className='text-sm'>{ai.writingResponseText}</div> :
                <MarkdownRender content={ai.writingResponseText} />
              }
            </ScrollArea>
          )}

          {ai.isWriting && (
            <div className='flex gap-2 items-center'>
              <Button onClick={() => {
                ai.isWriting = false;
                if (ai.currentWriteType == 'polish') {
                  eventBus.emit('editor:replace', ai.writingResponseText);
                } else {
                  eventBus.emit('editor:insert', ai.writingResponseText);
                }
                ai.writingResponseText = '';
                localStore.setShow(false);
              }}
                size='sm' variant='secondary'><Icon icon="ic:sharp-check" className='green' />{t('accept')}</Button>

              <Button onClick={() => {
                ai.isWriting = false;
                ai.writingResponseText = '';
                localStore.setShow(false);
              }}
                size='sm' variant='destructive'><Icon icon="ic:sharp-close" className='red' />{t('reject')}</Button>

              <Button onClick={() => {
                ai.abortAiWrite();
              }}
                size='sm' variant='secondary'><Icon icon="mynaui:stop" className='planinc' />{t('stop')}</Button>
            </div>
          )}

          <div className='flex items-center gap-2'>
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                ai.writeStream('expand', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content);
              }}
            >
              <Icon icon="proicons:text-expand" width="16" height="16" />
              {t('ai-expand')}
            </Button>

            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                ai.writeStream('polish', planinc.isCreateMode ? planinc.noteContent : planinc.curSelectedNote!.content);
              }}
            >
              <Icon icon="lucide:scan-text" width="16" height="16" />
              {t('ai-polish')}
            </Button>


            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => localStore.setShow(false)}
              className='ml-auto'
            >
              <Icon icon="material-symbols:close" width={16} height={16} />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}); 