
import { PlanIncStore } from '@/store/planincStore';
import { _ } from '@/lib/lodash';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEffect } from 'react';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import i18n from '@/lib/i18n';


type IProps = {
  defaultValue?: string,
  type?: 'input' | 'select',
  onSave?: (tagName: string) => Promise<any>
}

export const UpdateTag = observer(({ onSave, defaultValue = '', type = 'input' }: IProps) => {
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    tagName: '',
    isSaving: false
  }))
  useEffect(() => {
    store.tagName = defaultValue
  }, [defaultValue])

  const save = async () => {
    if (store.isSaving) return
    store.isSaving = true
    try {
      await onSave?.(store.tagName)
      RootStore.Get(DialogStore).close()
    } catch (error) {
      RootStore.Get(ToastPlugin).error((error as Error)?.message || i18n.t('operation-failed'))
    } finally {
      store.isSaving = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }

  return <div className="flex items-center gap-2 pb-4">
    {
      type == 'input' ? <Input autoFocus value={store.tagName} onChange={e => store.tagName = (e.target.value)} onKeyDown={handleKeyDown} disabled={store.isSaving} />
        : <div className="max-w-xs w-full space-y-1.5">
          <Label>{i18n.t('select-a-tag') || 'Select a tag'}</Label>
          <Select
            value={store.tagName}
            onValueChange={value => store.tagName = value}
          >
            <SelectTrigger>
              <SelectValue placeholder={i18n.t('select-a-tag') || 'Select a tag'} />
            </SelectTrigger>
            <SelectContent>
              {(planinc.tagList.value?.pathTags as string[]).map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
    }

    <Button style={{ width: '40px' }} loading={store.isSaving} disabled={store.isSaving} onClick={save}>{i18n.t('save')}</Button>
  </div>
})

export const ShowUpdateTagDialog = ({ onSave, defaultValue, type }: IProps) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    title: i18n.t('update-tag-name'),
    content: <UpdateTag type={type} defaultValue={defaultValue} onSave={async (e) => { return await onSave?.(e) }} />
  })
}
