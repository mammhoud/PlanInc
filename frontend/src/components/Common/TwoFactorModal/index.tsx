import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from "@/store";
import { DialogStore } from "@/store/module/Dialog";

interface TwoFactorModalProps {
  onConfirm: (code: string) => void;
  isLoading: boolean;
}

export function TwoFactorModal({ onConfirm, isLoading }: TwoFactorModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setCode(next);
    if (next.length === 6) {
      onConfirm(next);
    }
  };
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10">
      <Icon icon="hugeicons:authorized" width="30" height="30" />
      <p className="text-xl font-bold">
        {t('enter-code-shown-on-authenticator-app')}
      </p>
      <div className="text-desc text-xs text-center">{t('open-your-third-party-authentication-app-and-enter-the-codeshown-on-screen')}</div>
      <Input
        className="mt-2 text-center text-lg tracking-[0.5em]"
        maxLength={6}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="······"
        value={code}
        onChange={handleChange} />
      <Button className="mt-4" loading={isLoading} onClick={() => code.length === 6 && onConfirm(code)}>{t('sign-in')}</Button>
    </div>
  );
}


export const ShowTwoFactorModal = (onConfirm: (code: string) => void, isLoading: boolean) => {
  console.log('ShowTwoFactorModal', onConfirm, isLoading);
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: 'lg',
    content: <TwoFactorModal onConfirm={onConfirm} isLoading={isLoading} />
  })
}
