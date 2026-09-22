import { follows } from '@shared/lib/recordSchemas';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { PromiseCall, PromiseState } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '../PlanIncCard/commentButton';
import { useEffect } from 'react';
import { LoadingAndEmpty } from '../Common/LoadingAndEmpty';
import { ScrollArea } from '../Common/ScrollArea';

export const PlanIncSiteUser = observer(
  ({
    item,
    showFollow = true,
    onConfirm,
    tags,
  }: {
    item: {
      id: any;
      siteName?: string;
      siteUrl: string;
      siteAvatar?: string;
    };
    showFollow: boolean;
    onConfirm: () => void;
    tags?: string[];
  }) => {
    const { t } = useTranslation();
    return (
      <div className="flex items-center gap-1 mt-2 w-full">
        <UserAvatar
          key={item.id}
          guestName={item.siteName ?? item.siteUrl}
          account={{
            image: item.siteAvatar ?? '',
          }}
          size={35}
        />
        <div className="flex flex-col gap-1">
          <div>{item.siteName}</div>
          <a href={item.siteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs">
            {item.siteUrl}
          </a>
          <div className="flex items-center gap-1">
            {tags?.map((tag) => (
              <div className="planinc-tag !text-xs mt-2">{tag}</div>
            ))}
          </div>
        </div>
        <Button
          size="sm"
          className="ml-auto rounded-full"
          onClick={() => {
            onConfirm();
          }}
        >
          {!showFollow ? t('unfollow') : t('follow')}
        </Button>
      </div>
    );
  },
);

export const PlanIncFollowDialog = observer(({ onConfirm }: { onConfirm: () => void }) => {
  const { t } = useTranslation();
  const store = RootStore.Local(() => ({
    siteUrl: '',
    siteList: new PromiseState({
      function: async (refresh = false) => {
        const data = await api.public.hubSiteList.query({
          refresh: refresh,
        });
        return data;
      },
    }),
  }));
  useEffect(() => {
    store.siteList.call();
  }, []);
  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="follow-site-url">{t('site-url')}</Label>
        <div className="relative">
          <Input
            id="follow-site-url"
            value={store.siteUrl}
            onChange={(e) => (store.siteUrl = e.target.value)}
            placeholder={'https://www.planinc.com'}
            className="pr-[150px]"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <Button
              className="w-[100px] rounded-full"
              onClick={async () => {
                await PromiseCall(api.follows.follow.mutate({ siteUrl: store.siteUrl, mySiteUrl: window.location.origin }));
                onConfirm();
                RootStore.Get(DialogStore).close();
              }}
              size="sm"
            >
              <Icon icon="fluent:people-add-32-regular" className="w-4 h-4" />
              {t('follow')}
            </Button>
            <Button
              size="icon"
              className="rounded-full"
              onClick={async () => {
                store.siteList.call(true);
              }}
            >
              <Icon icon="ion:refresh" className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <LoadingAndEmpty isLoading={store.siteList.loading.value} isEmpty={store.siteList.value?.length == 0} />

      <ScrollArea onBottom={() => {}} className="flex flex-col items-center gap-2 text-ignore text-bold mx-auto mt-4 max-h-[400px]">
        {store.siteList.value?.map((item) => (
          <PlanIncSiteUser
            item={{
              id: item.url,
              siteName: item.title,
              siteUrl: item.url,
              siteAvatar: item.image ?? '',
            }}
            tags={item.tags}
            showFollow={true}
            onConfirm={() => {
              PromiseCall(api.follows.follow.mutate({ siteUrl: item.url, mySiteUrl: window.location.origin }));
              onConfirm();
              RootStore.Get(DialogStore).close();
            }}
          />
        ))}
      </ScrollArea>
    </div>
  );
});

export const PlanIncFollowingDialog = observer(({ data, onConfirm, isFollowing = false }: { data: follows[]; onConfirm: () => void; isFollowing: boolean }) => {
  const { t } = useTranslation();
  return (
    <ScrollArea className="w-full gap-2" onBottom={() => {}}>
      {data.map((item) => (
        <PlanIncSiteUser
          key={item.id}
          item={{
            id: item.id,
            siteName: item.siteName ?? item.siteUrl,
            siteUrl: item.siteUrl,
            siteAvatar: item.siteAvatar ?? '',
          }}
          showFollow={!isFollowing}
          onConfirm={() => {
            if (isFollowing) {
              PromiseCall(api.follows.unfollow.mutate({ siteUrl: item.siteUrl, mySiteUrl: window.location.origin })).then(() => {
                onConfirm();
                RootStore.Get(DialogStore).close();
              });
            } else {
              PromiseCall(api.follows.follow.mutate({ siteUrl: item.siteUrl, mySiteUrl: window.location.origin })).then(() => {
                onConfirm();
                RootStore.Get(DialogStore).close();
              });
            }
          }}
        />
      ))}
    </ScrollArea>
  );
});
