import { observer } from 'mobx-react-lite'
import { PlanIncStore } from '@/store/planincStore'
import { RootStore } from '@/store'
import { EditorStore } from '../../editorStore'
import { useEffect } from 'react'
import { PlanIncSelectNote } from '@/components/Common/PlanIncSelectNote'

interface Props {
  store: EditorStore
}

export const ReferenceButton = observer(({ store }: Props) => {
  const planinc = RootStore.Get(PlanIncStore)
  useEffect(() => {
    planinc.referenceSearchList.resetAndCall({ searchText: ' ' })
  }, [])
  return (
    <PlanIncSelectNote
      onSelect={(item) => {
        if (store.references?.includes(item.id)) return;
        store.addReference(item.id);
      }}
      blackList={store.references}
    />
  )
}) 