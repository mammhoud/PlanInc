import { observer } from "mobx-react-lite";
import { Button, DropdownItem, DropdownMenu, DropdownTrigger, Dropdown, Input } from "@heroui/react";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { PromiseCall } from "@/store/standard/PromiseState";
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from "@/lib/trpc";
import { Item } from "./Item";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "usehooks-ts";
import { useEffect } from "react";
import { PasswordInput } from "@/components/Common/PasswordInput";
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";


export const StorageSetting = observer(() => {
  const isPc = useMediaQuery('(min-width: 768px)')
  const { t } = useTranslation()
  const planinc = RootStore.Get(PlanIncStore)
  const store = RootStore.Local(() => ({
    s3AccessKeyId: "",
    s3AccessKeySecret: "",
    s3Endpoint: "",
    s3Region: "",
    s3Bucket: "",
    s3CustomPath: "",
    localCustomPath: "",
  }))

  useEffect(() => {
    store.s3AccessKeyId = planinc.config.value?.s3AccessKeyId!
    store.s3AccessKeySecret = planinc.config.value?.s3AccessKeySecret!
    store.s3Endpoint = planinc.config.value?.s3Endpoint!
    store.s3Region = planinc.config.value?.s3Region!
    store.s3Bucket = planinc.config.value?.s3Bucket!
    store.s3CustomPath = planinc.config.value?.s3CustomPath!
    store.localCustomPath = planinc.config.value?.localCustomPath!
  }, [planinc.config.value])


  return <CollapsibleCard
    icon="tabler:brush"
    title={t('storage')}
  >
    <Item
      leftContent={<div className="flex flex-col gap-2">
        <div>{t('object-storage')}</div>
      </div>}
      rightContent={<div>
        <Dropdown>
          <DropdownTrigger>
            <Button startContent={<Icon icon="mdi:storage" width="20" height="20" />} color='primary' >
              {planinc.config.value?.objectStorage ?? t('local-file-system')}
            </Button>
          </DropdownTrigger>
          <DropdownMenu onAction={async (key) => {
            await PromiseCall(api.config.update.mutate({
              key: 'objectStorage',
              value: key.toString()
            }), { autoAlert: false })
          }}>
            <DropdownItem key="local">  {t('local-file-system')}</DropdownItem>
            <DropdownItem key="s3">S3</DropdownItem>
          </DropdownMenu>


        </Dropdown>
      </div>} />

    {planinc.config.value?.objectStorage != 's3' &&
      <Item
        leftContent={<>
          <div>{t('custom-path')}</div>
        </>}
        rightContent={<Input
          value={store.localCustomPath}
          onChange={e => store.localCustomPath = e.target.value}
          placeholder="/custom/path/"
          onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 'localCustomPath',
              value: e.target.value
            }), { autoAlert: false })
          }} />}
      />
    }

    {
      planinc.config.value?.objectStorage === 's3' && <>
        <Item
          leftContent={<>{t('access-key-id')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeyId}
            onChange={e => store.s3AccessKeyId = e.target.value}
            placeholder={t('access-key-id')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeyId',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
        <Item
          leftContent={<>{t('access-key-secret')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeySecret}
            onChange={e => store.s3AccessKeySecret = e.target.value}
            placeholder={t('access-key-secret')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeySecret',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
        <Item
          leftContent={<>{t('endpoint')}</>}
          rightContent={<Input value={store.s3Endpoint} onChange={e => store.s3Endpoint = e.target.value} placeholder="Endpoint" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Endpoint',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>{t('region')}</>}
          rightContent={<Input value={store.s3Region} onChange={e => store.s3Region = e.target.value} placeholder="Region" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Region',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>{t('bucket')}</>}
          rightContent={<Input value={store.s3Bucket} onChange={e => store.s3Bucket = e.target.value} placeholder="Bucket" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Bucket',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>
            <div>{t('custom-path')}</div>
          </>}
          rightContent={<Input
            value={store.s3CustomPath}
            onChange={e => store.s3CustomPath = e.target.value}
            placeholder="/custom/path/"
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3CustomPath',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
      </>
    }


  </CollapsibleCard>
})