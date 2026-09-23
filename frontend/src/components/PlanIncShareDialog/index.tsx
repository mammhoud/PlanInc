import { observer } from "mobx-react-lite";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import dayjs from "@/lib/dayjs";
import { useEffect } from "react";
import { Icon } from '@/components/Common/Iconify/icons';
import { motion, AnimatePresence } from "framer-motion";
import { RootStore } from "@/store";
import { PlanIncStore } from "@/store/planincStore";
import { useTranslation } from "react-i18next";
import { DialogStore } from "@/store/module/Dialog";
import { Copy } from "../Common/Copy";
import { api } from "@/lib/trpc";
import { PublicUser } from "@/lib/apiTypes";
import { UserStore } from "@/store/user";
import { getPlanIncEndpoint } from "@/lib/planincEndpoint";


interface ShareDialogProps {
  defaultSettings: ShareSettings;
  shareUrl?: string;
}

export interface ShareSettings {
  expiryDate?: Date;
  password?: string;
  shareUrl?: string;
  isShare?: boolean;
  internalShareUserIds?: number[];
}

interface User {
  id: number;
  name: string;
  nickname: string;
  image: string;
  canEdit?: boolean;
}

const expiryOptions = [
  { key: "never", label: ("permanent-valid") },
  { key: "7days", label: ("7days-expiry") },
  { key: "30days", label: ("30days-expiry") },
  { key: "custom", label: ("custom-expiry") },
];

