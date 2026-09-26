import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { SideBarItem } from './index';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@/platform/PlatformProvider';
import { UserAvatarDropdown } from '../Common/UserAvatarDropdown';
import { useEffect, useMemo, useState } from 'react';
import { PlanIncStore } from '@/store/planincStore';
import { useLocation, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { eventBus } from '@/lib/event';
import { api } from '@/lib/trpc';
import { GuidedTooltip } from '../Common/GuidedTooltip';

interface SidebarProps {
  onItemClick?: () => void;
}

/**
 * One-line "why you'd click this" hints for the main nav, shown in the guided
 * tooltip. Keyed by `href` so a route rename cannot silently orphan a hint; an
 * unknown route simply renders the label without a hint.
 */
const NAV_HINTS: Record<string, string> = {
  '/': 'Your notes and plans, newest first',
  '/?path=agenda': 'One merged stream of notes, plans and tasks',
  '/?path=agenda&type=note': 'Just the notes from the agenda stream',
  '/?path=agenda&type=todo': 'Just the plans and tasks',
  '/all': 'Every note, across every tag',
  '/dashboard': 'Counts and recent activity at a glance',
  '/resources': 'Files and attachments you have uploaded',
  '/tickets': 'Support tickets and their approvals',
  '/study': 'Study questions and spaced review',
  '/skills': 'Skill tracks and mastery progress',
  '/graph': 'How notes reference each other',
  '/review': 'Daily and random review of your notes',
  '/ai': 'Chat with your notes and agents',
  '/hub': 'Feeds and RSS sources',
  '/insights': 'Analytics and trend reports',
  '/?path=archived': 'Plans you have completed',
  '/?path=trash': 'Deleted notes, restorable',
  '/plugin': 'Installed plugins and their permissions',
  '/settings': 'Everything configurable in the workspace',
};

export const Sidebar = observer(({ onItemClick }: SidebarProps) => {
  // Same tier fact as the layout, read from the platform layer so the two
  // components cannot drift apart — they each had their own media query before.
  const { tier } = usePlatform();
  const isPc = tier.sideNav;
  const { t } = useTranslation();
  const base = RootStore.Get(BaseStore);
  const navigate = useNavigate();
  const planincStore = RootStore.Get(PlanIncStore);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);
  const [navQuery, setNavQuery] = useState('');
  const [brandLogo, setBrandLogo] = useState('');
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('sidebar-collapsed-lanes') ?? '{}');
    } catch {
      return {};
    }
  });

  const toggleLane = (lane: string) => {
    setCollapsedLanes((prev) => {
      const next = { ...prev, [lane]: !prev[lane] };
      try {
        localStorage.setItem('sidebar-collapsed-lanes', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const branding = await api.branding.get.query();
        if (!cancelled && branding?.url) setBrandLogo(branding.url);
      } catch { /* branding is optional */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredRouterList = useMemo(() => {
    const q = navQuery.trim().toLowerCase();
    if (!q) return base.routerList;
    return base.routerList.filter((i) => i.title.toLowerCase().includes(q) || (i.lane ?? '').toLowerCase().includes(q));
  }, [base.routerList, navQuery, t]);

  const routerInfo = {
    pathname: location.pathname,
    searchParams
  };

  useEffect(() => {
    console.log('router.query');
    if (!isPc) {
      base.collapseSidebar();
    }
  }, [isPc]);

  return (
    <div
      style={{ width: isPc ? `${base.sideBarWidth}px` : '100%' }}
      className={`flex h-full flex-1 flex-col p-4 relative bg-background 
        ${!base.isDragging ? '!transition-all duration-300' : 'transition-none'} 
        group/sidebar`}
      data-reveal
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {!base.isSidebarCollapsed && (
        <div
          className={`pi-sidebar-resize absolute right-0 top-0 h-full w-2 cursor-col-resize z-49
            ${base.isResizing ? 'bg-primary/40' : ''}`}
          onMouseDown={base.startResizing}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'none' }}
        />
      )}

      <div className={`flex items-center ${base.isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className={`flex w-full ${base.isSidebarCollapsed ? 'flex-col-reverse gap-2 justify-center items-center mr-2 mb-2' : 'items-center '}`}>
          {/* Brand mark: custom workspace logo wins, canonical amber mark otherwise */}
          <Link
            to="/dashboard"
            onClick={() => onItemClick?.()}
            aria-label="PlanInc home"
            className={`flex shrink-0 items-center gap-2 ${base.isSidebarCollapsed ? 'justify-center' : ''}`}
          >
            {base.isSidebarCollapsed ? (
              <img src={brandLogo || '/planinc-mark.svg'} alt="PlanInc" className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              brandLogo
                ? <img src={brandLogo} alt="PlanInc" className="h-8 max-w-[140px] rounded-lg object-contain" />
                : <img src="/planinc-lockup-h.svg" alt="PlanInc" className="h-7 w-auto" />
            )}
          </Link>
          {/* Mobile: Display avatar dropdown at the top */}
          <div className={`${base.isSidebarCollapsed ? 'w-full flex justify-center' : ''}`}>
            <UserAvatarDropdown onItemClick={onItemClick} collapsed={base.isSidebarCollapsed} showOverlay={isHovering} />
          </div>

          {/* Collapse toggle. Was `opacity-0 group-hover/sidebar:opacity-100`, which
              made it permanently invisible — and therefore untappable — on a
              touch tablet (iPad): hover never fires. `.hover-only-on-fine` reveals
              it on hover with a mouse, on `:focus-visible` for the keyboard, and
              keeps it always visible wherever the pointer is coarse. */}
          {isPc ? (
            <GuidedTooltip label={t('collapse')} hint={t('side-nav-mode-hint')} side="right">
              <Button
                size="icon"
                variant="ghost"
                className={`hover-only-on-fine ml-auto ${!base.isSidebarCollapsed ? '-translate-x-1 ' : 'translate-x-0'}`}
                onClick={base.toggleSidebar}
              >
                <Icon icon={base.isSidebarCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'} width="20" height="20" />
              </Button>
            </GuidedTooltip>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                navigate('/settings')
                eventBus.emit('close-sidebar')
              }}
            >
              <Icon icon="hugeicons:settings-01" width="20" height="20" />
            </Button>
          )}
        </div>
      </div>

      <div className="-mr-[16px] mt-[-5px] h-full max-h-full overflow-y-auto pr-6 hide-scrollbar">
        {!base.isSidebarCollapsed && (
          <div className="sticky top-0 z-10 bg-background pb-2 pt-1">
            <Input
              value={navQuery}
              onChange={(e) => setNavQuery(e.target.value)}
              placeholder={`${t('search')}…`}
              aria-label="Filter navigation"
              className="h-9"
            />
          </div>
        )}
        <div className={`flex flex-col gap-1 mt-4 font-semibold ${base.isSidebarCollapsed ? 'items-center gap-4' : ''}`}>
          {base.laneOrder.map((lane) => {
            const items = filteredRouterList.filter((i) => !i.hiddenSidebar && (i.lane ?? 'planning') === lane);
            if (!items.length) return null;
            const collapsed = !!collapsedLanes[lane];
            return (
              <div key={lane} className="flex flex-col gap-1">
                {!base.isSidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => toggleLane(lane)}
                    aria-expanded={!collapsed}
                    className="flex min-h-[32px] items-center gap-1 px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground-500 hover:text-foreground"
                  >
                    <Icon icon={collapsed ? 'gravity-ui:caret-right' : 'gravity-ui:caret-down'} width="14" height="14" />
                    {t(lane)}
                  </button>
                )}
                {!collapsed && items.map((i) => (
                  <GuidedTooltip
                    key={i.title}
                    label={base.isSidebarCollapsed ? t(i.title) : undefined}
                    hint={NAV_HINTS[i.href]}
                    side={base.isSidebarCollapsed ? 'right' : 'bottom'}
                  >
                    <Link
                      to={i.href}
                      onClick={() => { base.currentRouter = i; onItemClick?.(); }}
                      aria-current={base.isSideBarActive(routerInfo, i) ? 'page' : undefined}
                      className={`flex min-h-[44px] items-center gap-1 group ${SideBarItem} ${base.isSideBarActive(routerInfo, i) ? '!bg-primary !text-primary-foreground' : ''}`}
                    >
                      <Icon className={`${base.isSidebarCollapsed ? 'mx-auto' : ''}`} icon={i.icon} width="20" height="20" />
                      {!base.isSidebarCollapsed && <span className="!transition-all">{t(i.title)}</span>}
                    </Link>
                  </GuidedTooltip>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* ***** background *****  */}
      <div className="halation absolute inset-0 h-[250px] w-[250px] overflow-hidden blur-3xl z-[0] pointer-events-none">
        <div className="w-full h-[100%] bg-[#ffc65c] opacity-20" style={{ clipPath: 'circle(35% at 50% 50%)' }} />
      </div>
    </div>
  );
});
