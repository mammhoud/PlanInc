import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { EditorStore } from '../../editorStore';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { PlanIncStore } from '@/store/planincStore';
import { RootStore } from '@/store/root';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useSideNav } from '@/platform/PlatformProvider';

interface Props {
  store: EditorStore;
  content: string;
}

export const HashtagButton = observer(({ store, content }: Props) => {
  const { t } = useTranslation();
  const isPc = useSideNav()
  const planinc = RootStore.Get(PlanIncStore)
  const localStore = RootStore.Local(() => ({
    show: false,
    setShow: (show: boolean) => {
      localStore.show = show
    },
    isSearchMode: true,
    searchText: '',
    selectedIndex: 0,
    get tagList() {
      if (!localStore.searchText) {
        return planinc.tagList?.value?.pathTags
      }
      return planinc.tagList?.value?.pathTags.filter(i =>
        i.toLowerCase().includes(localStore.searchText.toLowerCase().replace("#", ''))
      )
    },
  }))

  useEffect(() => {
    localStore.searchText = ''
  }, [])

  return (
    <Popover
      open={localStore.show}
      onOpenChange={localStore.setShow}
    >
      <PopoverTrigger asChild>
        <div
          onClick={e => {
            e.preventDefault()
            e.stopPropagation()
            localStore.setShow(true)
          }}>
          <IconButton
            tooltip={t('insert-hashtag')}
            icon="mingcute:hashtag-line"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className='flex flex-col max-w-[300px] p-2'>
        <ScrollArea className={'max-h-[300px]'} onBottom={() => { }}>
          <Input
            className='mb-2'
            placeholder={t('search-tags')}
            autoFocus
            value={localStore.searchText} onChange={e => {
              localStore.searchText = e.target.value
            }} />

          {localStore.tagList?.map((i, index) => (
            <div
              key={i}
              data-index={index}
              className={`cursor-pointer hover:bg-hover !transition-all px-2 py-1 rounded-lg
            ${index === localStore.selectedIndex ? 'bg-hover' : ''}`}
              onClick={e => {
                localStore.setShow(false)
                store.vditor?.insertValue(`#${i}&nbsp;`, true)
                store.onChange?.(store.vditor?.getValue() ?? '')
                setTimeout(() => {
                  store.focus()
                }, 300)
              }}
            >
              #{i}
            </div>
          ))}
          {localStore.tagList?.length == 0 && (
            <div className='text-ignore font-bold text-sm'>
              {t('no-tag-found')}
            </div>
          )}
        </ScrollArea>

      </PopoverContent>
    </Popover >

  );
}); 