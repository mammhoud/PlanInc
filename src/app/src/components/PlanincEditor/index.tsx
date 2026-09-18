import { observer } from "mobx-react-lite"
import Editor from "../Common/Editor"
import { RootStore } from "@/store"
import { PlanIncStore } from "@/store/planincStore"
import dayjs from "@/lib/dayjs"
import { useEffect, useRef } from "react"
import { NoteType } from "@shared/lib/types"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

type IProps = {
  mode: 'create' | 'edit',
  onSended?: () => void,
  onHeightChange?: (height: number) => void,
  height?: number,
  isInDialog?: boolean,
  withoutOutline?: boolean,
  initialData?: { file?: File, text?: string },
  showTopToolbar?: boolean
}

export const PlanIncEditor = observer(({ mode, onSended, onHeightChange, isInDialog, withoutOutline, initialData, showTopToolbar = false }: IProps) => {
  const isCreateMode = mode == 'create'
  const planinc = RootStore.Get(PlanIncStore)
  const editorRef = useRef<any>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()

  const store = RootStore.Local(() => ({
    get noteContent() {
      if (isCreateMode) {
        try {
          const local = planinc.createContentStorage.value
          const planincContent = planinc.noteContent
          return local?.content != '' ? local?.content : planincContent
        } catch (error) {
          return ''
        }
      } else {
        try {
          if (!planinc.curSelectedNote) return '';
          const local = planinc.editContentStorage.list?.find(i => Number(i.id) == Number(planinc.curSelectedNote!.id))
          const planincContent = planinc.curSelectedNote?.content ?? ''
          return local?.content != '' ? (local?.content ?? planincContent) : planincContent
        } catch (error) {
          return ''
        }
      }
    },
    set noteContent(v: string) {
      if (isCreateMode) {
        try {
          planinc.noteContent = v
          planinc.createContentStorage.save({ content: v })
        } catch (error) {
          console.error(error)
        }
      } else {
        try {
          if (!planinc.curSelectedNote) return;
          planinc.curSelectedNote.content = v
          const hasLocal = planinc.editContentStorage.list?.find(i => Number(i.id) == Number(planinc.curSelectedNote!.id))
          if (hasLocal) {
            hasLocal.content = v
            planinc.editContentStorage.save()
          } else {
            planinc.editContentStorage.push({ content: v, id: Number(planinc.curSelectedNote!.id) })
          }
        } catch (error) {
          console.error(error)
        }
      }
    },
    get files(): any {
      if (mode == 'create') {
        const attachments = planinc.createAttachmentsStorage.list
        if (attachments.length) {
          return (attachments)
        } else {
          return []
        }
      } else {
        return planinc.curSelectedNote?.attachments
        // const attachments = planinc.editAttachmentsStorage.list.filter(i => Number(i.id) == Number(planinc.curSelectedNote!.id))
        // if (attachments?.length) {
        //   return attachments
        // } else {
        //   return planinc.curSelectedNote?.attachments
        // }
      }
    }
  }))

  useEffect(() => {
    planinc.isCreateMode = mode == 'create'
    if (mode == 'create') {
      if (isInDialog) {
        document.documentElement.style.setProperty('--min-editor-height', `50vh`)
      }
      const local = planinc.createContentStorage.value
      if (local && local.content != '') {
        planinc.noteContent = local.content
      }
    } else {
      document.documentElement.style.setProperty('--min-editor-height', `unset`)
      try {
        if (!planinc.curSelectedNote) return;
        const local = planinc.editContentStorage.list?.find(i => Number(i.id) == Number(planinc.curSelectedNote!.id))
        if (local && local?.content != '') {
          planinc.curSelectedNote.content = local.content
        }
      } catch (error) {
        console.error(error)
      }
    }
  }, [mode])

  // Use Tauri hotkey hook


  return <div className={`h-full flex flex-col ${withoutOutline ? '' : ''}`} ref={editorRef} id='global-editor' data-tauri-drag-region onClick={() => {
    planinc.isCreateMode = mode == 'create'
  }}>
    <Editor
      mode={mode}
      originFiles={store.files}
      originReference={!isCreateMode ? planinc.curSelectedNote?.references?.map(i => i.toNoteId) : []}
      content={store.noteContent}
      onChange={v => {
        store.noteContent = v
      }}
      withoutOutline={withoutOutline}
      initialData={initialData}
      showTopToolbar={showTopToolbar}
      onHeightChange={() => {
        onHeightChange?.(editorRef.current?.clientHeight ?? 75)
        if (editorRef.current) {
          const editorElement = document.getElementById('global-editor');
          if (editorElement && editorElement.children[0]) {
            //@ts-ignore
            editorElement.__storeInstance = editorElement.children[0].__storeInstance;
          }
        }
      }}
      isSendLoading={planinc.upsertNote.loading.value}
      bottomSlot={
        isCreateMode ? <div className='text-xs text-ignore ml-2'>Drop to upload files</div> :
          planinc.curSelectedNote?.createdAt ? <div className='text-xs text-desc'>{dayjs(planinc.curSelectedNote.createdAt).format("YYYY-MM-DD hh:mm:ss")}</div> : null
      }
      onSend={async ({ files, references, noteType, metadata }) => {
        if (isCreateMode) {
          console.log("createMode", files, references, noteType, metadata)
          //@ts-ignore
          await planinc.upsertNote.call({ type: noteType, references, refresh: false, content: planinc.noteContent, attachments: files.map(i => { return { name: i.name, path: i.uploadPath, size: i.size, type: i.type } }), metadata })
          planinc.createAttachmentsStorage.clear()
          planinc.createContentStorage.clear()
          if (planinc.noteTypeDefault == NoteType.NOTE && searchParams.get('path') != 'notes') {
            await navigate('/?path=notes')
            planinc.forceQuery++
          }
          if (planinc.noteTypeDefault == NoteType.PLANINC && location.pathname != '/') {
            await navigate('/')
            planinc.forceQuery++
          }
          planinc.updateTicker++
        } else {
          if (!planinc.curSelectedNote) return;
          await planinc.upsertNote.call({
            id: planinc.curSelectedNote.id,
            type: noteType,
            //@ts-ignore
            content: planinc.curSelectedNote.content,
            //@ts-ignore
            attachments: files.map(i => { return { name: i.name, path: i.uploadPath, size: i.size, type: i.type } }),
            references,
            metadata,
            refresh: true // Ensure list is refreshed after update
          })
          try {
            const index = planinc.editAttachmentsStorage.list?.findIndex(i => i.id == planinc.curSelectedNote!.id)
            if (index != -1) {
              planinc.editAttachmentsStorage.remove(index)
              planinc.editContentStorage.remove(index)
            }
          } catch (error) {
            console.error(error)
          }
        }
        onSended?.()
      }} />
  </div>
})


