import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export type TabItem = {
  key: string;
  title: string | React.ReactNode;
  icon?: string;
  avatar?: string;
};

interface ScrollableTabsProps {
  items: TabItem[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  color?: 'primary' | 'secondary' | 'default' | 'success' | 'warning' | 'danger';
  classNames?: {
    base?: string;
    tabList?: string;
    tab?: string;
    cursor?: string;
  };
}

export const ScrollableTabs = ({ items, selectedKey, onSelectionChange, color = 'primary', classNames = {} }: ScrollableTabsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const { t } = useTranslation();
  const checkScroll = () => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;

    const { scrollLeft, scrollWidth, clientWidth } = tabList as HTMLElement;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const timer = setTimeout(checkScroll, 100);

    const tabList = containerRef.current?.querySelector('[role="tablist"]');
    if (tabList) {
      tabList.addEventListener('scroll', checkScroll);
    }

    window.addEventListener('resize', checkScroll);

    return () => {
      clearTimeout(timer);
      if (tabList) {
        tabList.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  // Keep the active tab visible when selection changes (phone tab bar).
  useEffect(() => {
    const tabList = containerRef.current?.querySelector('[role="tablist"]');
    const active = tabList?.querySelector<HTMLElement>(`[data-state="active"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [selectedKey]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;

    const scrollAmount = 200;
    (tabList as HTMLElement).scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const renderTabTitle = (item: TabItem) => {
    const titleText = typeof item.title === 'string' ? t(item.title) : item.title;

    if (item.avatar) {
      return (
        <div className="flex min-w-0 items-center space-x-2">
          <Avatar className="w-5 h-5 shrink-0">
            <AvatarImage src={item.avatar} />
            <AvatarFallback className="text-[10px]" />
          </Avatar>
          <span className="text-[13px] sm:text-sm truncate">{titleText}</span>
        </div>
      );
    } else if (item.icon) {
      return (
        <div className="flex min-w-0 items-center space-x-1.5 sm:space-x-2">
          <Icon icon={item.icon} width="18" />
          <span className="text-[13px] sm:text-sm truncate">{titleText}</span>
        </div>
      );
    } else {
      return titleText;
    }
  };

  return (
    <div className="relative pb-[env(safe-area-inset-bottom,0px)]" ref={containerRef}>
      {showLeftArrow && (
        <Button variant="ghost" size="icon-sm" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm min-h-[44px] min-w-[44px]" onClick={() => scroll('left')} aria-label="Scroll tabs left">
          <Icon icon="tabler:chevron-left" width="18" />
        </Button>
      )}
      <Tabs
        aria-label="Scrollable tabs"
        value={selectedKey}
        onValueChange={(key) => onSelectionChange(key as string)}
        className={cn('w-full min-w-0', classNames.base)}
      >
        <TabsList
          className={cn('gap-1.5 sm:gap-2 relative p-1.5 sm:p-2 w-full max-w-full bg-transparent text-foreground overflow-x-auto scroll-smooth justify-start', classNames.tabList)}
        >
          {items.map((item) => (
            <TabsTrigger
              key={item.key}
              value={item.key}
              className={cn('max-w-fit min-h-[44px] sm:min-h-[var(--pi-tap-target,40px)] px-2 sm:px-3 h-11 sm:h-10 rounded-xl text-[13px] sm:text-sm whitespace-nowrap', classNames.tab)}
            >
              {renderTabTitle(item)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {showRightArrow && (
        <Button variant="ghost" size="icon-sm" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm min-h-[44px] min-w-[44px]" onClick={() => scroll('right')} aria-label="Scroll tabs right">
          <Icon icon="tabler:chevron-right" width="18" />
        </Button>
      )}
    </div>
  );
};
