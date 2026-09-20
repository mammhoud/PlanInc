import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RootStore } from "@/store";
import { useTranslation } from "react-i18next";
import { DialogStore } from "@/store/module/Dialog";
import { api } from "@/lib/trpc";
import React, { useEffect, useState } from "react";
import { PromiseCall } from "@/store/standard/PromiseState";
import { eventBus } from "@/lib/event";


export const LinkAccountModal = observer(() => {
  const { t } = useTranslation();
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [password, setPassword] = useState("");
  const [accounts, setAccounts] = useState<{ id: number, name: string, nickname: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAccounts = async () => {
      const result = await api.users.nativeAccountList.query();
      setAccounts(result);
    };
    fetchAccounts();
  }, []);

  const handleLinkAccount = async () => {
    if (!selectedAccount || !password) return;
    setLoading(true);
    try {
      await PromiseCall(api.users.linkAccount.mutate({
        id: Number(selectedAccount),
        originalPassword: password
      }))
      RootStore.Get(DialogStore).close();
      eventBus.emit('user:signout')
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label>{t('select-account')}</Label>
        <Select
          value={selectedAccount}
          onValueChange={(value) => setSelectedAccount(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder={'username'} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={String(account.id)}>
                {account.nickname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>{t('password')}</Label>
        <Input
          type="password"
          placeholder={'12345678'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div role="alert" className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        {t('link-account-warning')}
      </div>

      <Button
        loading={loading}
        onClick={handleLinkAccount}
        className="mt-2"
      >
        {t('link-account')}
      </Button>
    </div>
  );
});
