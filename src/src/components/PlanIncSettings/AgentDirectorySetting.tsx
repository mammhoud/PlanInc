import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';

type DirKind = 'working' | 'skills';

type AgentDir = {
  id: number;
  kind: DirKind;
  label: string;
  path: string;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
};

const emptyDraft = {
  id: null as number | null,
  kind: 'working' as DirKind,
  label: '',
  path: '',
  isDefault: false,
  enabled: true,
};

/**
 * Account-scoped agent directories.
 *
 * `working` directories are the places the agent may run in, and `skills`
 * directories are scanned (in order) for skill definitions — so this section
 * owns both add/remove and the priority order.
 */
export const AgentDirectorySetting = observer(() => {
  const { t } = useTranslation();
  const [dirs, setDirs] = useState<AgentDir[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setDirs(await api.agentDirectories.list.query({ includeDisabled: true }) as AgentDir[]);
      setError('');
    } catch (cause) {
      console.error('Failed to load agent directories', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const ofKind = (kind: DirKind) =>
    dirs.filter((dir) => dir.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder);

  const openCreate = (kind: DirKind) => {
    setDraft({ ...emptyDraft, kind });
    setError('');
    setIsOpen(true);
  };

  const openEdit = (dir: AgentDir) => {
    setDraft({ id: dir.id, kind: dir.kind, label: dir.label, path: dir.path, isDefault: dir.isDefault, enabled: dir.enabled });
    setError('');
    setIsOpen(true);
  };

  const save = async () => {
    if (!draft.path.trim() || isSaving) return;
    const payload = {
      kind: draft.kind,
      label: draft.label.trim(),
      path: draft.path.trim(),
      isDefault: draft.isDefault,
      enabled: draft.enabled,
    };
    setIsSaving(true);
    try {
      if (draft.id == null) await api.agentDirectories.create.mutate(payload);
      else await api.agentDirectories.update.mutate({ id: draft.id, ...payload });
      setIsOpen(false);
      await load();
    } catch (cause) {
      console.error('Failed to save agent directory', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const pathKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (draft.path.trim() && !isSaving) void save();
    }
  };

  const remove = (dir: AgentDir) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('agent-directory-delete-warning', { path: dir.path }),
      onConfirm: async () => {
        await PromiseCall(api.agentDirectories.delete.mutate({ id: dir.id }));
        await load();
      },
    });
  };

  const move = async (dir: AgentDir, direction: -1 | 1) => {
    const siblings = ofKind(dir.kind);
    const index = siblings.findIndex((item) => item.id === dir.id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    [next[index], next[target]] = [next[target], next[index]];
    // Optimistic: the server returns the canonical ordering on success.
    setDirs((current) => current.map((item) => {
      const position = next.findIndex((candidate) => candidate.id === item.id);
      return position === -1 ? item : { ...item, sortOrder: position };
    }));
    try {
      await api.agentDirectories.reorder.mutate({ kind: dir.kind, orderedIds: next.map((item) => item.id) });
    } catch (cause) {
      console.error('Failed to reorder agent directories', cause);
      RootStore.Get(ToastPlugin).error((cause as Error)?.message ?? t('operation-failed'));
      await load();
    }
  };

  const setDefault = async (dir: AgentDir) => {
    setDirs((current) => current.map((item) => (
      item.kind === dir.kind ? { ...item, isDefault: item.id === dir.id } : item
    )));
    await PromiseCall(api.agentDirectories.update.mutate({ id: dir.id, isDefault: true }), { autoAlert: false });
  };

  const toggleEnabled = async (dir: AgentDir, enabled: boolean) => {
    setDirs((current) => current.map((item) => (item.id === dir.id ? { ...item, enabled } : item)));
    await PromiseCall(api.agentDirectories.update.mutate({ id: dir.id, enabled }), { autoAlert: false });
  };

  const renderList = (kind: DirKind) => {
    const items = ofKind(kind);
    if (!items.length) {
      return <p className="py-6 text-center text-sm text-default-400">{t(kind === 'working' ? 'no-working-directories' : 'no-skills-directories')}</p>;
    }

    return items.map((dir, index) => (
      <div key={dir.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-default-100/60 p-3">
        <div className="flex min-w-[200px] flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{dir.label}</span>
            {kind === 'working' && dir.isDefault && <Badge variant="default">{t('default')}</Badge>}
            {kind === 'skills' && <Badge variant="secondary">{t('priority-order', { order: index + 1 })}</Badge>}
            {!dir.enabled && <Badge variant="warning">{t('disabled')}</Badge>}
          </div>
          <p className="truncate text-xs text-default-400" title={dir.path}>{dir.path}</p>
        </div>

        {kind === 'skills' && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" disabled={index === 0} aria-label={t('move-up')} onClick={() => move(dir, -1)}>
              <Icon icon="mdi:arrow-up" width="16" height="16" />
            </Button>
            <Button size="icon" variant="ghost" disabled={index === items.length - 1} aria-label={t('move-down')} onClick={() => move(dir, 1)}>
              <Icon icon="mdi:arrow-down" width="16" height="16" />
            </Button>
          </div>
        )}

        {kind === 'working' && !dir.isDefault && (
          <Button size="sm" variant="ghost" onClick={() => setDefault(dir)}>{t('set-as-default')}</Button>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Switch checked={dir.enabled} onCheckedChange={(next) => toggleEnabled(dir, next)} aria-label={dir.label} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{dir.enabled ? t('disable') : t('enable')}</TooltipContent>
        </Tooltip>
        <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => openEdit(dir)}>
          <Icon icon="hugeicons:edit-02" width="16" height="16" />
        </Button>
        <Button size="icon" variant="destructive" aria-label={t('delete')} onClick={() => remove(dir)}>
          <Icon icon="hugeicons:delete-02" width="16" height="16" />
        </Button>
      </div>
    ));
  };

  return (
    <CollapsibleCard icon="mdi:folder-cog-outline" title={t('agent-directories')}>
      <div className="flex flex-col gap-5 p-1">
        <p className="text-sm text-default-500">{t('agent-directories-description')}</p>

        {isLoading && <LoadingAndEmpty isLoading emptyMessage="" isAbsolute={false} className="py-2" />}

        {!isLoading && (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('working-directories')}</h3>
                  <p className="text-xs text-default-400">{t('working-directories-description')}</p>
                </div>
                <Button size="sm" onClick={() => openCreate('working')}><Icon icon="material-symbols:add" width="16" height="16" />
                  {t('add-directory')}
                </Button>
              </div>
              {renderList('working')}
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('skills-directories')}</h3>
                  <p className="text-xs text-default-400">{t('skills-directories-description')}</p>
                </div>
                <Button size="sm" onClick={() => openCreate('skills')}><Icon icon="material-symbols:add" width="16" height="16" />
                  {t('add-directory')}
                </Button>
              </div>
              {renderList('skills')}
            </section>
          </>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isSaving) setIsOpen(false); }}>
        <DialogContent className="max-w-lg" onPointerDownOutside={(e) => { if (isSaving) e.preventDefault(); }}>
          <DialogHeader><DialogTitle>{draft.id == null ? t('add-directory') : t('edit-directory')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <Badge variant="secondary" className="self-start">{t(draft.kind === 'working' ? 'working-directories' : 'skills-directories')}</Badge>
            <div className="space-y-1.5">
              <Label>{t('directory-path')}</Label>
              <Input
                autoFocus
                value={draft.path}
                onChange={(e) => setDraft((current) => ({ ...current, path: e.target.value }))}
                onKeyDown={pathKeyDown}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">{t('directory-path-description')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('directory-label')}</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))}
                onKeyDown={pathKeyDown}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">{t('directory-label-description')}</p>
            </div>
            {draft.kind === 'working' && (
              <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
                <span className="text-sm">{t('set-as-default')}</span>
                <Switch checked={draft.isDefault} onCheckedChange={(value) => setDraft((current) => ({ ...current, isDefault: value }))} disabled={isSaving} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('enabled')}</span>
              <Switch checked={draft.enabled} onCheckedChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} disabled={isSaving} />
            </div>
            {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)} disabled={isSaving}>{t('cancel')}</Button>
            <Button disabled={!draft.path.trim() || isSaving} loading={isSaving} onClick={save}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  );
});
