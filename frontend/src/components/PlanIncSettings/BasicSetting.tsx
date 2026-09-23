import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RootStore } from "@/store";
import { Icon } from '@/components/Common/Iconify/icons';
import { UserStore } from "@/store/user";
import { useTranslation } from "react-i18next";
import { DialogStore } from "@/store/module/Dialog";
import { UpdateUserInfo, UpdateUserPassword } from "../Common/UpdateUserInfo";
import { Item } from "./Item";
import { Copy } from "../Common/Copy";
import { MarkdownRender } from "../Common/MarkdownRender";
import { PromiseCall, PromiseState } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { PlanIncStore } from "@/store/planincStore";
import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShowGen2FATokenModal } from "../Common/TwoFactorModal/gen2FATokenModal";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { eventBus } from "@/lib/event";
import { LinkAccountModal } from "../Common/Modals/LinkAccountModal";
import { showTipsDialog } from "../Common/TipsDialog";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { UploadFileWrapper } from "../Common/UploadFile";
import Avatar from "boring-avatars";
import { signOut } from "../Auth/auth-client";
import { getPlanIncEndpoint } from "@/lib/planincEndpoint";

export const BasicSetting = observer(() => {
  const user = RootStore.Get(UserStore)
  const CODE = `curl -X 'POST' '${getPlanIncEndpoint() ?? window.location.origin}api/v1/note/upsert' \\\n      -H 'Content-Type: application/json' \\\n      -H 'Authorization: Bearer ${user.userInfo.value?.token}' \\\n      -d '{ "content": "🎉Hello,PlanInc! --send from api ", "type":0 }'\n`
  const CODE_SNIPPET = `\`\`\`javascript\n //planinc api document:${getPlanIncEndpoint() ?? window.location.origin}/api-doc\n ${CODE} \`\`\``
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)

  const store = RootStore.Local(() => ({
    webhookEndpoint: '',
    totpToken: '',
    showToken: false,
    showQRCode: false,
    totpSecret: '',
    qrCodeUrl: '',
    showLowPermToken: false,
    lowPermToken: '',
    setShowToken(value: boolean) {
      this.showToken = value;
    },
    setShowQRCode(value: boolean) {
      this.showQRCode = value;
    },
    setTotpSecret(value: string) {
      this.totpSecret = value;
    },
    setQrCodeUrl(value: string) {
      this.qrCodeUrl = value;
    },
    setShowLowPermToken(value: boolean) {
      this.showLowPermToken = value;
    },
    setLowPermToken(value: string) {
      this.lowPermToken = value;
    },
    setRigster: new PromiseState({
      function: async (value: boolean) => {
        return await PromiseCall(api.config.update.mutate({
          key: 'isAllowRegister',
          value
        }))
      }
    }),
    genLowPermToken: new PromiseState({
      function: async () => {
        const response = await PromiseCall(api.users.genLowPermToken.mutate());
        return response;
      }
    }),
  }))

  useEffect(() => {
    store.webhookEndpoint = planinc.config.value?.webhookEndpoint ?? ''
  }, [planinc.config.value])

  return (
    <CollapsibleCard
      icon="tabler:settings"
      title={t('basic-information')}
    >
      <Item
        leftContent={<>{t('name')}</>}
        rightContent={
          <div className="flex flex-wrap gap-2 items-center">
            <div className="text-desc">{user.name}</div>
            <div className="relative group">
              <UploadFileWrapper
                acceptImage
                onUpload={async ({ filePath }) => {
                  if (!user.userInfo.value?.id) return
                  await PromiseCall(api.users.upsertUser.mutate({
                    id: user.userInfo.value?.id,
                    image: filePath
                  }));
                  await user.userInfo.call(Number(user.id))
                  await signOut({ callbackUrl: '/signin' })
                  eventBus.emit('user:signout')
                }}
              >
                {user.userInfo.value?.image ? (
                  <img
                    src={getPlanIncEndpoint(`${user.userInfo.value.image}?token=${user.tokenData.value?.token}`)}
                    alt="avatar"
                    className="w-10 h-10 rounded-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                  />
                ) : (
                  <img src="/planinc-mark.svg" width={30} alt="logo" />
                )}
              </UploadFileWrapper>
            </div>

            <Button variant="ghost" size="icon" onClick={e => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  title: t('change-user-info'),
                  content: <UpdateUserInfo />
                })
              }}><Icon icon="tabler:edit" width="20" height="20" /></Button>
            <Button variant="ghost" size="icon" onClick={e => {
                RootStore.Get(DialogStore).setData({
                  title: t('rest-user-password'),
                  isOpen: true,
                  content: <UpdateUserPassword />
                })
              }}><Icon icon="material-symbols:password" width="20" height="20" /></Button>
            {
              user.userInfo?.value?.loginType == 'oauth' &&
              <Button variant="ghost" size="icon" onClick={e => {
                  RootStore.Get(DialogStore).setData({
                    title: t('link-account'),
                    isOpen: true,
                    size: 'md',
                    content: <LinkAccountModal />
                  })
                }}><Icon icon="tabler:link" width="20" height="20" /></Button>
            }

            {
              user.userInfo?.value?.isLinked &&
              <Button variant="destructive" size="icon" onClick={e => {
                  showTipsDialog({
                    title: t('unlink-account'),
                    content: t('unlink-account-tips'),
                    onConfirm: async () => {
                      await PromiseCall(api.users.unlinkAccount.mutate({
                        id: user.userInfo.value!.id
                      }))
                      eventBus.emit('user:signout')
                      RootStore.Get(DialogStandaloneStore).close()
                    }
                  })
                }}><Icon icon="hugeicons:unlink-03" width="20" height="20" /></Button>
            }
          </div>
        }
      />

      <Item
        leftContent={
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div>{t('access-token')}</div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  store.setShowToken(!store.showToken)
                }}
              >
                <Icon
                  icon={store.showToken ? "mdi:eye-off" : "mdi:eye"}
                  width="20"
                  height="20"
                />
              </Button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="text-xs text-yellow-500 cursor-pointer"
                  onClick={async () => {
                    const response = await store.genLowPermToken.call();
                    if (response?.token) {
                      RootStore.Get(DialogStore).setData({
                        isOpen: true,
                        title: t('generate-low-permission-token'),
                        content: (
                          <div className="flex flex-col gap-4">
                            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                              <p className="text-sm font-medium">{t('this-token-is-only-displayed-once-please-save-it-properly')}</p>
                              <p className="text-sm text-muted-foreground">{t('low-permission-token-desc')}</p>
                            </div>
                            <div className="relative">
                              <Input
                                readOnly
                                className="w-full pr-10"
                                value={response.token}
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Copy size={20} content={response.token} /></span>
                            </div>
                          </div>
                        )
                      });
                    }
                  }}
                >
                  {t('generate-low-permission-token')}
                </div>
              </TooltipTrigger>
              <TooltipContent><div className="text-sm max-w-[calc(100vw-3rem)] sm:max-w-[300px] break-words">{t('low-permission-token-desc')}</div></TooltipContent>
            </Tooltip>
          </div>
        }
        rightContent={
          <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
            <div className="relative w-full sm:w-[300px] min-w-0">
              <Input
                disabled
                className="w-full pr-10"
                value={store.showToken ? user.userInfo.value?.token : '••••••••••••••••'}
                type={store.showToken ? "text" : "password"}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Copy size={20} content={user.userInfo.value?.token ?? ''} /></span>
            </div>

            <Icon
              className="cursor-pointer hover:rotate-180 !transition-all"
              onClick={async () => {
                await PromiseCall(api.users.regenToken.mutate())
                console.log('user.id', user.id);
                user.userInfo.call(Number(user.id))
              }}
              icon="fluent:arrow-sync-12-filled"
              width="20"
              height="20"
            />
          </div>
        }
      />

      {
        <AnimatePresence>
          {store.showToken && (
            <motion.div
              initial={{ height: 0, opacity: 0, scale: 0.95 }}
              animate={{
                height: "auto",
                opacity: 1,
                scale: 1,
              }}
              exit={{
                height: 0,
                opacity: 0,
                scale: 0.95
              }}
              transition={{
                duration: 0.3,
                ease: [0.23, 1, 0.32, 1],
                scale: {
                  type: "spring",
                  damping: 15,
                  stiffness: 300
                }
              }}
            >
              <Item
                leftContent={
                  <div className="w-full flex-1 relative min-w-0 overflow-x-auto">
                    <Copy size={20} content={CODE} className="absolute top-4 right-2" />
                    <MarkdownRender content={CODE_SNIPPET} />
                  </div>
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      }

      {
        user.role == 'superadmin' &&
        <Item
          leftContent={<>{t('allow-register')}</>}
          rightContent={<Switch
            disabled={store.setRigster.loading.value}
            checked={user.canRegister.value}
            onCheckedChange={async checked => {
              await store.setRigster.call(checked)
              user.canRegister.call()
            }}
          />} />
      }

      {
        user.role == 'superadmin' &&
        <Item
          leftContent={<>Webhook</>}
          rightContent={<>
            <Input
              placeholder="Enter webhook URL"
              value={store.webhookEndpoint}
              onChange={(e) => store.webhookEndpoint = e.target.value}
              onBlur={async () => {
                await PromiseCall(api.config.update.mutate({
                  key: 'webhookEndpoint',
                  value: store.webhookEndpoint
                }))
              }}
              className="w-full sm:w-[300px] break-all"
            />
          </>} />
      }

      <Item
        leftContent={<>{t('hide-pc-editor')}</>}
        rightContent={
          <div className="flex gap-2 items-center">
            <Switch
              checked={planinc.config.value?.hidePcEditor ?? false}
              onCheckedChange={async (checked) => {
                await PromiseCall(api.config.update.mutate({
                  key: 'hidePcEditor',
                  value: checked
                }));
                planinc.config.call();
              }}
            />
          </div>
        }
      />

      <Item
        leftContent={<>{t('two-factor-authentication')}</>}
        rightContent={
          <div className="flex gap-2 items-center">
            <Switch
              checked={planinc.config.value?.twoFactorEnabled ?? false}
              onCheckedChange={async (checked) => {
                if (!checked) {
                  await PromiseCall(api.config.update.mutate({
                    key: 'twoFactorEnabled',
                    value: false
                  }));
                  planinc.config.call();
                } else {
                  const response = await PromiseCall(api.users.generate2FASecret.mutate({
                    name: user.name!
                  }), { autoAlert: false });
                  if (response) {
                    ShowGen2FATokenModal({
                      qrCodeUrl: response.qrCode,
                      totpSecret: response.secret
                    })
                  }
                }
              }}
            />
          </div>
        }
      />

      <Item
        leftContent={<></>}
        rightContent={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="destructive" onClick={async () => {
                await signOut({ callbackUrl: '/signin' })
                eventBus.emit('user:signout')
              }}><Icon icon="hugeicons:logout-05" width="20" height="20" /></Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('logout')}</TooltipContent>
          </Tooltip>
        } />
    </CollapsibleCard>
  );
})