const generateRandomPassword = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const PlanIncShareDialog = observer(({ defaultSettings }: ShareDialogProps) => {
  const { t } = useTranslation();

  const store = RootStore.Local(() => ({
    settings: (() => {
      const initialPassword = defaultSettings.shareUrl ? defaultSettings.password : generateRandomPassword();
      return {
        ...defaultSettings,
        password: initialPassword
      };
    })(),
    expiryType: defaultSettings.expiryDate ? "custom" : "never",
    isPublic: defaultSettings.password ? false : true,
    isShare: defaultSettings.isShare ?? false,
    selectedTab: "public",
    shareUrl: defaultSettings?.shareUrl ?? '',
    isCalendarOpen: false,
    teamMembers: [] as PublicUser[],
    selectedUserIds: defaultSettings.internalShareUserIds || [] as number[],
    isLoadingUsers: false,
    inviteEmail: '',
    inviteMessage: '',
    statusMessage: '',
    inviteUrl: '',
    pendingApprovals: [] as { id: number; scope: string; status: string; inviteeEmail: string | null }[],

    get selectedExpiryValue() {
      if (this.expiryType === "never") return t("permanent-valid");
      if (this.settings.expiryDate) {
        return dayjs(this.settings.expiryDate).format('YYYY-MM-DD');
      }
      return t("select-expiry-time");
    },

    setSettings(newSettings: Partial<ShareSettings>) {
      this.settings = { ...this.settings, ...newSettings };
    },

    setExpiryType(type: string) {
      this.expiryType = type;
    },

    setIsPublic(value: boolean) {
      this.isPublic = value;
    },

    setIsShare(value: boolean) {
      this.isShare = value;
    },

    setSelectedTab(tab: string) {
      this.selectedTab = tab;
    },

    setInviteEmail(value: string) {
      this.inviteEmail = value;
    },

    setInviteMessage(value: string) {
      this.inviteMessage = value;
    },

    setStatusMessage(value: string) {
      this.statusMessage = value;
    },

    setInviteUrl(value: string) {
      this.inviteUrl = value;
    },

    setPendingApprovals(rows: { id: number; scope: string; status: string; inviteeEmail: string | null }[]) {
      this.pendingApprovals = rows;
    },

    async loadApprovals() {
      const noteId = RootStore.Get(PlanIncStore).curSelectedNote?.id;
      if (!noteId) return;
      try {
        const rows = await api.shareApprovals.forNote.query({ noteId });
        this.setPendingApprovals(rows.map((row: any) => ({
          id: row.id,
          scope: row.scope,
          status: row.status,
          inviteeEmail: row.inviteeEmail,
        })));
      } catch (error) {
        this.setPendingApprovals([]);
      }
    },

    async sendEmailInvite() {
      const noteId = RootStore.Get(PlanIncStore).curSelectedNote?.id;
      if (!noteId || !this.inviteEmail.trim()) return;
      try {
        const origin = getPlanIncEndpoint() ?? window.location.origin;
        const res = await api.shareApprovals.inviteByEmail.mutate({
          noteId,
          email: this.inviteEmail.trim(),
          canEdit: true,
          message: this.inviteMessage,
          origin,
        });
        this.setInviteUrl(res?.url ?? '');
        this.setStatusMessage(
          res?.delivered
            ? t('invite-sent')
            : t('invite-created-copy-link'),
        );
        this.setIsShare(true);
        await this.loadApprovals();
      } catch (error) {
        this.setStatusMessage((error as Error)?.message ?? t('operation-failed'));
      }
    },

    setShareUrl(url: string) {
      this.shareUrl = url;
    },

    setIsCalendarOpen(value: boolean) {
      this.isCalendarOpen = value;
    },

    setTeamMembers(members: PublicUser[]) {
      this.teamMembers = members;
    },

    setSelectedUserIds(ids: number[]) {
      this.selectedUserIds = ids;
    },

    setIsLoadingUsers(value: boolean) {
      this.isLoadingUsers = value;
    },

    handleExpiryChange(type: string) {
      this.setExpiryType(type);
      if (type === "never") {
        this.setSettings({ expiryDate: undefined });
      } else if (type === "7days") {
        this.setSettings({
          expiryDate: dayjs().add(7, 'days').toDate()
        });
      } else if (type === "30days") {
        this.setSettings({
          expiryDate: dayjs().add(30, 'days').toDate()
        });
      } else {
        this.setSettings({
          expiryDate: this.settings.expiryDate || dayjs().add(1, 'day').toDate()
        });
        this.setIsCalendarOpen(true);
      }
    },

    handleUserToggle(userId: number) {
      const index = this.selectedUserIds.indexOf(userId);
      if (index !== -1) {
        this.setSelectedUserIds(this.selectedUserIds.filter(id => id !== userId));
      } else {
        this.setSelectedUserIds([...this.selectedUserIds, userId]);
      }
    },

    async handleCreateShare() {
      const noteId = RootStore.Get(PlanIncStore).curSelectedNote!.id!;
      this.setStatusMessage('');

      try {
        if (this.selectedTab === "public") {
          const res = await api.shareApprovals.requestPublic.mutate({
            noteId,
            password: this.isPublic ? "" : this.settings.password,
            expireAt: this.settings.expiryDate ?? null,
            message: this.inviteMessage,
          });

          if (res?.published) {
            const planincEndpoint = getPlanIncEndpoint() ?? window.location.origin;
            this.setShareUrl(planincEndpoint + 'share/' + (res?.shareUrl ?? '') + (this.isPublic ? '' : '?password=' + (this.settings.password ?? '')));
          } else {
            this.setStatusMessage(t('share-pending-admin-approval'));
          }
          this.setIsShare(true);
        }
        else if (this.selectedTab === "internal") {
          await api.shareApprovals.requestInternal.mutate({
            noteId,
            accountIds: this.selectedUserIds,
            canEdit: true,
            message: this.inviteMessage,
          });
          this.setStatusMessage(t('share-request-sent'));
          this.setIsShare(true);
        }

        await this.loadApprovals();
      } catch (error) {
        this.setStatusMessage((error as Error)?.message ?? t('operation-failed'));
      }
    },

    async handleCancelShare() {
      const noteId = RootStore.Get(PlanIncStore).curSelectedNote!.id!;

      for (const row of this.pendingApprovals) {
        if (row.status === 'pending') {
          try {
            await api.shareApprovals.revoke.mutate({ id: row.id });
          } catch (error) {
            console.error('Failed to revoke share request', error);
          }
        }
      }

      if (this.selectedTab === "public") {
        await RootStore.Get(PlanIncStore).shareNote.call({ id: noteId, isCancel: true });
      }
      else if (this.selectedTab === "internal") {
        await RootStore.Get(PlanIncStore).internalShareNote.call({
          id: noteId,
          accountIds: this.selectedUserIds,
          isCancel: true
        });
      }

      this.setIsShare(false);
      RootStore.Get(DialogStore).close();
    },

    async loadTeamMembers() {
      this.setIsLoadingUsers(true);
      try {
        const users = await api.users.publicUserList.query();
        this.setTeamMembers(users.filter(user => user.id !== RootStore.Get(UserStore).userInfo.value?.id));
        const sharedUsers = await RootStore.Get(PlanIncStore).getInternalSharedUsers.call(
          RootStore.Get(PlanIncStore).curSelectedNote!.id!
        );
        console.log(sharedUsers, 'sharedUsers')
        if (sharedUsers) {
          this.setSelectedUserIds(sharedUsers.map(user => user.id));
        }
      } catch (error) {
        this.setTeamMembers([]);
      } finally {
        this.setIsLoadingUsers(false);
      }
    }
  }));

  useEffect(() => {
    if (store.selectedTab === "internal") {
      store.loadTeamMembers();
    }
  }, [store.selectedTab]);

  useEffect(() => {
    void store.loadApprovals();
  }, []);

  return (
    <Card className="flex flex-col gap-2 p-2 border-none shadow-none">
      <div className="w-full mb-2">
        <div className="flex p-1 gap-2">
          <Button
            variant={store.selectedTab === "public" ? "default" : "ghost"}
            className={`py-2 px-4 font-medium text-sm flex items-center gap-2 rounded-lg transition-colors`}
            onClick={() => store.setSelectedTab("public")}
          >
            <Icon icon="mdi:public" width="20" height="20" />
            {t("public-share")}
          </Button>
          <Button
            variant={store.selectedTab === "internal" ? "default" : "ghost"}
            className={`py-2 px-4 font-medium text-sm flex items-center gap-2 rounded-lg transition-colors`}
            onClick={() => store.setSelectedTab("internal")}
          >
            <Icon icon="material-symbols:public-off" width="20" height="20" />
            {t("internal-share")}
          </Button>
        </div>
      </div>

      {store.selectedTab === "public" && (
        <div className="flex flex-col">
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-center gap-2 ">
              <span className="text-muted-foreground font-medium">{t("expiry-time")}</span>
              <AnimatePresence mode="wait">
                {store.settings.expiryDate && (
                  <motion.div
                    className="ml-auto bg-[#FEF4D5] text-sm text-[#F68C06] px-2 py-1 rounded-full flex items-center gap-2"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Icon icon="lets-icons:clock" className="text-[#F68C06]" width="20" height="20" />
                    {dayjs(store.settings.expiryDate).fromNow()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-2 mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start"
                  >
                    <Icon icon="solar:calendar-bold" className="text-muted-foreground" width="20" height="20" />
                    {store.selectedExpiryValue}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {expiryOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.key}
                      onSelect={() => store.handleExpiryChange(option.key)}
                    >
                      {t(option.label)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {store.expiryType === "custom" && (
                <Popover
                  open={store.isCalendarOpen}
                  onOpenChange={(open) => store.setIsCalendarOpen(open)}
                >
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <Icon icon="solar:calendar-mark-bold" className="text-muted-foreground" width="20" height="20" />
                      {store.settings.expiryDate ? dayjs(store.settings.expiryDate).format('YYYY-MM-DD') : t("select-date")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="p-1 w-auto">
                    <input
                      type="date"
                      className="border-none bg-transparent text-sm p-2 outline-none"
                      min={dayjs().add(1, 'day').format('YYYY-MM-DD')}
                      value={store.settings.expiryDate ? dayjs(store.settings.expiryDate).format('YYYY-MM-DD') : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          store.setSettings({
                            expiryDate: new Date(e.target.value)
                          });
                          store.setIsCalendarOpen(false);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">{t("access-password")}</span>
              <span className="text-muted-foreground text-sm">{t("protect-your-shared-content")}</span>
              <Switch
                className="ml-auto"
                checked={!store.isPublic}
                onCheckedChange={(checked) => {
                  store.setIsPublic(!checked);
                  if (checked) {
                    store.setSettings({ password: generateRandomPassword() });
                  }
                }}
              />
            </div>
            <div className="flex w-full justify-center items-center">
              {!store.isPublic && (
                <Input
                  type="password"
                  maxLength={6}
                  placeholder={t("set-access-password")}
                  value={store.settings.password ?? ''}
                  onChange={(e) => store.setSettings({ password: e.target.value })}
                />
              )}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {
              store.shareUrl && (
                <motion.div
                  className="flex flex-col gap-2 mt-4"
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-muted-foreground font-medium">{t("share-link")}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={store.shareUrl}
                      readOnly
                    />
                    <Copy content={store.shareUrl} size={24} />
                  </div>
                </motion.div>
              )
            }
          </AnimatePresence>
        </div>
      )}

      {store.selectedTab === "internal" && (
        <div className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-2">
            {store.isLoadingUsers ? (
              <div className="flex justify-center p-4">
                <Icon icon="line-md:loading-twotone-loop" className="text-primary" width="24" height="24" />
              </div>
            ) : (
              store.teamMembers.length === 0 ? (
                <div className="text-center text-muted-foreground p-4">
                  {t("no-team-members-found")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {store.teamMembers.map(user => (
                    <div key={user.id} className="cursor-pointer flex items-center p-2 hover:bg-muted rounded-md" onClick={() => store.handleUserToggle(user.id)}>
                      <Checkbox
                        checked={store.selectedUserIds.includes(user.id)}
                        onCheckedChange={() => store.handleUserToggle(user.id)}
                      />
                      <Avatar className="ml-2">
                        <AvatarImage src={user.image ?? undefined} alt={user.nickname || user.name} />
                        <AvatarFallback>{(user.nickname || user.name).charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="ml-3">
                        <p className="text-sm font-bold">{user.nickname.toUpperCase() || user.name.toUpperCase()}</p>
                      </div>
                      <Badge variant="warning" className="ml-auto">
                        {user.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground font-medium">{t("invite-by-email")}</span>
            <span className="text-muted-foreground text-sm">{t("invite-by-email-description")}</span>
            <div className="space-y-1">
              <Label>{t("email")}</Label>
              <Input
                type="email"
                value={store.inviteEmail}
                onChange={(e) => store.setInviteEmail(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              disabled={!store.inviteEmail.includes('@')}
              onClick={store.sendEmailInvite}
            >
              <Icon icon="mdi:email-lock-outline" width="18" height="18" />
              {t("send-invite")}
            </Button>
          </div>

          {store.selectedUserIds.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground font-medium">{t("selected-users")}</span>
              <div className="flex -space-x-2">
                {store.teamMembers
                  .filter(user => store.selectedUserIds.includes(user.id))
                  .slice(0, 5)
                  .map(user => (
                    <Avatar key={user.id} className="border-2 border-background">
                      <AvatarImage src={user.image ?? undefined} alt={user.nickname || user.name} />
                      <AvatarFallback>{(user.nickname || user.name).charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  ))
                }
                {store.selectedUserIds.length > 5 && (
                  <Avatar className="border-2 border-background">
                    <AvatarFallback>+{store.selectedUserIds.length - 5}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        <div className="space-y-1">
          <Label>{t("share-message")}</Label>
          <Input
            value={store.inviteMessage}
            onChange={(e) => store.setInviteMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("share-message-description")}</p>
        </div>
      </div>

      {store.statusMessage && (
        <p className="mt-4 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{store.statusMessage}</p>
      )}

      {store.inviteUrl && (
        <div className="flex gap-2 items-center mt-3">
          <div className="space-y-1 flex-1">
            <Label>{t("invite-link")}</Label>
            <Input value={store.inviteUrl} readOnly />
          </div>
          <Copy content={store.inviteUrl} size={24} />
        </div>
      )}

      {store.pendingApprovals.length > 0 && (
        <div className="flex flex-col gap-2 mt-4">
          <span className="text-muted-foreground font-medium">{t("share-requests")}</span>
          {store.pendingApprovals.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="truncate">
                {t(`share-scope-${row.scope}`)}{row.inviteeEmail ? ` · ${row.inviteeEmail}` : ''}
              </span>
              <Badge variant={row.status === 'approved' ? 'success' : row.status === 'pending' ? 'warning' : 'secondary'}>
                {t(`share-status-${row.status}`)}
              </Badge>
            </div>
          ))}
        </div>
      )}

      <div className="w-full flex items-end gap-4 mt-6">
        {
          store.isShare && (
            <Button variant="ghost" className="w-full" onClick={store.handleCancelShare}>
              {t("cancel-share")}
            </Button>
          )
        }
        <Button className="w-full" onClick={store.handleCreateShare}>
          {t("create-share")}
        </Button>
      </div>
    </Card>
  );
});
