import { observer } from 'mobx-react-lite';
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { showTipsDialog } from '@/components/Common/TipsDialog';

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
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setDirs(await api.agentDirectories.list.query({ includeDisabled: true }) as AgentDir[]);
    } catch (cause) {
      console.error('Failed to load agent directories', cause);
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
    if (!draft.path.trim()) return;
    const payload = {
      kind: draft.kind,
      label: draft.label.trim(),
      path: draft.path.trim(),
      isDefault: draft.isDefault,
      enabled: draft.enabled,
    };
    try {
      if (draft.id == null) await api.agentDirectories.create.mutate(payload);
      else await api.agentDirectories.update.mutate({ id: draft.id, ...payload });
      setIsOpen(false);
      await load();
    } catch (cause) {
      console.error('Failed to save agent directory', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
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
            {kind === 'working' && dir.isDefault && <Chip size="sm" variant="flat" color="primary">{t('default')}</Chip>}
            {kind === 'skills' && <Chip size="sm" variant="flat">{t('priority-order', { order: index + 1 })}</Chip>}
            {!dir.enabled && <Chip size="sm" variant="flat" color="warning">{t('disabled')}</Chip>}
          </div>
          <p className="truncate text-xs text-default-400" title={dir.path}>{dir.path}</p>
        </div>

        {kind === 'skills' && (
          <div className="flex items-center gap-1">
            <Button isIconOnly size="sm" variant="light" isDisabled={index === 0} aria-label={t('move-up')} onPress={() => move(dir, -1)}>
              <Icon icon="mdi:arrow-up" width="16" height="16" />
            </Button>
            <Button isIconOnly size="sm" variant="light" isDisabled={index === items.length - 1} aria-label={t('move-down')} onPress={() => move(dir, 1)}>
              <Icon icon="mdi:arrow-down" width="16" height="16" />
            </Button>
          </div>
        )}

        {kind === 'working' && !dir.isDefault && (
          <Button size="sm" variant="flat" onPress={() => setDefault(dir)}>{t('set-as-default')}</Button>
        )}

        <Tooltip content={dir.enabled ? t('disable') : t('enable')}>
          <Switch size="sm" isSelected={dir.enabled} onValueChange={(next) => toggleEnabled(dir, next)} aria-label={dir.label} />
        </Tooltip>
        <Button isIconOnly size="sm" variant="light" aria-label={t('edit')} onPress={() => openEdit(dir)}>
          <Icon icon="hugeicons:edit-02" width="16" height="16" />
        </Button>
        <Button isIconOnly size="sm" variant="light" color="danger" aria-label={t('delete')} onPress={() => remove(dir)}>
          <Icon icon="hugeicons:delete-02" width="16" height="16" />
        </Button>
      </div>
    ));
  };

  return (
    <CollapsibleCard icon="mdi:folder-cog-outline" title={t('agent-directories')}>
      <div className="flex flex-col gap-5 p-1">
        <p className="text-sm text-default-500">{t('agent-directories-description')}</p>

        {isLoading && <p className="py-4 text-center text-sm text-default-400">{t('in-progress')}</p>}

        {!isLoading && (
          <>
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('working-directories')}</h3>
                  <p className="text-xs text-default-400">{t('working-directories-description')}</p>
                </div>
                <Button size="sm" color="primary" onPress={() => openCreate('working')} startContent={<Icon icon="material-symbols:add" width="16" height="16" />}>
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
                <Button size="sm" color="primary" onPress={() => openCreate('skills')} startContent={<Icon icon="material-symbols:add" width="16" height="16" />}>
                  {t('add-directory')}
                </Button>
              </div>
              {renderList('skills')}
            </section>
          </>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <ModalContent>
          <ModalHeader>{draft.id == null ? t('add-directory') : t('edit-directory')}</ModalHeader>
          <ModalBody className="gap-3">
            <Chip size="sm" variant="flat">{t(draft.kind === 'working' ? 'working-directories' : 'skills-directories')}</Chip>
            <Input
              label={t('directory-path')}
              description={t('directory-path-description')}
              value={draft.path}
              onValueChange={(value) => setDraft((current) => ({ ...current, path: value }))}
            />
            <Input
              label={t('directory-label')}
              description={t('directory-label-description')}
              value={draft.label}
              onValueChange={(value) => setDraft((current) => ({ ...current, label: value }))}
            />
            {draft.kind === 'working' && (
              <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
                <span className="text-sm">{t('set-as-default')}</span>
                <Switch size="sm" isSelected={draft.isDefault} onValueChange={(value) => setDraft((current) => ({ ...current, isDefault: value }))} />
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('enabled')}</span>
              <Switch size="sm" isSelected={draft.enabled} onValueChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} />
            </div>
            {error && <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsOpen(false)}>{t('cancel')}</Button>
            <Button color="primary" isDisabled={!draft.path.trim()} onPress={save}>{t('save')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </CollapsibleCard>
  );
});
