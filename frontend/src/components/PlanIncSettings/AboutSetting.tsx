// planinc.public.value?.version

import { observer } from "mobx-react-lite";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RootStore } from "@/store";
import { PromiseState } from "@/store/standard/PromiseState";
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { Item } from "./Item";
import { useEffect, useState } from "react";
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";
import packageJson from '../../../src-tauri/tauri.conf.json';
import { isDesktop, isInTauri } from "@/lib/tauriHelper";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { UpdateProgressDialog } from "@/components/Common/UpdateProgressDialog";


export const AboutSetting = observer(() => {
  const { t } = useTranslation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const store = RootStore.Local(() => ({
    serverVersion: new PromiseState({
      function: async () => {
        return await api.public.serverVersion.query()
      }
    }),
    latestServerVersion: new PromiseState({
      function: async () => {
        return await api.public.latestServerVersion.query()
      }
    }),
    latestClientVersion: new PromiseState({
      function: async () => {
        return await api.public.latestClientVersion.query()
      }
    })
  }))

  useEffect(() => {
    store.serverVersion.call()
    store.latestServerVersion.call()
    store.latestClientVersion.call()
  }, [])

  const clearBrowserCache = async () => {
    try {
      // Clear service worker caches (disk cache)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }

      // Unregister all service workers to clear their cache
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(registration => registration.unregister())
        );
      }

      RootStore.Get(ToastPlugin).success(t('cache-cleared-successfully'));

      // Force hard reload (bypass cache) similar to Ctrl+Shift+R
      setTimeout(() => {
        // Method 1: Use location.reload with force flag (deprecated but still works in some browsers)
        try {
          // @ts-ignore - force parameter is deprecated but still functional
          window.location.reload(true);
        } catch {
          // Method 2: Fallback - reload with cache busting timestamp
          const url = new URL(window.location.href);
          url.searchParams.set('_cache_bust', Date.now().toString());
          window.location.href = url.toString();
        }
      }, 1000);

    } catch (error) {
      console.error('Failed to clear cache:', error);
      RootStore.Get(ToastPlugin).error(t('failed-to-clear-cache'));
    }
  };

  return (
    <CollapsibleCard
      icon="tabler:info-circle"
      title={t('about')}
    >
      <div className="flex items-start space-x-4 mb-6">
        <img src="/logo.png" alt="PlanInc" className="w-16 h-16 rounded-xl" />
        <div>
          <h2 className="text-xl font-semibold">PlanInc</h2>
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="warning"
                className="text-xs gap-1"
              >
                <Icon icon="mingcute:version-fill" width="16" height="16" />
                {t('server')}: v{store.serverVersion.value}
              </Badge>
              {store.latestServerVersion.value != '' && store.latestServerVersion.value != store.serverVersion.value && (
                <Badge
                  className="cursor-pointer bg-gradient-to-br from-secondary to-tag border border-white/50 shadow-secondary/30 text-white drop-shadow"
                  onClick={() => {
                    window.open(`https://hub.docker.com/r/mammhoud/planinc/tags`, '_blank')
                  }}
                >
                  {t('new-server-version-available')}: v{store.latestServerVersion.value}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {
                isInTauri() && <Badge
                  variant="default"
                  className="text-xs gap-1"
                >
                  <Icon icon="mingcute:version-fill" width="16" height="16" />
                  {t('client')}: v{packageJson.version}
                </Badge>
              }

              {store.latestClientVersion.value != '' && store.latestClientVersion.value != packageJson.version && (
                <Badge
                  className="cursor-pointer bg-gradient-to-br from-secondary to-tag border border-white/50 shadow-secondary/30 text-white drop-shadow"
                  onClick={async () => {
                    if (!isDesktop()) {
                      window.open(`https://github.com/mammhoud/planinc/releases`, '_blank')
                    } else {
                      setShowUpdateDialog(true);
                    }
                  }}
                >
                  {t('new-client-version-available')}: v{store.latestClientVersion.value}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-desc mb-2">{t('community')}</h3>
        <Item
          leftContent={<>GitHub</>}
          rightContent={
            <a
              href="https://github.com/mammhoud/planinc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:github" width="20" />
              mammhoud/planinc
            </a>
          }
        />
        <Item
          leftContent={<>Discord</>}
          rightContent={
            <a
              href="https://discord.gg/e5UdKX7w"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:discord" width="20" />
              PlanInc Community
            </a>
          }
        />
        <Item
          leftContent={<>Telegram</>}
          rightContent={
            <a
              href="https://t.me/planincEnglish"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:telegram" width="20" />
              @planinc
            </a>
          }
        />

      </div>

      <div className="space-y-4 mt-6">
        <h3 className="font-medium text-desc mb-2">{t('maintenance')}</h3>
        <Item
          leftContent={<>{t('clear-browser-cache')}</>}
          rightContent={
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-600 hover:text-amber-600"
              onClick={clearBrowserCache}
            >
              <Icon icon="mdi:cached" width="16" />
              {t('clear-cache')}
            </Button>
          }
        />
      </div>

      <UpdateProgressDialog
        isOpen={showUpdateDialog}
        onClose={() => setShowUpdateDialog(false)}
        newVersion={store.latestClientVersion.value}
      />
    </CollapsibleCard>
  );
});
