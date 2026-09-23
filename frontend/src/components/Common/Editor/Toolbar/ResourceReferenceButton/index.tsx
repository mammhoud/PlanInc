import { Icon } from '@/components/Common/Iconify/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { observer } from 'mobx-react-lite';
import { IconButton } from '../IconButton';
import { ScrollArea } from '../../../ScrollArea';
import { PlanIncStore } from '@/store/planincStore';
import { RootStore } from '@/store';
import { EditorStore } from '../../editorStore';
import { useEffect, useState } from 'react';
import { helper } from '@/lib/helper';
import { ResourceType } from '@/lib/apiTypes';
import { PromiseState } from '@/store/standard/PromiseState';
import { PhotoProvider } from 'react-photo-view';
import { useTranslation } from 'react-i18next';
import { ResourceItemPreview } from '@/components/PlanIncResource/ResourceItem';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';

interface Props {
  store: EditorStore;
}

export const ResourceReferenceButton = observer(({ store }: Props) => {
  const planinc = RootStore.Get(PlanIncStore);
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      planinc.resourceList.resetAndCall({ folder: undefined });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && searchText) {
      planinc.resourceList.resetAndCall({ searchText, folder: undefined });
    }
  }, [searchText, isOpen]);

  const handleSelect = async (attachment: ResourceType) => {
    // Check if this attachment is already in the files list
    if (store.files.some((file) => file.name === attachment.name)) return;

    const extension = helper.getFileExtension(attachment.name) as string;
    const previewType = helper.getFileType(attachment.type as string, attachment.name);

    // Create a FileType object from the attachment
    console.log('attachment', attachment);
    const file: any = {
      name: attachment.name,
      size: Number(attachment.size),
      previewType,
      extension,
      uploadPromise: new PromiseState({
        function: async () => {
          return attachment.path;
        },
      }),
      preview: attachment.path,
      type: attachment.type!,
    };
    await file.uploadPromise.call();
    // Add to files array
    store.files.push(file);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className="hover:bg-default-100 rounded-md">
          <IconButton icon="hugeicons:file-link" tooltip={t('referenceResource')} />
        </div>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-[300px] sm:w-[300px]">
        <div className="p-1 w-full">
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <Icon icon="mdi:magnify" width={20} height={20} />
            </span>
            <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={t('search')} className="mb-2 pl-9" />
          </div>
          <ScrollArea
            className="h-[300px] "
            onBottom={() => {
              planinc.resourceList.callNextPage({});
            }}
          >
            <LoadingAndEmpty isLoading={planinc.resourceList.loading.value} isEmpty={planinc.resourceList.value?.length === 0} />
            <PhotoProvider>
              <div className="space-y-2 w-full">
                {planinc.resourceList.value?.map((attachment) => (
                  <ResourceItemPreview key={attachment.id} item={attachment} onClick={() => handleSelect(attachment)} showExtraInfo={true} showAssociationIcon={true} />
                ))}
              </div>
            </PhotoProvider>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
});
