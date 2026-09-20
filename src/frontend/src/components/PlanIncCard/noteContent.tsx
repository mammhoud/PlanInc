import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { FilesAttachmentRender } from "../Common/AttachmentRender";
import { Note } from '@shared/lib/types';
import { PlanIncStore } from '@/store/planincStore';
import { observer } from 'mobx-react-lite';
import { ReferencesContent } from './referencesContent';

interface NoteContentProps {
  planincItem: Note;
  planinc: PlanIncStore;
  isExpanded?: boolean;
  isShareMode?: boolean;
}

export const NoteContent = observer(({ planincItem, planinc, isExpanded, isShareMode }: NoteContentProps) => {
  return (
    <>
      <MarkdownRender
        content={planincItem.content}
        onChange={(newContent) => {
          if (isShareMode) return;
          planincItem.content = newContent
          planinc.upsertNote.call({ id: planincItem.id, content: newContent, refresh: false })
        }}
        isShareMode={isShareMode}
        largeSpacing={isShareMode || isExpanded}
      />
      <ReferencesContent planincItem={planincItem} className={`${isExpanded ? 'my-4' : 'my-2'}`} />
      <div className={planincItem.attachments?.length != 0 ? 'my-2' : ''}>
        <FilesAttachmentRender files={planincItem.attachments ?? []} preview />
      </div>
    </>
  );
});