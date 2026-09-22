import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { useTranslation } from "react-i18next";
import { StorageState } from "@/store/standard/StorageState";
import { UserStore } from "@/store/user";
import { PromiseState } from "@/store/standard/PromiseState";
import { useTheme } from "next-themes";
import { api, reinitializeTrpcApi } from "@/lib/trpc";
import { GradientBackground } from "@/components/Common/GradientBackground";
import { signIn } from "@/components/Auth/auth-client";
import { useNavigate } from "react-router-dom";
import { Link } from 'react-router-dom';
import { savePlanIncEndpoint, getSavedEndpoint, getPlanIncEndpoint } from "@/lib/planincEndpoint";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { PlanIncStore } from "@/store/planincStore";

type OAuthProvider = {
  id: string;
  name: string;
  icon?: string;
};

export default function Component() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [endpoint, setEndpoint] = React.useState("");
  const [canRegister, setCanRegister] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loadingProvider, setLoadingProvider] = useState<string>('');
  const [isTauriEnv, setIsTauriEnv] = useState(false);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const planinc = RootStore.Get(PlanIncStore);

  useEffect(() => {
    planinc.config.call();
  }, []);

  useEffect(() => {
    const checkTauriEnv = async () => {
      try {
        const isTauri = !!(window as any).__TAURI__;
        setIsTauriEnv(isTauri);
      } catch (error) {
        setIsTauriEnv(false);
      }
    };

    checkTauriEnv();
  }, []);

  useEffect(() => {
    api.public.oauthProviders.query().then(providers => {
      setProviders(providers);
    });
  }, []);

  const SignIn = new PromiseState({
    function: async () => {
      try {
        if (isTauriEnv) {
          reinitializeTrpcApi();
        }
        const res = await signIn('credentials', {
          username: user || userStorage.value,
          password,
          callbackUrl: '/',
          redirect: false,
        });

        if (res?.requiresTwoFactor) {
          return res;
        }

        if (res?.ok) {
          navigate('/');
        }

        if (res?.error) {
          RootStore.Get(ToastPlugin).error(res.error);
        }

        return res;
      } catch (error) {
        console.error('SignIn error:', error);
        return { ok: false, error: 'Login failed' };
      }
    }
  });

  const userStorage = new StorageState({ key: 'username' });
  const endpointStorage = new StorageState({ key: 'planincEndpoint' });

  useEffect(() => {
    try {
      RootStore.Get(UserStore).canRegister.call().then(v => {
        setCanRegister(v ?? false);
      });
      if (userStorage.value) {
        setUser(userStorage.value);
      }
      if (getSavedEndpoint()) {
        setEndpoint(getSavedEndpoint());
      }
    } catch (error) {
      console.error('Storage error:', error);
    }
  }, []);

  const login = async () => {
    try {
      await SignIn.call();
      userStorage.setValue(user);

      if (isTauriEnv && endpoint) {
        savePlanIncEndpoint(endpoint);
      }
    } catch (error) {
      console.error('Login error:', error);
      RootStore.Get(ToastPlugin).error(t('login-failed'));
    }
  };

  return (
    <GradientBackground>
      <div className="flex h-full w-screen items-center justify-center p-2 sm:p-4 lg:p-8">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-large glass-effect px-8 pb-10 pt-6 shadow-large">
          <div className="flex items-center justify-center gap-2 pb-2 text-xl font-medium">
            Login With <img src={theme === 'light' ? '/logo-light-title.png' : '/logo-dark-title.png'} alt="PlanInc" width={100} className="rounded-none" />
          </div>

          {providers.length > 0 && (
            <>
              <div className="flex flex-col gap-4">
                {providers.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="w-full text-primary"
                    disabled={loadingProvider === provider.id}
                    onClick={() => {
                      setLoadingProvider(provider.id);
                      window.location.href = `${getPlanIncEndpoint()}api/auth/${provider.id}`;
                    }}
                  >
                    {provider.icon && <Icon icon={provider.icon} className="text-xl" />}
                    {t('sign-in-with-provider', { provider: provider.name })}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2 my-2">
                <Separator className="flex-1" />
                <span className="text-sm text-muted-foreground">{t('or')}</span>
                <Separator className="flex-1" />
              </div>
            </>
          )}

          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void login(); }}>
            {isTauriEnv && (
              <div className="space-y-1">
                <Label htmlFor="endpoint">{t('planinc-endpoint')}</Label>
                <Input
                  id="endpoint"
                  name="endpoint"
                  placeholder={t('enter-planinc-endpoint')}
                  type="text"
                  value={endpoint.replace(/"/g, '')}
                  onChange={e => {
                    setEndpoint(e.target.value?.trim().replace(/"/g, ''))
                    endpointStorage.save(e.target.value?.trim().replace(/"/g, ''))
                  }}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                id="username"
                name={t('username')}
                placeholder={t('enter-your-name')}
                type="text"
                value={user}
                onChange={e => setUser(e.target.value?.trim())}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  placeholder={t('enter-your-password')}
                  type={isVisible ? "text" : "password"}
                  value={password}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      login();
                    }
                  }}
                  onChange={e => setPassword(e.target.value?.trim())}
                />
                <button type="button" onClick={() => setIsVisible(!isVisible)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isVisible ? (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-closed-linear" />
                  ) : (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-bold" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between px-1 pl-2 pr-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox defaultChecked name="remember" />
                {t('keep-sign-in')}
              </label>
            </div>
            <Button
              onClick={login}
              disabled={SignIn.loading.value}
              className="w-full"
            >
              {SignIn.loading.value && <span className="mr-2 animate-spin">⏳</span>}
              {t('sign-in')}
            </Button>
          </form>
          {canRegister && (
            <p className="text-center text-small">
              {t('need-to-create-an-account')}&nbsp;
              <Link to="/signup">
                {t('sign-up')}
              </Link>
            </p>
          )}
          {planinc.config.value?.signinFooterEnabled &&
           planinc.config.value?.signinFooterText?.trim() && (
            <div className="mt-2 text-center max-w-full">
              <div className="text-xs text-muted-foreground break-words px-4">
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    p: ({node, ...props}) => <span {...props} />,
                    a: ({node, ...props}) => (
                      <a
                        {...props}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground underline"
                      />
                    ),
                    strong: ({node, ...props}) => <strong {...props} />,
                    em: ({node, ...props}) => <em {...props} />,
                    br: ({node, ...props}) => <br {...props} />
                  }}
                >
                  {planinc.config.value.signinFooterText}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </GradientBackground>
  );
}
