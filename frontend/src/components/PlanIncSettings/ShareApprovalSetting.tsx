import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { Label } from '@/components/ui/label';

type ShareScope = 'internal' | 'email' | 'public';
type ShareStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

type ShareApproval = {
  id: number;
  noteId: number;
  scope: ShareScope;
  status: ShareStatus;
  inviteeAccountId: number | null;
  inviteeEmail: string | null;
  canEdit: boolean;
  requiresAdmin: boolean;
  adminApproved: boolean;
  decisionNote: string | null;
  message: string | null;
  createdAt: string;
};

const statusVariant: Record<ShareStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  revoked: 'secondary',
};

const scopeIcon: Record<ShareScope, string> = {
  internal: 'mdi:account-lock-outline',
  email: 'mdi:email-lock-outline',
  public: 'mdi:public',
};

/**
 * Share approvals: the recipient's in-app queue, the sender's outgoing
 * requests, and (for admins) the workspace queue plus the approval policy.
 */
export const ShareApprovalSetting = observer(() => {
  const { t } = useTranslation();
  const [policy, setPolicyState] = useState({ requireShareApproval: false, isAdmin: false });
  const [inbox, setInbox] = useState<ShareApproval[]>([]);
  const [outgoing, setOutgoing] = useState<ShareApproval[]>([]);
  const [adminQueue, setAdminQueue] = useState<ShareApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = async () => {
    setIsLoading(true);
    try {
      const nextPolicy = await api.shareApprovals.policy.query();
      setPolicyState(nextPolicy);

      const [nextInbox, nextOutgoing] = await Promise.all([
        api.shareApprovals.inbox.query(),
        api.shareApprovals.outgoing.query(),
      ]);
      setInbox(nextInbox as ShareApproval[]);
      setOutgoing(nextOutgoing as ShareApproval[]);

      if (nextPolicy.isAdmin) {
        setAdminQueue(await api.shareApprovals.pendingAdmin.query() as ShareApproval[]);
      } else {
        setAdminQueue([]);
      }
    } catch (cause) {
      console.error('Failed to load share approvals', cause);
      setError(t('operation-failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const decide = async (row: ShareApproval, approve: boolean) => {
    try {
      await api.shareApprovals.decide.mutate({
        id: row.id,
        approve,
        decisionNote: notes[row.id] ?? '',
      });
      setNotes((current) => ({ ...current, [row.id]: '' }));
      await load();
    } catch (cause) {
      console.error('Failed to decide share request', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    }
  };

  const revoke = async (row: ShareApproval) => {
    await PromiseCall(api.shareApprovals.revoke.mutate({ id: row.id }));
    await load();
  };

  const setPolicy = async (requireShareApproval: boolean) => {
    setPolicyState((current) => ({ ...current, requireShareApproval }));
    await PromiseCall(api.shareApprovals.setPolicy.mutate({ requireShareApproval }), { autoAlert: false });
  };

  const renderRow = (row: ShareApproval, actions: 'decide' | 'owner' | 'admin') => (
    <div key={row.id} className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon icon={scopeIcon[row.scope]} width="16" height="16" className="text-muted-foreground" />
        <span className="text-sm font-medium">{t('note')} #{row.noteId}</span>
        <Badge variant="secondary">{t(`share-scope-${row.scope}`)}</Badge>
        <Badge variant={statusVariant[row.status]}>{t(`share-status-${row.status}`)}</Badge>
        {row.requiresAdmin && !row.adminApproved && <Badge variant="warning">{t('needs-admin-approval')}</Badge>}
        {row.inviteeEmail && <span className="text-xs text-muted-foreground">{row.inviteeEmail}</span>}
      </div>

      {row.message && <p className="text-xs text-muted-foreground">"{row.message}"</p>}

      {actions === 'decide' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t('decision-note')}</Label>
            <Input
              className="h-9"
              value={notes[row.id] ?? ''}
              onChange={(e) => setNotes((current) => ({ ...current, [row.id]: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(row, true)}>{t('approve')}</Button>
            <Button size="sm" variant="destructive" onClick={() => decide(row, false)}>{t('decline')}</Button>
          </div>
        </div>
      )}

      {actions === 'admin' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t('decision-note')}</Label>
            <Input
              className="h-9"
              value={notes[row.id] ?? ''}
              onChange={(e) => setNotes((current) => ({ ...current, [row.id]: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(row, true)}>{t('approve')}</Button>
            <Button size="sm" variant="destructive" onClick={() => decide(row, false)}>{t('decline')}</Button>
          </div>
        </div>
      )}

      {actions === 'owner' && (row.status === 'pending' || row.status === 'approved') && (
        <div className="flex justify-end">
          <Button size="sm" variant="destructive" onClick={() => revoke(row)}>{t('revoke-share')}</Button>
        </div>
      )}
    </div>
  );

  return (
    <CollapsibleCard icon="mdi:shield-account-outline" title={t('share-approvals')}>
      <div className="flex flex-col gap-5 p-1">
        <p className="text-sm text-muted-foreground">{t('share-approvals-description')}</p>

        {policy.isAdmin && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t('require-share-approval')}</p>
              <p className="text-xs text-muted-foreground">{t('require-share-approval-description')}</p>
            </div>
            <Switch
              checked={policy.requireShareApproval}
              onCheckedChange={setPolicy}
              aria-label={t('require-share-approval')}
            />
          </div>
        )}

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {isLoading && <p className="py-4 text-center text-sm text-muted-foreground">{t('in-progress')}</p>}

        {!isLoading && (
          <>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t('requests-for-me')}</h3>
              {!inbox.length && <p className="text-xs text-muted-foreground">{t('no-share-requests')}</p>}
              {inbox.map((row) => renderRow(row, 'decide'))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t('my-share-requests')}</h3>
              {!outgoing.length && <p className="text-xs text-muted-foreground">{t('no-outgoing-share-requests')}</p>}
              {outgoing.map((row) => renderRow(row, 'owner'))}
            </section>

            {policy.isAdmin && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('admin-approval-queue')}</h3>
                {!adminQueue.length && <p className="text-xs text-muted-foreground">{t('no-pending-approvals')}</p>}
                {adminQueue.map((row) => renderRow(row, 'admin'))}
              </section>
            )}
          </>
        )}
      </div>
    </CollapsibleCard>
  );
});
