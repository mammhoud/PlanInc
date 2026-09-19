import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Chip, Input, Select, SelectItem, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';

const statuses = ['open', 'in_progress', 'blocked', 'done'] as const;
const priorities = ['low', 'medium', 'high', 'critical'] as const;

export default function TicketsPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof priorities)[number]>('medium');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLinksOpen, setIsLinksOpen] = useState(false);
  const [linkTicket, setLinkTicket] = useState<any | null>(null);
  const [linkType, setLinkType] = useState<'study'>('study');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [links, setLinks] = useState<any[]>([]);
  const [studies, setStudies] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'cards' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'cards';
    const saved = window.localStorage.getItem('planinc:tickets:view');
    return saved === 'list' || saved === 'grid' ? saved : 'cards';
  });
  const changeViewMode = (mode: 'list' | 'cards' | 'grid') => {
    setViewMode(mode);
    window.localStorage.setItem('planinc:tickets:view', mode);
  };
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
  const visibleTickets = tickets.filter((ticket) => (!selectedTag || (ticket.tags ?? []).includes(selectedTag)) && (!selectedCategory || ticket.category === selectedCategory));
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void api.study.list.query().then((nextStudies) => {
      setStudies(nextStudies);
    }).catch((cause) => console.error('Failed to load link targets', cause));
  }, []);

  const create = async () => {
    if (!title.trim()) return;
    const normalizedTags = [...new Set(tags.split(',').map((tag) => tag.trim()).filter(Boolean))];
    if (editingId == null) {
      await api.tickets.create.mutate({ title, description, priority, category, tags: normalizedTags });
    } else {
      await api.tickets.update.mutate({ id: editingId, title, description, priority, category, tags: normalizedTags });
    }
    setTitle('');
    setDescription('');
    setPriority('medium');
    setCategory('');
    setTags('');
    setEditingId(null);
    await load();
  };

  const edit = (ticket: any) => {
    setEditingId(ticket.id);
    setTitle(ticket.title);
    setDescription(ticket.description);
    setPriority(ticket.priority);
    setCategory(ticket.category ?? '');
    setTags((ticket.tags ?? []).join(', '));
  };

  const remove = (ticket: any) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-will-be-delete-resource-are-you-sure'),
      onConfirm: async () => {
        await api.tickets.delete.mutate({ id: ticket.id });
        if (editingId === ticket.id) {
          setEditingId(null);
          setTitle('');
          setDescription('');
          setPriority('medium');
          setCategory('');
          setTags('');
        }
        await load();
      },
    });
  };

  const openLinks = async (ticket: any) => {
    setLinkTicket(ticket);
    setLinkTargetId('');
    setLinkType('study');
    setIsLinksOpen(true);
    try {
      setLinks(await api.planningLinks.list.query({ entityType: 'ticket', entityId: ticket.id }, { context: { skipBatch: true } }));
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
        targetType: 'study',
        targetId: Number(linkTargetId),
      });
      setLinks(await api.planningLinks.list.query({ entityType: 'ticket', entityId: linkTicket.id }, { context: { skipBatch: true } }));
      setLinkTargetId('');
    } catch (cause) {
      console.error('Failed to create ticket link', cause);
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
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-20 md:px-6">
      <div className="flex items-center gap-2 pt-2"><Icon icon="hugeicons:task-01" width="24" height="24" /><h1 className="text-xl font-bold">{t('tickets')}</h1></div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-tag')}>
        <Button size="sm" variant={selectedTag ? 'flat' : 'solid'} onPress={() => setSelectedTag('')}>{t('all')}</Button>
        {availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTag === tag ? 'solid' : 'flat'} onPress={() => setSelectedTag(tag)}>#{tag}</Button>)}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('filter-by-category')}>
        <Button size="sm" variant={selectedCategory ? 'flat' : 'solid'} onPress={() => setSelectedCategory('')}>{t('all-categories')}</Button>
        {availableCategories.map((categoryName) => <Button key={categoryName} size="sm" variant={selectedCategory === categoryName ? 'solid' : 'flat'} onPress={() => setSelectedCategory(categoryName)}>{categoryName}</Button>)}
      </div>
      <div className="flex items-center justify-end gap-2" aria-label={t('ticket-view')}>
        {(['list', 'cards', 'grid'] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={viewMode === mode ? 'solid' : 'flat'}
            onPress={() => changeViewMode(mode)}
            startContent={<Icon icon={mode === 'list' ? 'tabler:list' : mode === 'grid' ? 'tabler:layout-grid' : 'tabler:layout-cards'} width="16" height="16" />}
          >
            {t(`view-${mode}`)}
          </Button>
        ))}
      </div>
      <Card><CardBody className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Input label={t('title')} value={title} onValueChange={setTitle} />
        <Select label={t('priority')} selectedKeys={[priority]} onSelectionChange={(keys) => setPriority(String(Array.from(keys)[0]) as (typeof priorities)[number])}>
          {priorities.map((item) => <SelectItem key={item}>{t(item)}</SelectItem>)}
        </Select>
        <Textarea className="md:col-span-2" label={t('description')} value={description} onValueChange={setDescription} />
        <Button variant="flat" className="w-fit md:col-span-2" onPress={() => setIsDetailsOpen(true)}>{t('categories-and-tags')}</Button>
        <div className="flex gap-2 md:col-span-2">
          <Button color="primary" onPress={create} isDisabled={!title.trim()}>{editingId == null ? t('create-ticket') : t('save')}</Button>
          {editingId != null && <Button variant="flat" onPress={() => { setEditingId(null); setTitle(''); setDescription(''); setPriority('medium'); }}>{t('cancel')}</Button>}
        </div>
      </CardBody></Card>
      {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
      {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}
      <div className={viewMode === 'list' ? 'grid gap-2' : viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid gap-3 md:grid-cols-2'}>
        {!isLoading && visibleTickets.map((ticket) => <Card key={ticket.id}><CardBody className="gap-3">
          <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{ticket.title}</h2><p className="text-sm text-foreground-500">{ticket.description}</p><p className="mt-1 text-xs text-foreground-400">{ticket.category || t('uncategorized')}</p></div><Chip size="sm" color={ticket.priority === 'critical' ? 'danger' : 'default'}>{t(ticket.priority)}</Chip></div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex w-full gap-1 overflow-x-auto">{(ticket.tags ?? []).map((tag) => <Chip key={tag} size="sm" variant="flat">#{tag}</Chip>)}</div>
            <Select className="flex-1" size="sm" label={t('status')} selectedKeys={[ticket.status]} onSelectionChange={(keys) => api.tickets.update.mutate({ id: ticket.id, status: String(Array.from(keys)[0]) as (typeof statuses)[number] }).then(load)}>
              {statuses.map((item) => <SelectItem key={item}>{t(item)}</SelectItem>)}
            </Select>
            <Button size="sm" variant="flat" onPress={() => openLinks(ticket)}>{t('related-items')}</Button>
            <Button isIconOnly variant="flat" aria-label={t('edit')} onPress={() => edit(ticket)}><Icon icon="hugeicons:edit-02" width="18" height="18" /></Button>
            <Button isIconOnly variant="flat" color="danger" aria-label={t('delete')} onPress={() => remove(ticket)}><Icon icon="hugeicons:delete-02" width="18" height="18" /></Button>
          </div>
        </CardBody></Card>)}
      </div>
      {!isLoading && !visibleTickets.length && <p className="py-10 text-center text-foreground-500">{t('no-tickets')}</p>}
      <Modal isOpen={isDetailsOpen} onClose={() => setIsDetailsOpen(false)}>
        <ModalContent><ModalHeader>{t('categories-and-tags')}</ModalHeader><ModalBody className="gap-3">
          <Input label={t('category')} placeholder={t('category-placeholder')} value={category} onValueChange={setCategory} />
          <Input label={t('tags')} placeholder={t('tags-placeholder')} value={tags} onValueChange={setTags} />
        </ModalBody><ModalFooter><Button color="primary" onPress={() => setIsDetailsOpen(false)}>{t('apply')}</Button></ModalFooter></ModalContent>
      </Modal>
      <Modal isOpen={isLinksOpen} onClose={() => setIsLinksOpen(false)}>
        <ModalContent>
          <ModalHeader>{t('related-items')}{linkTicket ? `: ${linkTicket.title}` : ''}</ModalHeader>
          <ModalBody className="gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label={t('link-type')} selectedKeys={[linkType]}>
                <SelectItem key="study">{t('study')}</SelectItem>
              </Select>
              <Select label={t('link-target')} selectedKeys={linkTargetId ? [linkTargetId] : []} onSelectionChange={(keys) => setLinkTargetId(String(Array.from(keys)[0] ?? ''))}>
                {studies.map((item) => <SelectItem key={String(item.id)}>{item.title}</SelectItem>)}
              </Select>
            </div>
            <Button color="primary" onPress={addLink} isDisabled={!linkTargetId}>{t('add-link')}</Button>
            <div className="grid gap-2">
              {links.map((link) => {
                const target = studies.find((item) => item.id === link.targetId);
                return <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg bg-content2 p-2 text-sm">
                  <span>{t('study')}: {target?.title ?? link.targetId}</span>
                  <Button size="sm" variant="light" color="danger" onPress={() => removeLink(link)}>{t('remove')}</Button>
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
