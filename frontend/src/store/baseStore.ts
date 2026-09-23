import dayjs from 'dayjs';
import { Store } from './standard/base';
import { StorageState } from './standard/StorageState';
import { makeAutoObservable } from 'mobx';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useSideNav } from '@/platform/PlatformProvider';
export class BaseStore implements Store {
  sid = 'BaseStore';
  constructor() {
    makeAutoObservable(this);
  }
  routerList = [
    {
      title: 'dashboard',
      href: '/dashboard',
      icon: 'material-symbols:desktop-windows',
      lane: 'planning',
    },
    {
      title: 'tickets',
      href: '/tickets',
      icon: 'tabler:list-check',
      lane: 'planning',
    },
    {
      title: 'study',
      href: '/study',
      icon: 'hugeicons:book-edit',
      lane: 'planning',
    },
    {
      title: 'skills',
      href: '/skills',
      icon: 'tabler:sparkles',
      lane: 'knowledge',
    },
    {
      title: 'graph',
      href: '/graph',
      icon: 'hugeicons:share-05',
      lane: 'planning',
    },
    {
      title: 'agenda',
      shallow: true,
      href: '/?path=agenda',
      icon: 'solar:calendar-mark-linear',
      lane: 'planning',
    },
    {
      title: 'resources',
      href: '/resources',
      icon: 'solar:database-linear',
      hiddenMobile: true,
      lane: 'knowledge',
    },
    {
      title: 'agents',
      href: '/ai',
      icon: 'hugeicons:chat',
      hiddenMobile: true,
      lane: 'knowledge',
    },
    {
      title: 'insights',
      href: '/insights',
      hiddenMobile: true,
      icon: 'hugeicons:analytics-01',
      lane: 'knowledge',
    },
    {
      title: 'plugin',
      href: '/plugin',
      hiddenMobile: true,
      icon: 'hugeicons:plug-socket',
      lane: 'system',
    },
    {
      title: 'settings',
      href: '/settings',
      hiddenMobile: true,
      icon: 'hugeicons:settings-01',
      lane: 'system',
    },
    {
      title: 'trash',
      href: '/?path=trash',
      hiddenMobile: true,
      icon: 'hugeicons:delete-02',
      lane: 'system',
    },
  ];
  laneOrder = ['planning', 'knowledge', 'system'] as const;
  currentRouter = this.routerList[0];
  currentQuery = {};
  currentTitle = '';
  documentHeight = 0;
  isSideBarActive(routerInfo: any, currentRouter: any) {
    const pathname = routerInfo.pathname;
    const path = routerInfo.searchParams?.get ? routerInfo.searchParams.get('path') : routerInfo.query?.path;
    const type = routerInfo.searchParams?.get ? routerInfo.searchParams.get('type') : routerInfo.query?.type;

    const href = String(currentRouter.href ?? '');
    const [hrefPath, hrefQuery] = href.split('?');
    const hrefParams = new URLSearchParams(hrefQuery || '');

    if (hrefPath === pathname && !hrefQuery) {
      return true;
    }
    if (hrefPath === pathname && hrefQuery) {
      const pathMatches = !hrefParams.has('path') || hrefParams.get('path') === path;
      const typeMatches = !hrefParams.has('type') || hrefParams.get('type') === type;
      return pathMatches && typeMatches;
    }
    if (path == currentRouter.title) {
      return true;
    }
    return false;
  }

