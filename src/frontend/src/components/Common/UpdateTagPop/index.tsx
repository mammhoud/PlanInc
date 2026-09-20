
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
import i18n from '@/lib/i18n';


type IProps = {
  defaultValue?: string,
  type?: 'input' | 'select',
  onSave?: (tagName: string) => Promise<any>
}

export const UpdateTag = observer(({ onSave, defaultValue = '', type = 'input' }: IProps) => {
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    tagName: ''
  }))
  useEffect(() => {
    store.tagName = defaultValue
  }, [defaultValue])

  return <div className="flex items-center gap-2 pb-4">
    {
      type == 'input' ? <Input value={store.tagName} onChange={e => store.tagName = (e.target.value)} />
        : <div className="max-w-xs w-full space-y-1.5">
          <Label>Select a tag</Label>
          <Select
            value={store.tagName}
            onValueChange={value => store.tagName = value}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a tag" />
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

    <Button style={{ width: '30px' }} onClick={async () => {
      await onSave?.(store.tagName)
      RootStore.Get(DialogStore).close()
    }}>Save</Button>
  </div>
})

export const ShowUpdateTagDialog = ({ onSave, defaultValue, type }: IProps) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    title: i18n.t('update-tag-name'),
    content: <UpdateTag type={type} defaultValue={defaultValue} onSave={async (e) => { return await onSave?.(e) }} />
  })
}
