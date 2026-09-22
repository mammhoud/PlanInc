import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Icon } from '@/components/Common/Iconify/icons';
import { useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { PlanIncStore } from "@/store/planincStore";
import { observer } from "mobx-react-lite";
import { getPlanIncEndpoint } from "@/lib/planincEndpoint";
import axiosInstance from "@/lib/axios";
type IProps = {
  onUpload?: ({ filePath, fileName }) => void
  children?: React.ReactNode
  acceptImage?: boolean
  destinationFolder?: string
}

export const UploadFileWrapper = observer(({ onUpload, children, acceptImage = false, destinationFolder }: IProps) => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const planinc = RootStore.Get(PlanIncStore)
  const {
    getRootProps,
    getInputProps,
    open
  } = useDropzone({
    multiple: false,
    noClick: true,
    accept: acceptImage ? {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    } : undefined,
    onDrop: async acceptedFiles => {
      setIsLoading(true)
      try {
        const file = acceptedFiles[0]!
        const formData = new FormData();
        formData.append('file', file)
        if (destinationFolder) formData.append('destinationFolder', destinationFolder)

        const { onUploadProgress } = RootStore.Get(ToastPlugin)
          .setSizeThreshold(40)
          .uploadProgress(file);

        const response = await axiosInstance.post(getPlanIncEndpoint('/api/file/upload'), formData, {
          onUploadProgress
        });

        onUpload?.(response.data)
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setIsLoading(false)
      }
    }
  });

  return <div {...getRootProps()}>
    <input {...getInputProps()} />
    {children ?
      <div onClick={open}>{children}</div>
      : <Button
        disabled={planinc.config.value?.objectStorage === 's3'}
        onClick={open}
        loading={isLoading}
      >
        <Icon icon="tabler:upload" width="24" height="24" />
        {t('upload')}
      </Button>}
  </div>
})
