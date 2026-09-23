import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { Item } from "./Item";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { PromiseCall, PromiseState } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect } from "react";
import { Icon } from '@/components/Common/Iconify/icons';
import { DialogStore } from "@/store/module/Dialog";
import { PasswordInput } from "../Common/PasswordInput";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { showTipsDialog } from "../Common/TipsDialog";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";

const UpdateUserInfo = observer(({ id, name, password, nickname, loginType }: { id?: number, name: string, password: string, nickname?: string, loginType?: string }) => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    username: name,
    password,
    nickname: nickname || name,
    upsertUser: new PromiseState({
      function: async () => {
        const upsertItem: { name: string; password: string; nickname?: string; id?: number } = {
          name: store.username,
          password: store.password,
          nickname: store.nickname
        }
        if (id) upsertItem.id = id
        await PromiseCall(api.users.upsertUserByAdmin.mutate(upsertItem))
        RootStore.Get(DialogStore).close()
        planinc.userList.call()
      }
    })
  }))

  const isOauth = loginType === 'oauth'

  return <>
    <div className="space-y-1.5">
      <Label>{t('username')}</Label>
      <Input
        placeholder={t('username')}
        value={store.username}
        onChange={e => { store.username = e.target.value }}
        disabled={isOauth}
      />
    </div>
    <div className="space-y-1.5 mt-2">
      <Label>{t('nickname')}</Label>
      <Input
        placeholder={t('nickname')}
        value={store.nickname}
        onChange={e => { store.nickname = e.target.value }}
      />
    </div>
    <PasswordInput placeholder={t('password')} label={t('password')} value={store.password} onChange={e => { store.password = e.target.value }} />
    <div className="flex w-full mt-2">
      <Button loading={store.upsertUser.loading.value} className="ml-auto" onClick={async e => {
        await store.upsertUser.call()
      }}>{t('save')}</Button>
    </div>
  </>
})

export const UserSetting = observer(() => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  useEffect(() => {
    planinc.userList.call()
  }, [])

  return (
    <CollapsibleCard
      icon="tabler:user-cog"
      title={t('user-list')}
    >
      <Item
        leftContent={<>{t('user-list')}</>}
        rightContent={
          <Button size="sm" onClick={e => {
              RootStore.Get(DialogStore).setData({
                isOpen: true,
                title: t('create-user'),
                content: <UpdateUserInfo name="" password="" />
              })
            }}><Icon icon="humbleicons:user-add" width="18" height="18" />{t('create-user')}</Button>
        }
      />

      <Item
        leftContent={planinc.userList.value ? <div className="mb-2 max-h-[300px] overflow-auto rounded-md border">
          <table className="hidden sm:table w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">{t('name-db')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('nickname')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('role')}</th>
                <th className="px-3 py-2 text-left font-medium">{t('login-type')}</th>
                <th className="px-3 py-2 text-left font-medium sticky right-0 bg-muted/50">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {
                planinc.userList.value!.map(i => {
                  return <tr key={i.id} className="border-b last:border-0">
                    <td className="px-3 py-2 max-w-[140px] truncate">{i.name}</td>
                    <td className="px-3 py-2 max-w-[140px] truncate">{i.nickname}</td>
                    <td className="px-3 py-2">
                      <Badge variant="warning">{i.role}</Badge>
                    </td>
                    <td className="px-3 py-2">{i.loginType == 'oauth' ? 'oauth' : t('password')}</td>
                    <td className="px-3 py-2 sticky right-0 bg-background">
                      <div className="flex">
                        <Button size="icon" variant="ghost" className="min-h-[44px] min-w-[44px]" onClick={e => {
                          RootStore.Get(DialogStore).setData({
                            isOpen: true,
                            title: t('edit-user'),
                            content: <UpdateUserInfo id={i.id} name={i.name} password={i.password} nickname={i.nickname} loginType={i.loginType} />
                          })
                        }}>
                          <Icon icon="tabler:edit" width="18" height="18" />
                        </Button>
                        <Button size="icon" variant="destructive" className="ml-2 min-h-[44px] min-w-[44px]"
                          onClick={e => {
                            showTipsDialog({
                              size: 'sm',
                              title: t('confirm-to-delete'),
                              content: t('after-deletion-all-user-data-will-be-cleared-and-unrecoverable'),
                              onConfirm: async () => {
                                try {
                                  await RootStore.Get(ToastPlugin).promise(
                                    api.users.deleteUser.mutate({ id: i.id }),
                                    {
                                      loading: t('in-progress'),
                                      success: <b>{t('your-changes-have-been-saved')}</b>,
                                      error: (e) => {
                                        return <b>{e.message}</b>
                                      },
                                    })
                                  planinc.userList.call()
                                  RootStore.Get(DialogStandaloneStore).close()
                                } catch (e) {
                                  // RootStore.Get(ToastPlugin).error(e.message)
                                  RootStore.Get(DialogStandaloneStore).close()
                                }
                              }
                            })
                          }}>
                          <Icon icon="tabler:trash" width="18" height="18" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                })
              }
            </tbody>
          </table>
          <div className="flex flex-col gap-2 p-2 sm:hidden">
            {planinc.userList.value!.map(i => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.nickname || i.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{i.name} · {i.loginType == 'oauth' ? 'oauth' : t('password')}</p>
                  <div className="mt-1"><Badge variant="warning">{i.role}</Badge></div>
                </div>
                <div className="flex shrink-0">
                  <Button size="icon" variant="ghost" className="min-h-[44px] min-w-[44px]" aria-label={t('edit-user')} onClick={e => {
                    RootStore.Get(DialogStore).setData({
                      isOpen: true,
                      title: t('edit-user'),
                      content: <UpdateUserInfo id={i.id} name={i.name} password={i.password} nickname={i.nickname} loginType={i.loginType} />
                    })
                  }}>
                    <Icon icon="tabler:edit" width="18" height="18" />
                  </Button>
                  <Button size="icon" variant="destructive" className="ml-1 min-h-[44px] min-w-[44px]" aria-label={t('confirm-to-delete')}
                    onClick={e => {
                      showTipsDialog({
                        size: 'sm',
                        title: t('confirm-to-delete'),
                        content: t('after-deletion-all-user-data-will-be-cleared-and-unrecoverable'),
                        onConfirm: async () => {
                          try {
                            await RootStore.Get(ToastPlugin).promise(
                              api.users.deleteUser.mutate({ id: i.id }),
                              {
                                loading: t('in-progress'),
                                success: <b>{t('your-changes-have-been-saved')}</b>,
                                error: (e) => <b>{e.message}</b>,
                              })
                            planinc.userList.call()
                            RootStore.Get(DialogStandaloneStore).close()
                          } catch (e) {
                            RootStore.Get(DialogStandaloneStore).close()
                          }
                        }
                      })
                    }}>
                    <Icon icon="tabler:trash" width="18" height="18" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div > : null
        }
      />
    </CollapsibleCard >
  );
});
