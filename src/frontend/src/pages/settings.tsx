import { observer } from 'mobx-react-lite';
import { BasicSetting } from '@/components/PlanIncSettings/BasicSetting';
import AiSetting from '@/components/PlanIncSettings/AiSetting/AiSetting';
import { PerferSetting } from '@/components/PlanIncSettings/PerferSetting';
import { TaskSetting } from '@/components/PlanIncSettings/TaskSetting';
import { ImportSetting } from '@/components/PlanIncSettings/ImportSetting';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { UserStore } from '@/store/user';
import { RootStore } from '@/store';
import { UserSetting } from '@/components/PlanIncSettings/UserSetting';
import { AboutSetting } from '@/components/PlanIncSettings/AboutSetting';
import { StorageSetting } from '@/components/PlanIncSettings/StorageSetting';
import { ExportSetting } from '@/components/PlanIncSettings/ExportSetting';
import { MusicSetting } from '@/components/PlanIncSettings/MusicSetting';
import { SSOSetting } from '@/components/PlanIncSettings/SSOSetting';
import { HttpProxySetting } from '@/components/PlanIncSettings/HttpProxySetting';
import { useTranslation } from 'react-i18next';
import { JSX } from 'react';
import { ScrollableTabs, TabItem } from '@/components/Common/ScrollableTabs';
import { useState, useEffect } from 'react';
import { PlanIncStore } from '@/store/planincStore';
import { PluginSetting } from '@/components/PlanIncSettings/PluginSetting';
import { ImportAIDialog } from '@/components/PlanIncSettings/ImportAIDialog';
import { Icon } from '@/components/Common/Iconify/icons';
import { HotkeySetting } from '@/components/PlanIncSettings/HotkeySetting';
import { FormFieldSetting } from '@/components/PlanIncSettings/FormFieldSetting';
import { ShareApprovalSetting } from '@/components/PlanIncSettings/ShareApprovalSetting';
import { CategorySetting } from '@/components/PlanIncSettings/CategorySetting';
import { BrandSetting } from '@/components/PlanIncSettings/BrandSetting';
import { isDesktop } from '@/lib/tauriHelper';
import { useIsPhone } from '@/platform/PlatformProvider';

type SettingGroup = 'general' | 'workspace' | 'forms' | 'ai' | 'automation' | 'storage' | 'security' | 'about';

