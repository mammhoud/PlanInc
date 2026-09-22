import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from "@/store/root";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/trpc";
import { GradientBackground } from "@/components/Common/GradientBackground";
import { Link, useNavigate } from "react-router-dom";
export default function Component() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = React.useState(false);

  const toggleVisibility = () => setIsVisible(!isVisible);
  const toggleConfirmVisibility = () => setIsConfirmVisible(!isConfirmVisible);

  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <GradientBackground>
      <div className="flex h-full w-screen items-center justify-center p-2 sm:p-4 lg:p-8">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-large bg-card px-8 pb-10 pt-6 shadow-large">
          <p className="pb-4 text-left text-3xl font-semibold">
            {t('sign-up')}
            <span aria-label="emoji" className="ml-2" role="img">
              👋
            </span>
          </p>
          <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1">
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                required
                id="username"
                name="username"
                placeholder={t('enter-your-username')}
                type="text"
                value={user}
                onChange={e => setUser(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t('password')}</Label>
              <div className="relative">
                <Input
                  required
                  id="password"
                  name="password"
                  placeholder={t('enter-your-password')}
                  type={isVisible ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={toggleVisibility} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isVisible ? (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-closed-linear" />
                  ) : (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-bold" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">{t('confirm-password')}</Label>
              <div className="relative">
                <Input
                  required
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder={t('confirm-your-password')}
                  type={isConfirmVisible ? "text" : "password"}
                  value={password2}
                  onChange={e => setPassword2(e.target.value)}
                />
                <button type="button" onClick={toggleConfirmVisibility} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {isConfirmVisible ? (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-closed-linear" />
                  ) : (
                    <Icon className="pointer-events-none text-2xl text-muted-foreground" icon="solar:eye-bold" />
                  )}
                </button>
              </div>
            </div>
            <Button type="submit" onClick={async e => {
              if (!user || !password || !password2) {
                return RootStore.Get(ToastPlugin).error(t('required-items-cannot-be-empty'))
              }
              if (password != password2) {
                return RootStore.Get(ToastPlugin).error(t('the-two-passwords-are-inconsistent'))
              }
              try {
                await api.users.register.mutate({ name: user, password })
                RootStore.Get(ToastPlugin).success(t('create-successfully-is-about-to-jump-to-the-login'))
                setTimeout(() => {
                  navigate('/signin')
                }, 1000)
              } catch (error) {
                return RootStore.Get(ToastPlugin).error(error.message)
              }
            }}>
              {t('sign-up')}
            </Button>
          </form>
          <p className="text-center text-small">
            <Link to="/signin">
              {t('already-have-an-account-direct-login')}
            </Link>
          </p>
        </div>
      </div>
    </GradientBackground>
  );
}
