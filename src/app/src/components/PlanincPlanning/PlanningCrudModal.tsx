import { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Textarea } from '@heroui/react';
import { useTranslation } from 'react-i18next';

type PlanningItem = {
  id?: number;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  tags?: string[];
};

type PlanningCrudModalProps = {
  kind: 'ticket' | 'study';
  isOpen: boolean;
  item: PlanningItem | null;
  onClose: () => void;
  onSave: (data: { title: string; description: string; status: string; priority?: string; category: string; tags: string[] }, id?: number) => Promise<void>;
};

const ticketStatuses = ['open', 'in_progress', 'blocked', 'done'] as const;
const priorities = ['low', 'medium', 'high', 'critical'] as const;
const studyStatuses = ['planned', 'active', 'complete'] as const;

export function PlanningCrudModal({ kind, isOpen, item, onClose, onSave }: PlanningCrudModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<string>(kind === 'ticket' ? 'open' : 'planned');
  const [priority, setPriority] = useState<string>('medium');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setStatus(item?.status ?? (kind === 'ticket' ? 'open' : 'planned'));
    setPriority(item?.priority ?? 'medium');
    setCategory(item?.category ?? '');
    setTags((item?.tags ?? []).join(', '));
    setError('');
  }, [isOpen, item, kind]);

  const close = () => {
    if (!isSaving) onClose();
  };

  const save = async () => {
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        description,
        status,
        ...(kind === 'ticket' ? { priority } : {}),
        category: category.trim(),
        tags: [...new Set(tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      }, item?.id);
      onClose();
    } catch (cause) {
      console.error(`Failed to save ${kind}`, cause);
      setError(t('operation-failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const statuses = kind === 'ticket' ? ticketStatuses : studyStatuses;

  return (
    <Modal isOpen={isOpen} onClose={close} isDismissable={!isSaving}>
      <ModalContent>
        <ModalHeader>{item ? t('edit') : kind === 'ticket' ? t('create-ticket') : t('add-study-item')}</ModalHeader>
        <ModalBody className="gap-3">
          <Input label={kind === 'ticket' ? t('title') : t('study-title')} value={title} onValueChange={setTitle} isDisabled={isSaving} />
          {kind === 'ticket' && (
            <Select label={t('priority')} selectedKeys={[priority]} onSelectionChange={(keys) => setPriority(String(Array.from(keys)[0]))} isDisabled={isSaving}>
              {priorities.map((value) => <SelectItem key={value}>{t(value)}</SelectItem>)}
            </Select>
          )}
          <Textarea label={t('description')} value={description} onValueChange={setDescription} isDisabled={isSaving} />
          <Select label={t('status')} selectedKeys={[status]} onSelectionChange={(keys) => setStatus(String(Array.from(keys)[0]))} isDisabled={isSaving}>
            {statuses.map((value) => <SelectItem key={value}>{t(value)}</SelectItem>)}
          </Select>
          <Input label={t('category')} placeholder={t('category-placeholder')} value={category} onValueChange={setCategory} isDisabled={isSaving} />
          <Input label={t('tags')} placeholder={t('tags-placeholder')} value={tags} onValueChange={setTags} isDisabled={isSaving} />
          {error && <p className="rounded-xl bg-danger-50 p-3 text-danger" role="alert">{error}</p>}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={close} isDisabled={isSaving}>{t('cancel')}</Button>
          <Button color="primary" onPress={save} isDisabled={!title.trim() || isSaving} isLoading={isSaving}>{item ? t('save') : kind === 'ticket' ? t('create-ticket') : t('add-study-item')}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
