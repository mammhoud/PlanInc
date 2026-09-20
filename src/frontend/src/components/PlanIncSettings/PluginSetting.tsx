import { observer } from "mobx-react-lite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { Icon } from '@/components/Common/Iconify/icons';
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { useState, useEffect } from "react";
import { PluginManagerStore } from "@/store/plugin/pluginManagerStore";
import i18n from "@/lib/i18n";
import { type PluginInfo } from "@shared/lib/types";
import { LoadingAndEmpty } from "../Common/LoadingAndEmpty";
import { PromiseCall } from "@/store/standard/PromiseState";
import { I18nString } from "@/store/plugin";
import { PluginRender } from "@/store/plugin/pluginRender";
import { compareVersions } from "@/lib/utils/versionUtils";
import { api } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

interface PluginCardProps {
  name: string;
  version: string;
  displayName?: I18nString;
  description?: I18nString;
  author?: string;
  downloads?: number;
  actionButton: React.ReactNode;
  url?: string;
}

const PluginCard = ({ name, version, displayName, description, author, downloads, actionButton, url }: PluginCardProps) => {
  const { t } = useTranslation();
  return (
    <Card key={name} className="group relative overflow-hidden border shadow-none">
      <div className="absolute inset-0 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 opacity-0 transition-opacity duration-300" />

      <CardContent className="p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold hover:text-primary cursor-pointer" onClick={() => url && window.open(url, '_blank')}>
                      {displayName?.[i18n.language] || displayName?.default}
                    </h3>
                    {url && (
                      <Icon
                        icon="mdi:github"
                        className="text-lg text-muted-foreground hover:text-primary cursor-pointer"
                        onClick={() => window.open(url, '_blank')}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant="success"
                      className="px-2 h-5 text-xs font-medium"
                    >
                      v{version}
                    </Badge>
                    {author && (
                      <span className="text-xs text-muted-foreground">
                        by <span className="text-foreground">{author}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="ml-4">
              {actionButton}
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {description?.[i18n.language] || description?.default}
          </p>

          {!!downloads && downloads > 0 && (
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon icon="mdi:download" className="text-base" />
                <span>{downloads.toLocaleString()} {t('downloads')}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const InstalledPlugins = observer(() => {
  const { t } = useTranslation();
  const pluginManager = RootStore.Get(PluginManagerStore);
  const [loadingPluginName, setLoadingPluginName] = useState<string | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>('0.0.0');
  const [upgradeModal, setUpgradeModal] = useState<{ isOpen: boolean, plugin?: PluginInfo }>({ isOpen: false });

  useEffect(() => {
    pluginManager.loadAllPlugins();

    async function fetchAppVersion() {
      try {
        const version = await api.public.serverVersion.query();
        setCurrentAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    }

    fetchAppVersion();
  }, []);

  const handleUninstall = async (id: number) => {
    await PromiseCall(pluginManager.uninstallPlugin(id));
  };

  const handleUpdate = async (plugin: PluginInfo) => {
    setLoadingPluginName(plugin.name);
    try {
      await PromiseCall(pluginManager.installPlugin(plugin), { autoAlert: true });
      await Promise.all([
        pluginManager.marketplacePlugins.call(),
        pluginManager.installedPlugins.call()
      ]);
    } finally {
      setLoadingPluginName(null);
    }
  };

  const handleUpgrade = () => {
    window.open('https://github.com/mammhoud/planinc/releases', '_blank');
    setUpgradeModal({ isOpen: false });
  };

  const showUpgradeModal = (plugin: PluginInfo) => {
    setUpgradeModal({ isOpen: true, plugin });
  };

  const needsAppUpgrade = (plugin: PluginInfo): boolean => {
    if (!plugin.minAppVersion) return false;

    try {
      return compareVersions(plugin.minAppVersion, currentAppVersion) > 0;
    } catch (error) {
      console.error('Version comparison error:', error);
      return false;
    }
  };

  const allPlugins = pluginManager.marketplacePlugins.value || [];
  const installedPlugins = pluginManager.installedPlugins.value || [];

  return (
    <div className="space-y-2 ">
      <LoadingAndEmpty isAbsolute={false} className='mt-2' isLoading={pluginManager.installedPlugins.loading.value} isEmpty={pluginManager.installedPlugins.value?.length === 0} />
      {installedPlugins.map((plugin) => {
        const metadata = plugin.metadata as {
          name: string;
          version: string;
          displayName: { default: string; zh_CN: string };
          description: { default: string; zh_CN: string };
          withSettingPanel?: boolean;
          minAppVersion?: string;
        };

        const latestPlugin = allPlugins.find(p => p.name === metadata.name);
        const hasUpdate = latestPlugin && latestPlugin.version !== metadata.version;
        const updateRequiresAppUpgrade = latestPlugin && needsAppUpgrade(latestPlugin);

        return (
          <PluginCard
            key={plugin.id}
            {...metadata}
            actionButton={
              <div className="flex gap-2">
                {pluginManager.isIntalledPluginWithSettingPanel(metadata.name) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => {
                      const pluginInstance = pluginManager.getPluginInstanceByName(metadata.name);
                      RootStore.Get(DialogStandaloneStore).setData({
                        isOpen: true,
                        title: t('settings'),
                        size: 'lg',
                        content: <PluginRender content={pluginInstance?.renderSettingPanel!} />
                      });
                    }}
                  >
                    <Icon icon="mdi:cog" width="16" height="16" />
                  </Button>
                )}
                {hasUpdate && (
                  updateRequiresAppUpgrade ? (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9"
                      onClick={() => showUpgradeModal(latestPlugin)}
                      title={t('plugin-requires-app-upgrade')}
                    >
                      <Icon icon="material-symbols:upgrade-rounded" width="16" height="16" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-9 w-9"
                      disabled={loadingPluginName === metadata.name}
                      onClick={() => handleUpdate(latestPlugin)}
                    >
                      {loadingPluginName === metadata.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon icon="material-symbols:upgrade-rounded" width="16" height="16" />
                      )}
                    </Button>
                  )
                )}
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-9 w-9"
                  onClick={() => handleUninstall(plugin.id)}
                >
                  <Icon icon="mdi:trash-can" width="16" height="16" />
                </Button>
              </div>
            }
          />
        );
      })}

      {/* App upgrade modal */}
      <Dialog open={upgradeModal.isOpen} onOpenChange={(open) => { if (!open) setUpgradeModal({ isOpen: false }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('app-upgrade-required')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {upgradeModal.plugin && (
              <div className="flex flex-col gap-2 p-3 bg-muted rounded-md">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('name')}:</span>
                  <span className="font-medium">{upgradeModal.plugin.displayName?.[i18n.language] || upgradeModal.plugin.displayName?.default}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('current-app-version')}:</span>
                  <span className="font-medium">{currentAppVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('required-app-version')}:</span>
                  <span className="font-medium text-amber-500">{upgradeModal.plugin.minAppVersion}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUpgradeModal({ isOpen: false })}>
              {t('cancel')}
            </Button>
            <Button onClick={handleUpgrade}>
              {t('upgrade')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

const AllPlugins = observer(() => {
  const { t } = useTranslation();
  const pluginManager = RootStore.Get(PluginManagerStore);
  const dialog = RootStore.Get(DialogStandaloneStore);
  const [loadingPluginName, setLoadingPluginName] = useState<string | null>(null);
  const [currentAppVersion, setCurrentAppVersion] = useState<string>('0.0.0');
  const [upgradeModal, setUpgradeModal] = useState<{ isOpen: boolean, plugin?: PluginInfo }>({ isOpen: false });

  useEffect(() => {
    async function fetchAppVersion() {
      try {
        const version = await api.public.serverVersion.query();
        setCurrentAppVersion(version);
      } catch (error) {
        console.error('Failed to fetch app version:', error);
      }
    }

    fetchAppVersion();
  }, []);

  const handleInstall = async (plugin: PluginInfo) => {
    setLoadingPluginName(plugin.name);
    try {
      await PromiseCall(pluginManager.installPlugin(plugin), { autoAlert: true });
      pluginManager.loadAllPlugins();
    } finally {
      setLoadingPluginName(null);
    }
  };

  const handleUpgrade = () => {
    window.open('https://github.com/mammhoud/planinc/releases', '_blank');
    setUpgradeModal({ isOpen: false });
  };

  const showUpgradeModal = (plugin: PluginInfo) => {
    setUpgradeModal({ isOpen: true, plugin });
  };

  const needsAppUpgrade = (plugin: PluginInfo): boolean => {
    if (!plugin.minAppVersion) return false;

    try {
      return compareVersions(plugin.minAppVersion, currentAppVersion) > 0;
    } catch (error) {
      console.error('Version comparison error:', error);
      return false;
    }
  };

  const handleInstallFromGithub = () => {
    dialog.setData({
      isOpen: true,
      title: t('install-from-github'),
      size: 'md',
      content: <InstallFromGithubDialog onClose={() => dialog.close()} />
    });
  };

  return (
    <div className="space-y-4 relative">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {t('marketplace-description')}
        </div>
        <Button
          size="sm"
          className="px-4"
          onClick={handleInstallFromGithub}
        >
          <Icon icon="mdi:github" className="text-lg mr-2" />
          {t('install-from-github')}
        </Button>
      </div>

      <LoadingAndEmpty isAbsolute={false} isLoading={pluginManager.marketplacePlugins.loading.value} isEmpty={pluginManager.marketplacePlugins.value?.length === 0} />

      {pluginManager.marketplacePlugins.value?.filter(plugin => !pluginManager.installedPlugins.value?.some(installedPlugin => installedPlugin.metadata.name === plugin.name)).map((plugin) => (
        <PluginCard
          key={plugin.name}
          {...plugin}
          actionButton={
            needsAppUpgrade(plugin) ? (
              <Button
                size="sm"
                variant="secondary"
                className="min-w-[80px]"
                onClick={() => showUpgradeModal(plugin)}
              >
                <Icon icon="mdi:arrow-up-bold" width="16" height="16" className="mr-2" />
                {t('upgrade')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="min-w-[80px]"
                disabled={loadingPluginName === plugin.name}
                onClick={() => handleInstall(plugin)}
              >
                {loadingPluginName === plugin.name ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Icon icon="mdi:download" width="16" height="16" className="mr-2" />
                )}
                {t('install')}
              </Button>
            )
          }
        />
      ))}

      {/* App upgrade modal */}
      <Dialog open={upgradeModal.isOpen} onOpenChange={(open) => { if (!open) setUpgradeModal({ isOpen: false }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('app-upgrade-required')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {upgradeModal.plugin && (
              <div className="flex flex-col gap-2 p-3 bg-muted rounded-md">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('name')}:</span>
                  <span className="font-medium">{upgradeModal.plugin.displayName?.[i18n.language] || upgradeModal.plugin.displayName?.default}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('current-app-version')}:</span>
                  <span className="font-medium">{currentAppVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('required-app-version')}:</span>
                  <span className="font-medium text-amber-500">{upgradeModal.plugin.minAppVersion}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUpgradeModal({ isOpen: false })}>
              {t('cancel')}
            </Button>
            <Button onClick={handleUpgrade}>
              {t('upgrade')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

const AddLocalPluginDialog = observer(({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  const handleConfirm = () => {
    RootStore.Get(PluginManagerStore).connectDevPlugin(url);
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <Label>{t('endpoint')}</Label>
        <div className="relative">
          <Icon icon="mdi:link-variant" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ws://192.168.31.100:8080"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button onClick={handleConfirm}>
          {t('confirm')}
        </Button>
      </div>
    </div>
  );
});

const InstallFromGithubDialog = observer(({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const pluginManager = RootStore.Get(PluginManagerStore);
  const [githubUrl, setGithubUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInstall = async () => {
    if (!githubUrl.trim()) return;

    setIsLoading(true);
    try {
      const cleanUrl = githubUrl.trim().replace(/\/$/, '');
      const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Invalid GitHub URL format. Please use: https://github.com/owner/repo');
      }

      const [, owner, repo] = match;
      const repoName = repo.replace(/\.git$/, '');

      if (!owner || !repoName || owner === '' || repoName === '') {
        throw new Error('Invalid repository format. Please check the URL.');
      }

      const repoApiUrl = `https://api.github.com/repos/${owner}/${repoName}`;
      const releasesApiUrl = `https://api.github.com/repos/${owner}/${repoName}/releases/latest`;

      let repoData: any = null;
      let version = '1.0.0';

      try {
        const repoResponse = await fetch(repoApiUrl);
        if (repoResponse.ok) {
          repoData = await repoResponse.json();
        }
      } catch (error) {
        console.warn('Failed to fetch repo info:', error);
      }

      try {
        const releaseResponse = await fetch(releasesApiUrl);
        if (releaseResponse.ok) {
          const releaseData = await releaseResponse.json();
          version = releaseData.tag_name.replace(/^v/, '');
        }
      } catch (error) {
        console.warn('Failed to fetch release info:', error);
      }

      const pluginInfo: PluginInfo = {
        name: repoName,
        author: owner,
        url: githubUrl,
        version: version,
        displayName: {
          default: repoData?.name || repoName,
          zh_CN: repoData?.name || repoName
        },
        description: {
          default: repoData?.description || 'Plugin installed from GitHub'
        }
      };

      await PromiseCall(pluginManager.installPlugin(pluginInfo), { autoAlert: true });
      pluginManager.loadAllPlugins();
      onClose();
    } catch (error) {
      console.error('Failed to install plugin from GitHub:', error);
      RootStore.Get(DialogStandaloneStore).setData({
        isOpen: true,
        title: t('error'),
        size: 'sm',
        content: (
          <div className="text-center py-4">
            <p className="text-destructive">{error instanceof Error ? error.message : 'Installation failed'}</p>
          </div>
        )
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted-foreground mb-2">
        {t('install-from-github-description')}
      </div>
      <div className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg">
        <Icon icon="mdi:information" className="inline mr-1" />
        {t('github-api-limit-notice')}
      </div>
      <div className="space-y-1">
        <Label>{t('github-repository-url')}</Label>
        <div className="relative">
          <Icon icon="mdi:github" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="https://github.com/owner/plugin-repo"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button
          onClick={handleInstall}
          disabled={!githubUrl.trim() || isLoading}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {t('install')}
        </Button>
      </div>
    </div>
  );
});

const LocalDevelopment = observer(() => {
  const { t } = useTranslation();
  const dialog = RootStore.Get(DialogStandaloneStore);
  const pluginManager = RootStore.Get(PluginManagerStore);

  const handleAddLocalPlugin = () => {
    dialog.setData({
      isOpen: true,
      title: t('add-local-plugin'),
      size: 'md',
      content: <AddLocalPluginDialog onClose={() => dialog.close()} />
    });
  };

  const handleDisconnect = () => {
    pluginManager.disconnectDevPlugin();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {t('local-development-description')}
        </div>
        <Button
          size="sm"
          className="px-4"
          onClick={handleAddLocalPlugin}
        >
          <Icon icon="mdi:plus" className="text-lg mr-2" />
          {t('add-local-plugin')}
        </Button>
      </div>

      {pluginManager.devWebscoketUrl.value && (
        <Card className="p-4 bg-muted/40 backdrop-blur-lg border">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0 w-2">
                <div
                  className={`absolute top-2 left-0 w-2 h-2 rounded-full animate-pulse ${pluginManager.wsConnectionStatus === 'connected' ? 'bg-green-500' :
                    pluginManager.wsConnectionStatus === 'error' ? 'bg-destructive' :
                      'bg-amber-500'
                    }`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="font-medium text-foreground">
                  {pluginManager.devPluginMetadata?.displayName?.[i18n.language] ||
                    pluginManager.devPluginMetadata?.displayName?.default ||
                    t('local-plugin')}
                </div>
                <div className="text-sm text-muted-foreground line-clamp-2">
                  {pluginManager.devPluginMetadata?.description?.[i18n.language] ||
                    pluginManager.devPluginMetadata?.description?.default}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon icon="mdi:link-variant" className="text-sm" />
                    <span>{pluginManager.devWebscoketUrl.value}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-6 px-2 min-w-0"
                    onClick={handleDisconnect}
                  >
                    <Icon icon="mdi:link-off" className="text-sm mr-1" />
                    {t('disconnect')}
                  </Button>
                </div>
              </div>
            </div>
            {pluginManager.devPluginMetadata?.withSettingPanel && (
              <Button
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  const pluginInstance = pluginManager.getPluginInstanceByName("dev");
                  RootStore.Get(DialogStandaloneStore).setData({
                    isOpen: true,
                    title: t('settings'),
                    size: 'lg',
                    content: <PluginRender content={pluginInstance?.renderSettingPanel!} />
                  });
                }}
              >
                <Icon icon="mdi:cog" className="text-sm" />
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
});

export const PluginSetting = observer(() => {
  const { t } = useTranslation();
  useEffect(() => {
    RootStore.Get(PluginManagerStore).loadAllPlugins();
  }, []);
  return (
    <CollapsibleCard
      icon="hugeicons:plug-socket"
      title={t('plugin-settings')}
    >
      <Tabs defaultValue="installed">
        <TabsList>
          <TabsTrigger value="installed">{t('installed-plugins')}</TabsTrigger>
          <TabsTrigger value="all">{t('marketplace')}</TabsTrigger>
          <TabsTrigger value="development">{t('local-development')}</TabsTrigger>
        </TabsList>
        <TabsContent value="installed">
          <InstalledPlugins />
        </TabsContent>
        <TabsContent value="all">
          <AllPlugins />
        </TabsContent>
        <TabsContent value="development">
          <LocalDevelopment />
        </TabsContent>
      </Tabs>
    </CollapsibleCard>
  );
});
