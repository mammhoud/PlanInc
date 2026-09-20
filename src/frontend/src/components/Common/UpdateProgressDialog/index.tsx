import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { RootStore } from '@/store';

export interface UpdateProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  newVersion?: string;
}

type UpdateStatus = 'checking' | 'downloading' | 'installing' | 'completed' | 'error' | 'idle';

export const UpdateProgressDialog: React.FC<UpdateProgressDialogProps> = ({
  isOpen,
  onClose,
  newVersion
}) => {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const startUpdate = useCallback(async () => {
    try {
      setUpdateStatus('checking');
      setErrorMessage('');

      const updater = await check();
      if (!updater) {
        throw new Error(t('no-update-available'));
      }

      setUpdateStatus('downloading');

      // Start download with progress tracking
      let startTime = Date.now();
      let lastDownloaded = 0;
      let contentLength = 0;

      await updater.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          contentLength = event.data.contentLength;
          setTotalBytes(contentLength);
          startTime = Date.now();
        } else if (event.event === 'Progress' && event.data.chunkLength) {
          const downloaded = lastDownloaded + event.data.chunkLength;
          lastDownloaded = downloaded;
          setDownloadedBytes(downloaded);

          if (contentLength > 0) {
            setDownloadProgress((downloaded / contentLength) * 100);
          }

          // Calculate download speed
          const timeElapsed = (Date.now() - startTime) / 1000;
          if (timeElapsed > 0) {
            setDownloadSpeed(downloaded / timeElapsed);
          }
        }
      });

      setUpdateStatus('installing');

      // Small delay to show installing state
      await new Promise(resolve => setTimeout(resolve, 1000));

      setUpdateStatus('completed');

    } catch (error) {
      console.error('Update failed:', error);
      setUpdateStatus('error');
      setErrorMessage(error instanceof Error ? error.message : t('update-failed'));
      RootStore.Get(ToastPlugin).error(t('update-failed'));
    }
  }, [t]);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (error) {
      console.error('Failed to restart app:', error);
      RootStore.Get(ToastPlugin).error(t('restart-failed'));
    }
  }, [t]);

  const retryUpdate = useCallback(() => {
    setUpdateStatus('idle');
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setDownloadSpeed(0);
    setErrorMessage('');
    startUpdate();
  }, [startUpdate]);

  const handleClose = useCallback(() => {
    if (updateStatus === 'downloading' || updateStatus === 'installing') {
      return; // Don't allow closing during critical operations
    }
    onClose();
  }, [updateStatus, onClose]);

  // Auto-start update when dialog opens
  React.useEffect(() => {
    if (isOpen && updateStatus === 'idle') {
      startUpdate();
    }
  }, [isOpen, updateStatus, startUpdate]);

  const getStatusIcon = () => {
    switch (updateStatus) {
      case 'downloading':
        return <Icon icon="mdi:download" className="animate-bounce" width="24" height="24" />;
      case 'installing':
        return <Icon icon="mdi:cog" className="animate-spin" width="24" height="24" />;
      case 'completed':
        return <Icon icon="mdi:check-circle" width="24" height="24" className="text-success" />;
      case 'error':
        return <Icon icon="mdi:alert-circle" width="24" height="24" className="text-danger" />;
      default:
        return <Icon icon="mdi:update" width="24" height="24" />;
    }
  };

  const getStatusText = () => {
    switch (updateStatus) {
      case 'checking':
        return t('checking-for-updates');
      case 'downloading':
        return t('downloading-update');
      case 'installing':
        return t('installing-update');
      case 'completed':
        return t('update-completed');
      case 'error':
        return t('update-failed');
      default:
        return t('preparing-update');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader className="flex flex-row items-center gap-2">
          {getStatusIcon()}
          <DialogTitle>{t('app-update')}</DialogTitle>
        </DialogHeader>
        <div className="pb-6">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-default-600 mb-2">{getStatusText()}</p>
              {newVersion && (
                <p className="text-xs text-default-500">
                  {t('updating-to-version')}: v{newVersion}
                </p>
              )}
            </div>

            {updateStatus === 'downloading' && (
              <div className="space-y-3">
                <div className="w-full max-w-md">
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span>{getStatusText()}</span>
                    <span className="text-foreground/60">{downloadProgress.toFixed(1)}%</span>
                  </div>
                  <Progress
                    value={downloadProgress}
                    className="max-w-md"
                  />
                </div>

                {downloadedBytes > 0 && totalBytes > 0 && (
                  <div className="flex justify-between text-xs text-default-500">
                    <span>
                      {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                    </span>
                    {downloadSpeed > 0 && (
                      <span>{formatSpeed(downloadSpeed)}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {updateStatus === 'installing' && (
              <div className="flex justify-center max-w-md">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}


            {updateStatus === 'error' && (
              <div className="text-center space-y-3">
                <div className="text-danger">
                  <Icon icon="mdi:alert-circle" width="48" height="48" className="mx-auto" />
                </div>
                <p className="text-sm text-default-600">
                  {errorMessage || t('update-failed-generic')}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={retryUpdate}
                    className="flex-1"
                  >
                    <Icon icon="mdi:refresh" width="16" height="16" />
                    {t('retry')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    className="flex-1"
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};