  locale = new StorageState({ key: 'language', default: 'en' });
  locales = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'zh-TW', label: '繁體中文' },
    { value: 'ar', label: 'العربية' },
    { value: 'kab', label: 'Taqbaylit' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'ka', label: 'ქართული' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'pt', label: 'Português' },
    { value: 'pl', label: 'Polish' },
    { value: 'ru', label: 'Русский' },
    { value: 'uk', label: 'Українська' },
    { value: 'ko', label: '한국어' },
    { value: 'ja', label: '日本語' },
    { value: 'nl', label: 'Nederlands' },
  ];

  changeLanugage(i18n, locale) {
    i18n.changeLanguage(locale);
    dayjs.locale(i18n.resolvedLanguage);
    this.locale.save(locale);
  }

  isOnline: boolean = typeof window !== 'undefined' ? window.navigator.onLine : true;

  setOnlineStatus = (status: boolean) => {
    this.isOnline = status;
  };

  useInitApp() {
    const isPc = useSideNav();
    const { t, i18n } = useTranslation();
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()

    const documentHeight = () => {
      const doc = document.documentElement;
      this.documentHeight = window.innerHeight;
      doc.style.setProperty('--doc-height', `${window.innerHeight}px`);
    };

    useEffect(() => {
      const handleOnline = () => this.setOnlineStatus(true);
      const handleOffline = () => this.setOnlineStatus(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      documentHeight();
      window.addEventListener('resize', documentHeight);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('resize', documentHeight);
      };
    }, [navigate]);

    useEffect(() => {
      if (location.pathname == '/review') {
        this.currentTitle = 'daily-review';
      } else if (location.pathname == '/detail') {
        this.currentTitle = 'detail';
      } else if (searchParams.get('path') == 'all') {
        this.currentTitle = t('total');
      } else if (searchParams.get('path') == 'agenda' || searchParams.get('path') == 'notes' || searchParams.get('path') == 'todo') {
        this.currentTitle = 'agenda';
      } else if (searchParams.get('path') == 'archived') {
        this.currentTitle = 'archived';
      } else if (location.pathname == '/resources') {
        this.currentTitle = 'resources';
      } else if (location.pathname == '/tickets') {
        this.currentTitle = 'tickets';
      } else if (location.pathname == '/study') {
        this.currentTitle = 'study';
      } else if (location.pathname == '/graph') {
        this.currentTitle = 'graph';
      } else if (location.pathname == '/ai') {
        this.currentTitle = 'agents';
      } else if (location.pathname == '/dashboard') {
        this.currentTitle = 'dashboard';
      } else if (location.pathname == '/insights' || location.pathname == '/analytics') {
        this.currentTitle = 'insights';
      } else if (searchParams.get('path') == 'trash') {
        this.currentTitle = 'trash';
      } else if (location.pathname == '/plugin') {
        this.currentTitle = 'plugin';
      } else if (location.pathname == '/') {
        this.currentTitle = 'planinc';
      } else {
        this.currentTitle = this.currentRouter?.title ?? '';
      }

      if (this.currentRouter?.href != location.pathname && !(location.pathname === '/' && this.currentRouter?.href?.startsWith('/?'))) {
        this.currentRouter = this.routerList.find((item) => item.href == location.pathname) as any
          ?? this.routerList.find((item) => item.href?.startsWith(`${location.pathname}?`)) as any;
      }
    }, [this.currentRouter, location.pathname, searchParams]);

    useEffect(() => {
      this.currentQuery = searchParams;
    }, [searchParams]);
  }

  sidebarWidth = new StorageState<number>({
    key: 'sidebar-width',
    default: 220,
    validate: (value: number) => {
      if (value < 220) return 220;
      if (value > 400) return 400;
      return value;
    },
  });

  sidebarCollapsed = new StorageState<boolean>({
    key: 'sidebar-collapsed',
    default: false,
  });

  isResizing = false;
  isDragging = false;

  get isSidebarCollapsed() {
    return this.sidebarCollapsed.value;
  }

  get sideBarWidth() {
    return this.isSidebarCollapsed ? 80 : this.sidebarWidth.value;
  }

  set sideBarWidth(value: number) {
    if (!this.isSidebarCollapsed) {
      this.sidebarWidth.save(value);
    }
  }

  startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.isDragging = true;
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.stopResizing);
  };

  handleMouseMove = (e: MouseEvent) => {
    if (!this.isResizing || this.isSidebarCollapsed) return;

    e.preventDefault();
    const newWidth = Math.max(80, Math.min(400, e.clientX));
    this.sidebarWidth.save(newWidth);
  };

  stopResizing = () => {
    this.isResizing = false;
    setTimeout(() => {
      this.isDragging = false;
    }, 50);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.stopResizing);
  };

  toggleSidebar = () => {
    const newCollapsed = !this.isSidebarCollapsed;
    this.sidebarCollapsed.save(newCollapsed);
  };

  collapseSidebar = () => {
    this.sidebarCollapsed.save(false);
  };
}
