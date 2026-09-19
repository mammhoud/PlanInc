import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Chip, Input, Select, SelectItem, Textarea } from '@heroui/react';
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
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
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!title.trim()) return;
    if (editingId == null) {
      await api.tickets.create.mutate({ title, description, priority });
    } else {
      await api.tickets.update.mutate({ id: editingId, title, description, priority });
    }
    setTitle('');
    setDescription('');
    setPriority('medium');
    setEditingId(null);
    await load();
  };

  const edit = (ticket: any) => {
    setEditingId(ticket.id);
    setTitle(ticket.title);
    setDescription(ticket.description);
    setPriority(ticket.priority);
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
        }
        await load();
      },
    });
  };

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-20 md:px-6">
      <div className="flex items-center gap-2 pt-2"><Icon icon="hugeicons:task-01" width="24" height="24" /><h1 className="text-xl font-bold">{t('tickets')}</h1></div>
      <Card><CardBody className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Input label={t('title')} value={title} onValueChange={setTitle} />
        <Select label={t('priority')} selectedKeys={[priority]} onSelectionChange={(keys) => setPriority(String(Array.from(keys)[0]) as (typeof priorities)[number])}>
          {priorities.map((item) => <SelectItem key={item}>{t(item)}</SelectItem>)}
        </Select>
        <Textarea className="md:col-span-2" label={t('description')} value={description} onValueChange={setDescription} />
        <div className="flex gap-2 md:col-span-2">
          <Button color="primary" onPress={create} isDisabled={!title.trim()}>{editingId == null ? t('create-ticket') : t('save')}</Button>
          {editingId != null && <Button variant="flat" onPress={() => { setEditingId(null); setTitle(''); setDescription(''); setPriority('medium'); }}>{t('cancel')}</Button>}
        </div>
      </CardBody></Card>
      {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
      {isLoading && <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {!isLoading && tickets.map((ticket) => <Card key={ticket.id}><CardBody className="gap-3">
          <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">{ticket.title}</h2><p className="text-sm text-foreground-500">{ticket.description}</p></div><Chip size="sm" color={ticket.priority === 'critical' ? 'danger' : 'default'}>{t(ticket.priority)}</Chip></div>
          <div className="flex items-end gap-2">
            <Select className="flex-1" size="sm" label={t('status')} selectedKeys={[ticket.status]} onSelectionChange={(keys) => api.tickets.update.mutate({ id: ticket.id, status: String(Array.from(keys)[0]) as (typeof statuses)[number] }).then(load)}>
              {statuses.map((item) => <SelectItem key={item}>{t(item)}</SelectItem>)}
            </Select>
            <Button isIconOnly variant="flat" aria-label={t('edit')} onPress={() => edit(ticket)}><Icon icon="hugeicons:edit-02" width="18" height="18" /></Button>
            <Button isIconOnly variant="flat" color="danger" aria-label={t('delete')} onPress={() => remove(ticket)}><Icon icon="hugeicons:delete-02" width="18" height="18" /></Button>
          </div>
        </CardBody></Card>)}
      </div>
      {!isLoading && !tickets.length && <p className="py-10 text-center text-foreground-500">{t('no-tickets')}</p>}
    </ScrollArea>
  );
}
