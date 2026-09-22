import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RootStore } from '@/store';
import { PlanIncStore } from '@/store/planincStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { Item, ItemWithTooltip } from './Item';
import { useEffect, useState } from 'react';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { useSideNav } from '@/platform/PlatformProvider';

export const HttpProxySetting = observer(() => {
  const planinc = RootStore.Get(PlanIncStore);
  const { t } = useTranslation();
  const isPc = useSideNav();
  const [testUrl, setTestUrl] = useState('https://www.google.com');
  const [testingProxy, setTestingProxy] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    responseTime?: number;
    statusCode?: number;
    error?: string;
  }>({});

  const store = RootStore.Local(() => ({
    isUseHttpProxy: false,
    httpProxyHost: '',
    httpProxyPort: 0,
    httpProxyUsername: '',
    httpProxyPassword: '',
    isProxyPasswordVisible: false,
  }));

  useEffect(() => {
    store.isUseHttpProxy = planinc.config.value?.isUseHttpProxy!;
    store.httpProxyHost = planinc.config.value?.httpProxyHost!;
    store.httpProxyPort = planinc.config.value?.httpProxyPort! || 0;
    store.httpProxyUsername = planinc.config.value?.httpProxyUsername!;
    store.httpProxyPassword = planinc.config.value?.httpProxyPassword!;
  }, [planinc.config.value]);

  const testHttpProxy = async () => {
    setTestingProxy(true);
    setTestResult({});

    try {
      const result = await api.public.testHttpProxy.mutate({
        url: testUrl
      });

      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Error testing proxy',
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTestingProxy(false);
    }
  };

  return (
    <CollapsibleCard icon="tabler:cloud-network" title={t('http-proxy')}>
      <Item
        leftContent={
          <ItemWithTooltip
          content={<>{t('use-http-proxy')}</>}
          toolTipContent={
            <div className="w-[300px]">{t('enable-http-proxy-for-accessing-github-or-ai-api-endpoints')}</div>
          }
          />
        }
        rightContent={
          <Switch
            checked={store.isUseHttpProxy}
            onCheckedChange={(checked) => {
              PromiseCall(
                api.config.update.mutate({
                  key: 'isUseHttpProxy',
                  value: checked,
                }),
                { autoAlert: false },
              );
            }}
          />
        }
      />

      {store.isUseHttpProxy && (
        <>
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <div>{t('proxy-host')}</div>
                <div className="text-tiny text-default-400">
                  {t('ip-address-or-hostname-for-proxy-server')}
                </div>
              </div>
            }
            rightContent={
              <Input
                type="text"
                placeholder="127.0.0.1"
                className="w-full max-w-[300px]"
                value={store.httpProxyHost ?? ''}
                onBlur={(e) => {
                  let value = e.target.value;
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'httpProxyHost',
                      value: value,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(e) => {
                  store.httpProxyHost = e.target.value;
                }}
              />
            }
          />

          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <div>{t('proxy-port')}</div>
                <div className="text-tiny text-default-400">{t('port-number-for-proxy-server')}</div>
              </div>
            }
            rightContent={
              <Input
                type="number"
                placeholder="8080"
                className="w-full max-w-[300px]"
                value={store.httpProxyPort ? store.httpProxyPort.toString() : ''}
                onBlur={(e) => {
                  const portNumber = parseInt(e.target.value);
                  store.httpProxyPort = isNaN(portNumber) ? 0 : portNumber;
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'httpProxyPort',
                      value: isNaN(portNumber) ? null : portNumber,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(e) => {
                  store.httpProxyPort = parseInt(e.target.value);
                }}
              />
            }
          />

          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <div>{t('proxy-username')}</div>
                <div className="text-tiny text-default-400">{t('optional-username-for-authenticated-proxy')}</div>
              </div>
            }
            rightContent={
              <Input
                type="text"
                placeholder={t('optional')}
                className="w-full max-w-[300px]"
                value={store.httpProxyUsername ?? ''}
                onBlur={(e) => {
                  store.httpProxyUsername = e.target.value;
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'httpProxyUsername',
                      value: store.httpProxyUsername,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(e) => {
                  store.httpProxyUsername = e.target.value;
                }}
              />
            }
          />

          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <div>{t('proxy-password')}</div>
                <div className="text-tiny text-default-400">{t('optional-password-for-authenticated-proxy')}</div>
              </div>
            }
            rightContent={
              <div className="relative w-full max-w-[300px]">
                <Input
                  type={store.isProxyPasswordVisible ? 'text' : 'password'}
                  placeholder={t('optional')}
                  className="w-full pr-10"
                  value={store.httpProxyPassword ?? ''}
                  onBlur={(e) => {
                    store.httpProxyPassword = e.target.value;
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'httpProxyPassword',
                        value: store.httpProxyPassword,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  onChange={(e) => {
                    store.httpProxyPassword = e.target.value;
                  }}
                />
                <button
                  className="focus:outline-none absolute right-3 top-1/2 -translate-y-1/2"
                  type="button"
                  onClick={() => {
                    store.isProxyPasswordVisible = !store.isProxyPasswordVisible;
                  }}
                >
                  {store.isProxyPasswordVisible ? (
                    <Icon icon="solar:eye-closed-linear" className="text-2xl pointer-events-none" />
                  ) : (
                    <Icon icon="solar:eye-linear" className="text-2xl pointer-events-none" />
                  )}
                </button>
              </div>
            }
          />

          <Item
            type="col"
            leftContent={
              <div className="flex flex-col gap-1 w-full">
                <div className="flex items-center gap-2">
                  <ItemWithTooltip
                    content={<>{t('test-proxy-connection')}</>}
                    toolTipContent={
                      <div className="w-[300px]">
                        {t('test-if-the-proxy-is-working-correctly')}
                      </div>
                    }
                  />
                </div>
                <div className="flex flex-col gap-3 mt-2 w-full">
                  <div className="flex gap-2 w-full">
                    <Input
                      type="text"
                      placeholder="https://www.google.com"
                      className="w-full"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      disabled={testingProxy}
                    />
                    <Button
                      loading={testingProxy}
                      onClick={testHttpProxy}
                      disabled={!store.isUseHttpProxy || !store.httpProxyHost || testingProxy}
                    >
                      {t('test')}
                    </Button>
                  </div>

                  {Object.keys(testResult).length > 0 && (
                    <div className={`p-3 rounded-lg mt-2 ${testResult.success ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}>
                      <div className="flex items-center gap-2">
                        {testResult.success
                          ? <Icon icon="mdi:check-circle" width="20" height="20" />
                          : <Icon icon="mdi:alert-circle" width="20" height="20" />
                        }
                        <span className="font-medium">{testResult.message}</span>
                      </div>
                      {testResult.responseTime !== undefined && testResult.responseTime >= 0 && (
                        <div className="text-sm mt-1">
                          {t('response-time')}: {testResult.responseTime}ms
                        </div>
                      )}
                      {testResult.statusCode !== undefined && (
                        <div className="text-sm mt-1">
                          {t('status-code')}: {testResult.statusCode}
                        </div>
                      )}
                      {testResult.error && (
                        <div className="text-sm mt-1 overflow-auto max-h-[100px]">
                          {t('error')}: {testResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            }
          />
        </>
      )}
    </CollapsibleCard>
  );
});
