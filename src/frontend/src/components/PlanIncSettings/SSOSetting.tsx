import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Item } from "./Item"
import { RootStore } from "@/store"
import { PlanIncStore } from "@/store/planincStore"
import { PromiseState } from "@/store/standard/PromiseState"
import { api } from "@/lib/trpc"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Icon } from '@/components/Common/Iconify/icons'
import { DialogStore } from "@/store/module/Dialog"
import { CollapsibleCard } from "../Common/CollapsibleCard"
import { showTipsDialog } from "../Common/TipsDialog"
import { ToastPlugin } from "@/store/module/Toast/Toast"
import { DialogStandaloneStore } from "@/store/module/DialogStandalone"
import { ZOAuth2ProviderSchema } from "@shared/lib/types"
import { z } from "zod"
import { PasswordInput } from "../Common/PasswordInput"

const OAUTH_TEMPLATES = {
  custom: {
    id: 'custom',
    name: 'Custom Provider',
    icon: '',
    isCustom: true
  },
  github: {
    id: 'github',
    name: 'GitHub',
    icon: 'skill-icons:github-dark',
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: 'logos:google-icon',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'logos:facebook',
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    icon: 'vscode-icons:file-type-applescript',
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    icon: 'logos:spotify-icon',
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: 'logos:discord-icon',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter',
    icon: 'skill-icons:twitter',
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: 'logos:slack-icon',
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    icon: 'logos:twitch',
  },
  line: {
    id: 'line',
    name: 'LINE',
    icon: 'logos:line',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'skill-icons:instagram',
  },
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase',
    icon: 'cryptocurrency:cb',
  },
  yandex: {
    id: 'yandex',
    name: 'Yandex',
    icon: 'vscode-icons:file-type-yandex',
  },
} as const;

