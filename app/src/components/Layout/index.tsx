import React, { useEffect, useState } from 'react';
import { Button, Badge } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { UserStore } from '@/store/user';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { useTranslation } from 'react-i18next';
import { BaseStore } from '@/store/baseStore';
import { ScrollArea } from '../Common/ScrollArea';
import { BlinkoRightClickMenu } from '@/components/BlinkoRightClickMenu';
import { useMediaQuery } from 'usehooks-ts';
import { push as Menu } from 'react-burger-menu';
import { eventBus } from '@/lib/event';
import AiWritePop from '../Common/PopoverFloat/aiWritePop';
import { Sidebar } from './Sidebar';
import { MobileNavBar } from './MobileNavBar';
import FilterPop from '../Common/PopoverFloat/filterPop';
import { api } from '@/lib/trpc';
import { showTipsDialog } from '../Common/TipsDialog';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { BarSearchInput } from './BarSearchInput';
import { BlinkoNotification } from '@/components/BlinkoNotification';
import { AiStore } from '@/store/aiStore';
import { useLocation, useSearchParams, Link } from 'react-router-dom';

export const SideBarItem = 'p-2 flex items-center cursor-pointer gap-2 rounded-2xl !transition-all bg-background/50 hover:bg-primary/20 transition-colors';

export const getFixedHeaderBackground = () => {
  if (document?.documentElement?.classList?.contains('dark')) {
    return '#050505';
  }
  return '#FDFBF7';
};