type SettingItem = {
  key: string;
  title: string;
  icon: string;
  component: JSX.Element;
  requireAdmin: boolean;
  group: SettingGroup;
  keywords?: string[];
};
export const allSettings: SettingItem[] = [
  {
    key: 'basic',
    title: ('basic-information'),
    icon: 'tabler:tool',
    component: <BasicSetting />,
    requireAdmin: false,
    group: 'general',
    keywords: ['basic', 'information', '基本信息', '基础设置'],
  },
  {
    key: 'prefer',
    title: ('preference'),
    icon: 'tabler:settings-2',
    component: <PerferSetting />,
    requireAdmin: false,
    group: 'general',
    keywords: ['preference', 'theme', 'language', '偏好设置', '主题', '语言'],
  },
  {
    key: 'hotkey',
    title: ('hotkeys'),
    icon: 'material-symbols:keyboard',
    component: <HotkeySetting />,
    requireAdmin: false,
    group: 'workspace',
    keywords: ['hotkey', 'shortcut', 'keyboard', 'desktop', '快捷键', '热键', '桌面'],
  },
  {
    key: 'plan-categories',
    title: ('plan-categories'),
    icon: 'tabler:category',
    component: <CategorySetting />,
    requireAdmin: false,
    group: 'forms',
    keywords: ['category', 'categories', 'lane', 'board', 'kanban', '分类', '看板'],
  },
  {
    key: 'form-fields',
    title: ('custom-form-fields'),
    icon: 'tabler:forms',
    component: <FormFieldSetting />,
    requireAdmin: false,
    group: 'forms',
    keywords: ['form', 'forms', 'field', 'fields', 'custom', '表单', '自定义字段'],
  },
  {
    key: 'brand',
    title: ('workspace-logo'),
    icon: 'tabler:photo',
    component: <BrandSetting />,
    requireAdmin: false,
    group: 'workspace',
    keywords: ['logo', 'brand', 'icon', 'image', '标志', '品牌'],
  },
  {
    key: 'share-approval',
    title: ('share-approvals'),
    icon: 'mdi:shield-account-outline',
    component: <ShareApprovalSetting />,
    requireAdmin: false,
    group: 'security',
    keywords: ['share', 'sharing', 'approval', 'approve', 'credential', 'email', '分享', '审批'],
  },
  {
    key: 'user',
    title: ('user-list'),
    icon: 'tabler:users',
    component: <UserSetting />,
    requireAdmin: true,
    group: 'security',
    keywords: ['user', 'users', '用户', '用户列表'],
  },
  {
    key: 'ai',
    title: 'AI',
    icon: 'hugeicons:ai-beautify',
    component: <AiSetting />,
    requireAdmin: true,
    group: 'ai',
    keywords: ['ai', 'artificial intelligence', '人工智能'],
  },
  {
    key: 'httpproxy',
    title: ('http-proxy'),
    icon: 'tabler:cloud-network',
    component: <HttpProxySetting />,
    requireAdmin: true,
    group: 'ai',
    keywords: ['proxy', 'http', 'connection', '代理', 'HTTP代理'],
  },
  {
    key: 'task',
    title: ('schedule-task'),
    icon: 'tabler:list-check',
    component: <TaskSetting />,
    requireAdmin: true,
    group: 'automation',
    keywords: ['task', 'schedule', '任务', '定时任务'],
  },
  {
    key: 'storage',
    title: ('storage'),
    icon: 'tabler:database',
    component: <StorageSetting />,
    requireAdmin: true,
    group: 'storage',
    keywords: ['storage', 'database', '存储', '数据库'],
  },
  {
    key: 'music',
    title: ('music-settings'),
    icon: 'tabler:music',
    component: <MusicSetting />,
    requireAdmin: true,
    group: 'workspace',
    keywords: ['music', '音乐设置'],
  },
  {
    key: 'import',
    title: ('import'),
    icon: 'tabler:file-import',
    component: <ImportSetting />,
    requireAdmin: true,
    group: 'storage',
    keywords: ['import', 'data', '导入', '数据导入'],
  },
  {
    key: 'sso',
    title: ('sso-settings'),
    icon: 'tabler:key',
    component: <SSOSetting />,
    requireAdmin: true,
    group: 'security',
    keywords: ['sso', 'single sign on', '单点登录'],
  },
  {
    key: 'export',
    title: ('export'),
    icon: 'tabler:file-export',
    component: <ExportSetting />,
    requireAdmin: false,
    group: 'storage',
    keywords: ['export', 'data', '导出', '数据导出'],
  },
  {
    key: 'plugin',
    title: ('plugin-settings'),
    icon: 'hugeicons:plug-socket',
    component: <PluginSetting />,
    requireAdmin: true,
    group: 'workspace',
    keywords: ['plugin', 'plugins', '插件', '插件设置'],
  },
  {
    key: 'about',
    title: ('about'),
    icon: 'tabler:info-circle',
    component: <AboutSetting />,
    requireAdmin: false,
    group: 'about',
    keywords: ['about', 'information', '关于', '信息'],
  },
];
const Page = observer(() => {
  const user = RootStore.Get(UserStore);
  const planincStore = RootStore.Get(PlanIncStore);
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<string>(() => searchParams.get('section') || 'basic');
  const isMobile = useIsPhone();

  // Deep links such as /settings?section=ai are how the command palette and the global
  // search jump straight to a panel; before this the param was written but never read.
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && section !== selected) setSelected(section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const groupLabels: Record<SettingGroup, string> = {
    general: 'General',
    workspace: 'Workspace',
    forms: 'Forms',
    ai: 'AI & Integrations',
    automation: 'Automation',
    storage: 'Storage & Data',
    security: 'Security',
    about: 'About',
  };

  const getVisibleSettings = () => {
    let settings = allSettings.filter((setting) => !setting.requireAdmin || user.isSuperAdmin);

    // Hide hotkey settings on mobile platforms
    settings = settings.filter((setting) =>
      (setting.key !== 'hotkey' || isDesktop())
    );

    if (planincStore.searchText) {
      const lowerSearchText = planincStore.searchText.toLowerCase();
      const filteredSettings = settings.filter((setting) =>
        setting.title.toLowerCase().includes(lowerSearchText) ||
        setting.keywords?.some((keyword) => keyword.toLowerCase().includes(lowerSearchText))
      );

      // If no settings match the search criteria, return all settings instead of an empty list
      if (filteredSettings.length === 0) {
        return settings;
      }

      return filteredSettings;
    }

    return settings;
  };

  const visibleSettings = getVisibleSettings();
  const visibleKeys = visibleSettings.map((setting) => setting.key).join('|');

  useEffect(() => {
    if (!visibleSettings.some((setting) => setting.key === selected)) {
      setSelected(visibleSettings[0]?.key ?? 'basic');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, visibleKeys]);

  const getCurrentComponent = () => {
    const setting = allSettings.find((s) => s.key === selected);
    return setting ? <div key={setting.key} className="min-w-0">{setting.component}</div> : null;
  };

  const tabItems: TabItem[] = visibleSettings.map((setting) => ({
    key: setting.key,
    title: setting.title,
    icon: setting.icon,
  }));

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ImportAIDialog onSelectTab={setSelected} />

      {isMobile ? (
        <div className="w-full min-h-0 flex-1 flex flex-col">
          <div className="sticky top-0 z-10 w-full shrink-0 pt-[env(safe-area-inset-top,0px)]">
            <div className="mx-1 backdrop-blur-md bg-background border border-border" style={{ borderRadius: 'var(--card-radius)' }}>
              <ScrollableTabs
                items={tabItems}
                selectedKey={selected}
                onSelectionChange={setSelected}
                color="primary"
              />
            </div>
          </div>
          <ScrollArea onBottom={() => { }} className="flex-1 min-h-0">
            <div className="w-full max-w-[1024px] mx-auto flex min-w-0 flex-col gap-4 sm:gap-6 px-3 sm:px-4 py-4">
              {getCurrentComponent()}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="w-full max-w-[var(--pi-content-max-width,1200px)] mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-row h-full min-h-0 gap-4 lg:gap-6">
          {/* Responsive nav: icon rail on md (tablet), full labels on lg (desktop) */}
          <nav aria-label={t('settings')} className="hidden md:flex md:w-16 lg:w-60 shrink-0 min-h-0">
            <div className="w-full border border-border bg-background p-1 mb-4 min-h-0" style={{ borderRadius: 'var(--card-radius)' }}>
              <ScrollArea onBottom={() => { }} className="h-auto max-h-[calc(100vh-140px)]">
                <div className="p-1 flex flex-col flex-nowrap gap-1">
                  {Object.entries(groupLabels).map(([group, label]) => {
                    const groupItems = visibleSettings.filter((setting) => setting.group === group);
                    if (!groupItems.length) return null;
                    return (
                      <div key={group} className="flex flex-col gap-1 min-w-0">
                        <p className="hidden lg:block px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/50 truncate">
                          {label}
                        </p>
                        {groupItems.map((item) => (
                          <button
                            key={item.key}
                            title={t(item.title)}
                            aria-current={selected === item.key ? 'page' : undefined}
                            onClick={() => setSelected(item.key)}
                            className={`cursor-pointer flex items-center justify-center lg:justify-start min-h-[var(--pi-tap-target,32px)] px-0 lg:px-3 py-2 text-sm transition-colors min-w-0 ${selected === item.key
                              ? 'bg-primary text-primary-foreground font-medium'
                              : 'hover:bg-muted/50 text-foreground/80 hover:text-foreground'
                              }`}
                            style={{ borderRadius: 'var(--button-radius)' }}
                          >
                            {item.icon && (
                              <span className="flex-shrink-0 lg:mr-2">
                                <Icon icon={item.icon} width="18" />
                              </span>
                            )}
                            <span className="hidden lg:inline truncate font-bold">{t(item.title)}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </nav>

          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <ScrollArea onBottom={() => { }} className="h-full min-h-0">
              <div className="w-full max-w-[900px] mx-auto flex min-w-0 flex-col gap-4 sm:gap-6 px-1 sm:px-2">
                {getCurrentComponent()}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
});

export default Page;