const UpdateSSOProvider = observer(({ provider }: { provider?: z.infer<typeof ZOAuth2ProviderSchema> }) => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    template: (provider ? (OAUTH_TEMPLATES[provider.id as keyof typeof OAUTH_TEMPLATES]?.id ?? 'custom') : 'custom') as keyof typeof OAUTH_TEMPLATES,
    id: provider?.id || '',
    name: provider?.name || '',
    icon: provider?.icon || '',
    wellKnown: provider?.wellKnown || '',
    scope: provider?.scope || '',
    authorizationUrl: provider?.authorizationUrl || '',
    tokenUrl: provider?.tokenUrl || '',
    userinfoUrl: provider?.userinfoUrl || '',
    clientId: provider?.clientId || '',
    clientSecret: provider?.clientSecret || '',
    upsertProvider: new PromiseState({
      function: async () => {
        const config = planinc.config.value || {}
        const providers = config.oauth2Providers || []
        const newProvider = {
          id: store.id,
          name: store.name,
          icon: store.icon,
          wellKnown: store.wellKnown,
          scope: store.scope,
          authorizationUrl: store.authorizationUrl,
          tokenUrl: store.tokenUrl,
          userinfoUrl: store.userinfoUrl,
          clientId: store.clientId,
          clientSecret: store.clientSecret,
        }

        const newProviders = provider
          ? providers.map(p => p.id === provider.id ? newProvider : p)
          : [...providers, newProvider]

        await api.config.update.mutate({
          key: 'oauth2Providers',
          value: newProviders
        })
        RootStore.Get(DialogStore).close()
        await planinc.config.call()
      }
    })
  }))

  const handleTemplateChange = (templateId: string) => {
    const template = OAUTH_TEMPLATES[templateId as keyof typeof OAUTH_TEMPLATES]
    if (template) {
      store.template = templateId as keyof typeof OAUTH_TEMPLATES
      store.id = template.id === 'custom' ? '' : template.id
      store.name = template.id === 'custom' ? '' : template.name
      store.icon = template.icon
    }
  }

  return <div className="flex flex-col gap-4">
    <Select
      value={store.template}
      onValueChange={handleTemplateChange}
    >
      <SelectTrigger>
        {store.icon && <Icon icon={store.icon} width="20" height="20" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(OAUTH_TEMPLATES).map(([key, template]) => (
          <SelectItem
            key={key}
            value={key}
          >
            <span className="flex items-center gap-2">
              {template.icon && <Icon icon={template.icon} width="20" height="20" />}
              {template.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

    {store.template === 'custom' && (
      <>
        <div className="space-y-1.5">
          <Label>{t('provider-id')}</Label>
          <Input
            placeholder="custom-provider"
            value={store.id}
            onChange={e => { store.id = e.target.value }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('provider-name')}</Label>
          <Input
            placeholder="Custom Provider"
            value={store.name}
            onChange={e => { store.name = e.target.value }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('provider-icon')}</Label>
          <div className="relative">
            {store.icon && <span className="absolute left-3 top-1/2 -translate-y-1/2"><Icon icon={store.icon} width="20" height="20" /></span>}
            <Input
              placeholder="logos:custom-icon"
              value={store.icon}
              onChange={e => { store.icon = e.target.value }}
              className={store.icon ? 'pl-10' : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground"><span className="flex items-center gap-2">
            {t('please-select-icon-from-iconify')}
            <br />
            <a className="text-blue-500" href="https://icon-sets.iconify.design/" target="_blank" rel="noopener noreferrer">Iconify</a>
          </span></p>
        </div>
        <div className="space-y-1.5">
          <Label>{t('well-known-url')}</Label>
          <Input
            placeholder="https://example.com/.well-known/openid-configuration"
            value={store.wellKnown}
            onChange={e => { store.wellKnown = e.target.value }}
          />
        </div>
        {!store.wellKnown && (
          <>
            <div className="space-y-1.5">
              <Label>{t('authorization-url')}</Label>
              <Input
                placeholder="https://example.com/oauth/authorize"
                value={store.authorizationUrl}
                onChange={e => { store.authorizationUrl = e.target.value }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('token-url')}</Label>
              <Input
                placeholder="https://example.com/oauth/token"
                value={store.tokenUrl}
                onChange={e => { store.tokenUrl = e.target.value }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('userinfo-url')}</Label>
              <Input
                placeholder="https://example.com/oauth/userinfo"
                value={store.userinfoUrl}
                onChange={e => { store.userinfoUrl = e.target.value }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('scope')}</Label>
              <Input
                placeholder="email profile"
                value={store.scope}
                onChange={e => { store.scope = e.target.value }}
              />
            </div>
          </>
        )}
      </>
    )}

    <div className="space-y-1.5">
      <Label>{t('client-id')}</Label>
      <Input
        placeholder="your-client-id"
        value={store.clientId}
        onChange={e => { store.clientId = e.target.value }}
      />
    </div>
    <PasswordInput
      label={t('client-secret')}
      placeholder="your-client-secret"
      value={store.clientSecret}
      onChange={e => { store.clientSecret = e.target.value }}
    />
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
      <p className="text-sm font-medium">{t('redirect-url')}</p>
      <p className="text-sm text-muted-foreground break-all">{`${window.location.origin}/api/auth/callback/${store.id || store.template}`}</p>
    </div>
    <div className="text-xs text-default-500 mt-1">
      {t('please-add-this-url-to-your-oauth-provider-settings')}
    </div>
    <div className="flex w-full mt-2">
      <Button
        loading={store.upsertProvider.loading.value}
        className="ml-auto"
        onClick={async () => {
          await store.upsertProvider.call()
        }}
      >
        {t('save')}
      </Button>
    </div>
  </div>
})

export const SSOSetting = observer(() => {
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  const providers = planinc.config.value?.oauth2Providers || []

  return (
    <CollapsibleCard
      icon="tabler:key"
      title={t('sso-settings')}
    >
      <Item
        leftContent={<>{t('oauth2-providers')}</>}
        rightContent={
          <Button
            size="sm"
            onClick={() => {
              RootStore.Get(DialogStore).setData({
                size: '2xl',
                isOpen: true,
                title: t('add-oauth2-provider'),
                content: <UpdateSSOProvider />
              })
            }}
          >
            <Icon icon="tabler:plus" width="18" height="18" />
            {t('add-provider')}
          </Button>
        }
      />

      <Item
        leftContent={
          <div className="mb-2 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">{t('provider-id')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('provider-name')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('provider-icon')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {providers.map(provider => (
                  <tr key={provider.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{provider.id}</td>
                    <td className="px-3 py-2">{provider.name}</td>
                    <td className="px-3 py-2">
                      {provider.icon && <Icon icon={provider.icon} width="20" height="20" />}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            RootStore.Get(DialogStore).setData({
                              isOpen: true,
                              title: t('edit-oauth2-provider'),
                              content: <UpdateSSOProvider provider={provider} />
                            })
                          }}
                        ><Icon icon="tabler:edit" width="18" height="18" /></Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="ml-2"
                          onClick={() => {
                            showTipsDialog({
                              size: 'sm',
                              title: t('confirm-to-delete'),
                              content: t('confirm-delete-provider'),
                              onConfirm: async () => {
                                try {
                                  const newProviders = providers.filter(p => p.id !== provider.id)
                                  await RootStore.Get(ToastPlugin).promise(
                                    api.config.update.mutate({
                                      key: 'oauth2Providers',
                                      value: newProviders
                                    }),
                                    {
                                      loading: t('in-progress'),
                                      success: <b>{t('your-changes-have-been-saved')}</b>,
                                      error: (e) => <b>{e.message}</b>,
                                    }
                                  )
                                  await planinc.config.call()
                                  RootStore.Get(DialogStandaloneStore).close()
                                } catch (e) {
                                  RootStore.Get(DialogStandaloneStore).close()
                                }
                              }
                            })
                          }}
                        ><Icon icon="tabler:trash" width="18" height="18" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
      />
    </CollapsibleCard>
  )
})
