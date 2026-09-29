import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';

export type LinkEntityType = 'note' | 'ticket' | 'study' | 'resource' | 'agent';

const LINK_KIND_LABEL: Record<LinkEntityType, string> = {
  note: 'notes',
  ticket: 'tickets',
  study: 'study',
  resource: 'resources',
  agent: 'agents',
};

const stripHtml = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').trim();

type Props = {
  isOpen: boolean;
  onClose: () => void;
  sourceType: LinkEntityType;
  sourceId: number | null;
  sourceTitle?: string;
};

/**
 * Generic reference-link manager: list, create, toggle graph visibility and
 * remove planning links for any entity. Tickets owns an inline copy of this
 * flow; study (and future entities) reuse this modal.
 */
export function PlanningLinksModal({ isOpen, onClose, sourceType, sourceId, sourceTitle }: Props) {
  const { t } = useTranslation();
  const [linkType, setLinkType] = useState<LinkEntityType>('note');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkShowInGraph, setLinkShowInGraph] = useState(true);
  const [links, setLinks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [studies, setStudies] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || sourceId == null) return;
    setLinkTargetId('');
    setLinkLabel('');
    setLinkShowInGraph(true);
    setLinkType(sourceType === 'note' ? 'study' : 'note');
    void api.planningLinks.list
      .query({ entityType: sourceType, entityId: sourceId }, { context: { skipBatch: true } })
      .then(setLinks)
      .catch((cause) => {
        console.error('Failed to load links', cause);
        RootStore.Get(ToastPlugin).error(t('operation-failed'));
      });
    // notes.list is a mutation-style procedure, so it must be called via mutate.
    void api.notes.list
      .mutate({ page: 1, size: 50, isRecycle: false, isArchived: false })
      .then(setNotes)
      .catch((cause) => console.error('Failed to load note link targets', cause));
    void api.tickets.list
      .query()
      .then(setTickets)
      .catch((cause) => console.error('Failed to load ticket link targets', cause));
    void api.study.list
      .query()
      .then(setStudies)
      .catch((cause) => console.error('Failed to load study link targets', cause));
    void api.attachments.list
      .query({ page: 1, size: 50 })
      .then((attachments) => setResources((attachments as any[]).filter((item) => !item.isFolder)))
      .catch((cause) => console.error('Failed to load resource link targets', cause));
    void api.conversation.list
      .query({ page: 1, size: 50 })
      .then(setAgents)
      .catch((cause) => console.error('Failed to load agent link targets', cause));
  }, [isOpen, sourceId, sourceType, t]);

  const linkTargets = useMemo(() => {
    const pool = linkType === 'note' ? notes : linkType === 'agent' ? agents : linkType === 'study' ? studies : linkType === 'ticket' ? tickets : resources;
    // An item cannot link to itself (the server rejects it as well).
    return pool.filter((item) => !(linkType === sourceType && item.id === sourceId));
  }, [linkType, notes, agents, studies, tickets, resources, sourceType, sourceId]);

  const targetLabel = (link: any) => {
    const otherType = link.sourceType === sourceType && link.sourceId === sourceId ? link.targetType : link.sourceType;
    const otherId = link.sourceType === sourceType && link.sourceId === sourceId ? link.targetId : link.sourceId;
    if (otherType === 'note') {
      const note = notes.find((item) => item.id === otherId);
      return note ? stripHtml(note.content).slice(0, 40) || `note:${otherId}` : `note:${otherId}`;
    }
    if (otherType === 'agent') {
      const agent = agents.find((item) => item.id === otherId);
      return agent?.title || `agent:${otherId}`;
    }
    if (otherType === 'study') return studies.find((item) => item.id === otherId)?.title ?? `study:${otherId}`;
    if (otherType === 'ticket') return tickets.find((item) => item.id === otherId)?.title ?? `ticket:${otherId}`;
    if (otherType === 'resource') return resources.find((item) => item.id === otherId)?.name ?? `resource:${otherId}`;
    return `${otherType}:${otherId}`;
  };

  const targetOptionLabel = (item: any) => {
    if (linkType === 'note') return stripHtml(item.content).slice(0, 48) || `note:${item.id}`;
    if (linkType === 'agent') return item.title || `agent:${item.id}`;
    return item.title ?? item.name;
  };

  const refreshLinks = async () => {
    if (sourceId == null) return;
    setLinks(await api.planningLinks.list.query({ entityType: sourceType, entityId: sourceId }, { context: { skipBatch: true } }));
  };

  const addLink = async () => {
    if (sourceId == null || !linkTargetId) return;
    try {
      await api.planningLinks.create.mutate({
        sourceType,
        sourceId,
        targetType: linkType,
        targetId: Number(linkTargetId),
        label: linkLabel.trim(),
        showInGraph: linkShowInGraph,
      });
      await refreshLinks();
      setLinkTargetId('');
      setLinkLabel('');
    } catch (cause) {
      console.error('Failed to create link', cause);
      RootStore.Get(ToastPlugin).error(t('operation-failed'));
    }
  };

  const toggleLinkGraph = async (link: any, showInGraph: boolean) => {
    try {
      await api.planningLinks.update.mutate({ id: link.id, showInGraph });
      setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, showInGraph } : item)));
    } catch (cause) {
      console.error('Failed to update link', cause);
      RootStore.Get(ToastPlugin).error(t('operation-failed'));
    }
  };

  const removeLink = async (link: any) => {
    try {
      await api.planningLinks.delete.mutate({ id: link.id });
      setLinks((current) => current.filter((item) => item.id !== link.id));
    } catch (cause) {
      console.error('Failed to delete link', cause);
      RootStore.Get(ToastPlugin).error(t('operation-failed'));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>{t('related-items')}{sourceTitle ? `: ${sourceTitle}` : ''}</ModalHeader>
        <ModalBody className="gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t('link-type')}
              selectedKeys={[linkType]}
              onSelectionChange={(keys) => {
                setLinkType(String(Array.from(keys)[0]) as LinkEntityType);
                setLinkTargetId('');
              }}
            >
              {(Object.keys(LINK_KIND_LABEL) as LinkEntityType[]).map((kind) => (
                <SelectItem key={kind}>{t(LINK_KIND_LABEL[kind])}</SelectItem>
              ))}
            </Select>
            <Select
              label={t('link-target')}
              selectedKeys={linkTargetId ? [linkTargetId] : []}
              onSelectionChange={(keys) => setLinkTargetId(String(Array.from(keys)[0] ?? ''))}
            >
              {linkTargets.map((item) => <SelectItem key={String(item.id)}>{targetOptionLabel(item)}</SelectItem>)}
            </Select>
          </div>
          <Input label={t('link-label')} placeholder={t('link-label-placeholder')} value={linkLabel} onValueChange={setLinkLabel} />
          <div className="flex items-center justify-between rounded-xl bg-content2 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t('show-in-graph')}</p>
              <p className="text-xs text-foreground-500">{t('show-in-graph-description')}</p>
            </div>
            <Switch size="sm" isSelected={linkShowInGraph} onValueChange={setLinkShowInGraph} aria-label={t('show-in-graph')} />
          </div>
          <Button color="primary" onPress={addLink} isDisabled={!linkTargetId}>{t('add-link')}</Button>
          <div className="grid gap-2">
            {links.map((link) => {
              const outgoing = link.sourceType === sourceType && link.sourceId === sourceId;
              const otherKind = (outgoing ? link.targetType : link.sourceType) as LinkEntityType;
              return (
                <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-content2 p-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon icon="hugeicons:share-05" width="16" height="16" className="shrink-0 text-foreground-500" />
                    <span className="truncate">
                      {t(LINK_KIND_LABEL[otherKind] ?? 'notes')}: {outgoing ? targetLabel(link) : `${link.sourceType}:${link.sourceId}`}
                      {link.label ? <span className="text-foreground-500"> · {link.label}</span> : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch size="sm" isSelected={link.showInGraph !== false} onValueChange={(next) => toggleLinkGraph(link, next)} aria-label={t('show-in-graph')} />
                    <Button size="sm" variant="light" color="danger" onPress={() => removeLink(link)}>{t('remove')}</Button>
                  </div>
                </div>
              );
            })}
            {!links.length && <p className="text-sm text-foreground-500">{t('no-related-items')}</p>}
          </div>
        </ModalBody>
        <ModalFooter><Button variant="flat" onPress={onClose}>{t('close')}</Button></ModalFooter>
      </ModalContent>
    </Modal>
  );
}
