import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { PlanningCrudModal } from '@/components/PlanincPlanning/PlanningCrudModal';
import type { PlanningFormValues } from '@/components/PlanincPlanning/PlanningCrudModal';
import { PlanningViewSwitch, usePlanningView, planningViewGridClass } from '@/components/PlanincPlanning/PlanningViewSwitch';
import { PlanningPagination } from '@/components/PlanincPlanning/PlanningPagination';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';

const statuses = ['open', 'in_progress', 'blocked', 'done'] as const;
const priorities = ['low', 'medium', 'high', 'critical'] as const;

type LinkTargetType = 'note' | 'agent' | 'study' | 'resource';

const stripHtml = (value: unknown) => String(value ?? '').replace(/<[^>]+>/g, '').trim();

const LINK_KIND_LABEL: Record<LinkTargetType | 'ticket', string> = {
  note: 'notes',
  agent: 'agents',
  study: 'study',
  resource: 'resources',
  ticket: 'tickets',
};

export default function TicketsPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isCrudOpen, setIsCrudOpen] = useState(false);
  const [isLinksOpen, setIsLinksOpen] = useState(false);
  const [linkTicket, setLinkTicket] = useState<any | null>(null);
  const [linkType, setLinkType] = useState<LinkTargetType>('study');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkShowInGraph, setLinkShowInGraph] = useState(true);
  const [links, setLinks] = useState<any[]>([]);
  const [studies, setStudies] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [viewMode, setViewMode] = usePlanningView('planinc:tickets:view', 'cards');

  const load = async () => {
    setIsLoading(true);
    try {
      setTickets(await api.tickets.list.query());
      setError('');
    } catch (cause) {
      console.error('Failed to load tickets', cause);
      setError(t('operation-failed'));
    } finally {
      setIsLoading(false);
    }
  };
  const availableTags = [...new Set(tickets.flatMap((ticket) => ticket.tags ?? []))].sort();
  const availableCategories = [...new Set(tickets.map((ticket) => ticket.category).filter(Boolean))].sort();
  const visibleTickets = useMemo(
    () => tickets.filter((ticket) => (!selectedTag || (ticket.tags ?? []).includes(selectedTag)) && (!selectedCategory || ticket.category === selectedCategory)),
    [tickets, selectedTag, selectedCategory],
  );
  const pagedTickets = useMemo(
    () => visibleTickets.slice((page - 1) * pageSize, page * pageSize),
    [visibleTickets, page, pageSize],
  );

  useEffect(() => { void load(); }, []);
  useEffect(() => { setPage(1); }, [selectedTag, selectedCategory, pageSize]);
  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(visibleTickets.length / pageSize))));
  }, [visibleTickets.length, pageSize]);
  useEffect(() => {
    void api.study.list.query().then((nextStudies) => {
      setStudies(nextStudies);
    }).catch((cause) => console.error('Failed to load link targets', cause));
    void api.attachments.list.query({ page: 1, size: 50 }).then((attachments) => {
      setResources((attachments as any[]).filter((item) => !item.isFolder));
    }).catch((cause) => console.error('Failed to load resource link targets', cause));
    // notes.list is a mutation-style procedure, so it must be called via mutate.
    void api.notes.list.mutate({ page: 1, size: 30, isRecycle: false, isArchived: false })
      .then((nextNotes) => setNotes(nextNotes))
      .catch((cause) => console.error('Failed to load note link targets', cause));
    void api.conversation.list.query({ page: 1, size: 50 })
      .then((nextAgents) => setAgents(nextAgents))
      .catch((cause) => console.error('Failed to load agent link targets', cause));
  }, []);

  const save = async (data: PlanningFormValues, id?: number) => {
    if (id == null) await api.tickets.create.mutate({ ...data, priority: data.priority as (typeof priorities)[number] });
    else await api.tickets.update.mutate({ id, ...data, priority: data.priority as (typeof priorities)[number] });
    await load();
  };

  const remove = (ticket: any) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-will-be-delete-resource-are-you-sure'),
      onConfirm: async () => {
        await api.tickets.delete.mutate({ id: ticket.id });
        if (editingItem?.id === ticket.id) setEditingItem(null);
        await load();
      },
    });
  };

  const linkTargets = linkType === 'note' ? notes : linkType === 'agent' ? agents : linkType === 'study' ? studies : resources;
  const targetLabel = (link: any) => {
    if (link.targetType === 'note') {
      const note = notes.find((item) => item.id === link.targetId);
      return note ? stripHtml(note.content).slice(0, 40) || `note:${link.targetId}` : `note:${link.targetId}`;
    }
    if (link.targetType === 'agent') {
      const agent = agents.find((item) => item.id === link.targetId);
      return agent?.title || `agent:${link.targetId}`;
    }
    if (link.targetType === 'study') return studies.find((item) => item.id === link.targetId)?.title ?? `study:${link.targetId}`;
    if (link.targetType === 'resource') return resources.find((item) => item.id === link.targetId)?.name ?? `resource:${link.targetId}`;
    return `${link.targetType}:${link.targetId}`;
  };
  const targetOptionLabel = (item: any) => {
    if (linkType === 'note') return stripHtml(item.content).slice(0, 48) || `note:${item.id}`;
    if (linkType === 'agent') return item.title || `agent:${item.id}`;
    return item.title ?? item.name;
  };

  const refreshLinks = async (ticketId: number) => {
    setLinks(await api.planningLinks.list.query({ entityType: 'ticket', entityId: ticketId }, { context: { skipBatch: true } }));
  };

  const openLinks = async (ticket: any) => {
    setLinkTicket(ticket);
    setLinkTargetId('');
    setLinkLabel('');
    setLinkShowInGraph(true);
    setLinkType('study');
    setIsLinksOpen(true);
    try {
      await refreshLinks(ticket.id);
    } catch (cause) {
      console.error('Failed to load ticket links', cause);
      setError(t('operation-failed'));
    }
  };

  const addLink = async () => {
    if (!linkTicket || !linkTargetId) return;
    try {
      await api.planningLinks.create.mutate({
        sourceType: 'ticket',
        sourceId: linkTicket.id,
        targetType: linkType,
        targetId: Number(linkTargetId),
        label: linkLabel.trim(),
        showInGraph: linkShowInGraph,
      });
      await refreshLinks(linkTicket.id);
      setLinkTargetId('');
      setLinkLabel('');
    } catch (cause) {
      console.error('Failed to create ticket link', cause);
      setError(t('operation-failed'));
    }
  };

  const toggleLinkGraph = async (link: any, showInGraph: boolean) => {
    try {
      await api.planningLinks.update.mutate({ id: link.id, showInGraph });
      setLinks((current) => current.map((item) => (item.id === link.id ? { ...item, showInGraph } : item)));
    } catch (cause) {
      console.error('Failed to update ticket link', cause);
      setError(t('operation-failed'));
    }
  };

  const removeLink = async (link: any) => {
    try {
      await api.planningLinks.delete.mutate({ id: link.id });
      setLinks((current) => current.filter((item) => item.id !== link.id));
    } catch (cause) {
      console.error('Failed to delete ticket link', cause);
      setError(t('operation-failed'));
    }
  };

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-24 md:px-6">
      <div className="flex items-center gap-2 pt-2"><Icon icon="tabler:list-check" width="24" height="24" /><h1 className="text-xl font-bold">{t('tickets')}</h1></div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-tag')}>
        <Button size="sm" variant={selectedTag ? 'secondary' : 'default'} onClick={() => setSelectedTag('')}>{t('all')}</Button>
        {availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTag === tag ? 'default' : 'secondary'} onClick={() => setSelectedTag(tag)}>#{tag}</Button>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-category')}>
        <Button size="sm" variant={selectedCategory ? 'secondary' : 'default'} onClick={() => setSelectedCategory('')}>{t('all-categories')}</Button>
        {availableCategories.map((categoryName) => <Button key={categoryName} size="sm" variant={selectedCategory === categoryName ? 'default' : 'secondary'} onClick={() => setSelectedCategory(categoryName)}>{categoryName}</Button>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlanningViewSwitch value={viewMode} onChange={setViewMode} ariaLabel={t('ticket-view')} />
        <Button onClick={() => { setEditingItem(null); setIsCrudOpen(true); }}><Icon icon="material-symbols:add" width="16" height="16" />{t('create-ticket')}</Button>
      </div>
      {error && <p className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      {isLoading && <p className="py-8 text-center text-muted-foreground">{t('in-progress')}</p>}
      <div className={planningViewGridClass(viewMode)}>
        {!isLoading && pagedTickets.map((ticket) => <Card key={ticket.id}><CardContent className="gap-3">
          <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{ticket.title}</h2><p className="text-sm text-muted-foreground">{ticket.description}</p><p className="mt-1 text-xs text-muted-foreground">{ticket.category || t('uncategorized')}</p></div><Badge variant={ticket.priority === 'critical' ? 'destructive' : 'default'}>{t(ticket.priority)}</Badge></div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex w-full gap-1 overflow-x-auto">{(ticket.tags ?? []).map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}</div>
            <Select value={ticket.status} onValueChange={(value) => api.tickets.update.mutate({ id: ticket.id, status: value as (typeof statuses)[number] }).then(load)}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder={t('status')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((item) => <SelectItem key={item} value={item}>{t(item)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => openLinks(ticket)}>{t('related-items')}</Button>
            <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => { setEditingItem(ticket); setIsCrudOpen(true); }}><Icon icon="hugeicons:edit-02" width="18" height="18" /></Button>
            <Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => remove(ticket)}><Icon icon="hugeicons:delete-02" width="18" height="18" /></Button>
          </div>
        </CardContent></Card>)}
      </div>
      {!isLoading && !visibleTickets.length && <p className="py-10 text-center text-muted-foreground">{t('no-tickets')}</p>}
      {!isLoading && visibleTickets.length > 0 && (
        <PlanningPagination page={page} pageSize={pageSize} total={visibleTickets.length} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
      <PlanningFab label={t('create-ticket')} onPress={() => { setEditingItem(null); setIsCrudOpen(true); }} />
      <PlanningCrudModal kind="ticket" isOpen={isCrudOpen} item={editingItem} onClose={() => { setIsCrudOpen(false); setEditingItem(null); }} onSave={save} />
      <Modal isOpen={isLinksOpen} onClose={() => setIsLinksOpen(false)} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{t('related-items')}{linkTicket ? `: ${linkTicket.title}` : ''}</ModalHeader>
          <ModalBody className="gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label={t('link-type')} selectedKeys={[linkType]} onSelectionChange={(keys) => { setLinkType(String(Array.from(keys)[0]) as LinkTargetType); setLinkTargetId(''); }}>
                <SelectItem key="note">{t('notes')}</SelectItem>
                <SelectItem key="agent">{t('agents')}</SelectItem>
                <SelectItem key="study">{t('study')}</SelectItem>
                <SelectItem key="resource">{t('resources')}</SelectItem>
              </Select>
              <Select label={t('link-target')} selectedKeys={linkTargetId ? [linkTargetId] : []} onSelectionChange={(keys) => setLinkTargetId(String(Array.from(keys)[0] ?? ''))}>
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
                const outgoing = link.sourceType === 'ticket' && link.sourceId === linkTicket?.id;
                return <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-content2 p-2 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon icon="hugeicons:share-05" width="16" height="16" className="shrink-0 text-foreground-500" />
                    <span className="truncate">
                      {t(LINK_KIND_LABEL[link.targetType as LinkTargetType] ?? 'notes')}: {outgoing ? targetLabel(link) : `${link.sourceType}:${link.sourceId}`}
                      {link.label ? <span className="text-foreground-500"> · {link.label}</span> : null}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch size="sm" isSelected={link.showInGraph !== false} onValueChange={(next) => toggleLinkGraph(link, next)} aria-label={t('show-in-graph')} />
                    <Button size="sm" variant="light" color="danger" onPress={() => removeLink(link)}>{t('remove')}</Button>
                  </div>
                </div>;
              })}
              {!links.length && <p className="text-sm text-foreground-500">{t('no-related-items')}</p>}
            </div>
          </ModalBody>
          <ModalFooter><Button variant="flat" onPress={() => setIsLinksOpen(false)}>{t('close')}</Button></ModalFooter>
        </ModalContent>
      </Modal>
    </ScrollArea>
  );
}