export const CommonLayout = observer(({ children, header }: { children?: React.ReactNode; header?: React.ReactNode }) => {
  const [isClient, setClient] = useState(false);
  const [isOpen, setisOpen] = useState(false);

  const isPc = useMediaQuery('(min-width: 768px)');
  const { t } = useTranslation();
  const user = RootStore.Get(UserStore);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const base = RootStore.Get(BaseStore);
  const location = useLocation()
  const [searchParams] = useSearchParams()
  blinkoStore.use();
  user.use();
  base.useInitApp();


  useEffect(() => {
    if (isPc) setisOpen(false);
  }, [isPc]);

  useEffect(() => {
    setClient(true);
    eventBus.on('close-sidebar', () => {
      setisOpen(false);
    });
  }, []);


  if (!isClient) return <></>;

  if (
    location.pathname == '/signin' ||
    location.pathname == '/quicknote' ||
    location.pathname == '/quickai' ||
    location.pathname == '/quicktool' ||
    location.pathname == '/signup' ||
    location.pathname == '/api-doc' ||
    location.pathname.includes('/share') ||
    location.pathname == '/editor' ||
    location.pathname == '/oauth-callback' ||
    location.pathname.includes('/ai-share')
  ) {
    return <>{children}</>;
  }

  return (
    <div className={`blinko-crm-shell flex w-full h-mobile-full overflow-x-hidden min-h-[100dvh]`} id="outer-container" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <AiWritePop />

      <Menu style={{
        bmMenuWrap: {
          transition: 'all .5s cubic-bezier(0.32, 0.72, 0, 1)'
        }
      }} disableAutoFocus onClose={() => setisOpen(false)} onOpen={setisOpen} isOpen={isOpen} pageWrapId={'page-wrap'} outerContainerId={'outer-container'}>
        <Sidebar onItemClick={() => setisOpen(false)} />
      </Menu>

      {isPc && <Sidebar />}

      <main
        id="page-wrap"
        style={{ width: isPc ? `calc(100% - ${base.sideBarWidth}px)` : '100%' }}
        className={`flex !transition-all duration-300 overflow-y-hidden w-full flex-col gap-y-1 bg-secondbackground`}
      >
        {/* nav bar  */}
        <header
          className="blinko-mobile-header relative flex md:h-16 md:min-h-16 h-14 min-h-14 items-center justify-between gap-2 px-2 md:px-4 pt-2 md:pb-2 overflow-hidden"
          style={!isPc ? {
            position: 'fixed',
            top: 0,
            borderRadius: 'calc(2rem-0.375rem)',
            zIndex: 11,
            width: '100%',
            background: 'rgba(253, 251, 247, 0.8)',
            backdropFilter: 'blur(20px) blur-x(0)',
            WebkitBackdropFilter: 'blur(20px) blur-x(0)',
            boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.1)'
          } : undefined}
        >
          {/* <div className="hidden md:block absolute bottom-[20%] right-[5%] z-[0] h-[350px] w-[350px] overflow-hidden blur-3xl ">
            <div className="w-full h-[100%] bg-[#9936e6] opacity-20" style={{ clipPath: 'circle(50% at 50% 50%)' }} />
          </div> */}
          {/* Outer shell - double bezel pattern */}
          <div className="relative rounded-2xl bg-white/50 backdrop-blur-xl border border-white/10 p-2 md:p-3 max-w-full">
            {/* Inner core */}
            <div className="flex max-w-full items-center gap-2 md:p-2 w-full z-[1]">
            {!isPc && (
              <Button isIconOnly className="flex size-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/10 hover:bg-white/30 transition-colors" size="sm" variant="light" onPress={() => setisOpen(!isOpen)}>
                <Icon className="text-default-500" height={24} icon="solar:hamburger-menu-outline" width={24} />
              </Button>
            )}
            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-[4px] h-[16px] bg-primary rounded-xl hidden md:block" />
                <div className="flex flex-row items-center gap-1">
                  <div className="font-black select-none text-lg font-medium">
                    {location.pathname == '/ai'
                      ? !!RootStore.Get(AiStore).currentConversation.value?.title
                        ? RootStore.Get(AiStore).currentConversation.value?.title
                        : t(base.currentTitle)
                      : t(base.currentTitle)}
                  </div>
                  {searchParams.get('path') != 'trash' ? (
                    <Icon
                      className="cursor-pointer hover:rotate-180 !transition-all hidden md:block"
                      onClick={() => {
                        blinkoStore.refreshData();
                        blinkoStore.updateTicker++;
                      }}
                      icon="fluent:arrow-sync-12-filled"
                      width="20"
                      height="20"
                    />
                  ) : (
                    <Icon
                      className="cursor-pointer !transition-all text-red-500"
                      onClick={() => {
                        showTipsDialog({
                          size: 'sm',
                          title: t('confirm-to-delete'),
                          content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
                          onConfirm: async () => {
                            await RootStore.Get(ToastPlugin).promise(api.notes.clearRecycleBin.mutate(), {
                              loading: t('in-progress'),
                              success: <b>{t('your-changes-have-been-saved')}</b>,
                              error: <b>{t('operation-failed')}</b>,
                            });
                            blinkoStore.refreshData();
                            RootStore.Get(DialogStandaloneStore).close();
                          },
                        });
                      }}
                      icon="mingcute:delete-2-line"
                      width="20"
                      height="20"
                    />
                  )}
                </div>
                {!base.isOnline && (
                  <Badge color="warning" variant="flat" className="animate-pulse">
                    <div className="flex text-sm items-center gap-1 text-yellow-500">
                      <span>{t('offline-status')}</span>
                    </div>
                  </Badge>
                )}
              </div>
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 w-auto">
                <BarSearchInput isPc={isPc} />
                <FilterPop />
                <div className="flex items-center gap-2">
                  {!blinkoStore.config.value?.isCloseDailyReview && <Badge size="sm" className="shrink-0 flex items-center" color="warning">
                    <Link to="/review">
                      <Button
                        as="a"
                        isIconOnly
                        size="sm"
                        variant="light"
                      >
                        <Icon className="cursor-pointer text-default-600" icon="tabler:bulb" width="24" height="24" />
                      </Button>
                    </Link>
                    <span className="text-[10px] uppercase tracking-[0.1em] ml-1">
                      {blinkoStore.dailyReviewNoteList.value?.length}
                    </span>
                  </Badge>}
                  <div className="flex items-center gap-1">
                    {blinkoStore.noteListFilterConfig.tagId !== null && (
                      <span className="px-2 py-1 text-[10px] uppercase tracking-[0.1em] bg-primary/20 text-primary rounded">
                        {t('tag')}: {blinkoStore.noteListFilterConfig.tagId}
                      </span>
                    )}
                    {blinkoStore.noteListFilterConfig.withoutTag && (
                      <span className="px-2 py-1 text-[10px] uppercase tracking-[0.1em] bg-red-100 text-red-800 rounded">
                        {t('without-tag')}
                      </span>
                    )}
                    {blinkoStore.noteListFilterConfig.withFile && (
                      <span className="px-2 py-1 text-[10px] uppercase tracking-[0.1em] bg-green-100 text-green-800 rounded">
                        {t('has-file')}
                      </span>
                    )}
                    {blinkoStore.noteListFilterConfig.withLink && (
                      <span className="px-2 py-1 text-[10px] uppercase tracking-[0.1em] bg-blue-100 text-blue-800 rounded">
                        {t('has-link')}
                      </span>
                    )}
                  </div>
                </div>
                <BlinkoNotification />
              </div>
            </div>
          </div>
          </div>
          {header}
        </header>



        {/* backdrop  pt-6 -mt-6 to fix the editor tooltip position */}
        <ScrollArea onBottom={() => { }} className={`${isPc ? 'h-[calc(100%_-_70px)]' : 'h-full'} !overflow-y-auto overflow-x-hidden mt-[-4px]`}>
          <div className="relative flex h-full w-full flex-col rounded-medium layout-container">
            <div className="hidden md:block absolute top-[-37%] right-[5%] z-[0] h-[350px] w-[350px] overflow-hidden blur-3xl ">
              <div className="w-full h-[356px] bg-[#9936e6] opacity-20" style={{ clipPath: 'circle(50% at 50% 50%)' }} />
            </div>
            {children}
          </div>
        </ScrollArea>

        <MobileNavBar onItemClick={() => setisOpen(false)} />
        <BlinkoRightClickMenu />
      </main>
    </div>
  );
});
