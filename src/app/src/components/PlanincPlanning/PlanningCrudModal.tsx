import { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch, Textarea } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';

type PlanningItem = {
  id?: number;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  category?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
};

export type PlanningFormValues = {
  title: string;
  description: string;
  status: string;
  priority?: string;
  category: string;
  tags: string[];
  customFields: Record<string, unknown>;
};

type CustomField = {
  id: number;
  kind: 'ticket' | 'study';
  key: string;
  label: string;
  fieldType: 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'date' | 'url';
  options: string[];
  required: boolean;
  showInGraph: boolean;
  enabled: boolean;
  sortOrder: number;
};

type PlanningCrudModalProps = {
  kind: 'ticket' | 'study';
  isOpen: boolean;
  item: PlanningItem | null;
  onClose: () => void;
  onSave: (data: PlanningFormValues, id?: number) => Promise<void>;
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
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Custom field definitions are account-scoped and shared across create/edit.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void api.planningFields.list.query({ kind })
      .then((fields) => { if (!cancelled) setCustomFields(fields as CustomField[]); })
      .catch((cause) => console.error('Failed to load custom form fields', cause));
    return () => { cancelled = true; };
  }, [isOpen, kind]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setStatus(item?.status ?? (kind === 'ticket' ? 'open' : 'planned'));
    setPriority(item?.priority ?? 'medium');
    setCategory(item?.category ?? '');
    setTags((item?.tags ?? []).join(', '));
    setCustomValues({ ...(item?.customFields ?? {}) });
    setError('');
  }, [isOpen, item, kind]);

  const close = () => {
    if (!isSaving) onClose();
  };

  const setCustomValue = (key: string, value: unknown) => {
    setCustomValues((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!title.trim() || isSaving) return;
    const missing = customFields.find((field) => {
      if (!field.required) return false;
      const value = customValues[field.key];
      if (field.fieldType === 'toggle') return value !== true;
      return value == null || String(value).trim() === '';
    });
    if (missing) {
      setError(t('custom-field-required', { field: missing.label }));
      return;
    }
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
        customFields: customValues,
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

  const renderCustomField = (field: CustomField) => {
    const value = customValues[field.key];
    const helper = (
      <span className="flex items-center gap-1 pl-1 text-tiny text-foreground-500">
        {field.showInGraph && <Icon icon="hugeicons:share-05" width="12" height="12" />}
        {field.required ? t('required') : t('optional')}
      </span>
    );
    switch (field.fieldType) {
      case 'textarea':
        return <Textarea key={field.id} label={field.label} description={helper} value={String(value ?? '')} onValueChange={(next) => setCustomValue(field.key, next)} isDisabled={isSaving} />;
      case 'number':
        return <Input key={field.id} type="number" label={field.label} description={helper} value={String(value ?? '')} onValueChange={(next) => setCustomValue(field.key, next === '' ? '' : Number(next))} isDisabled={isSaving} />;
      case 'date':
        return <Input key={field.id} type="date" label={field.label} description={helper} value={String(value ?? '')} onValueChange={(next) => setCustomValue(field.key, next)} isDisabled={isSaving} />;
      case 'url':
        return <Input key={field.id} type="url" label={field.label} description={helper} value={String(value ?? '')} onValueChange={(next) => setCustomValue(field.key, next)} isDisabled={isSaving} />;
      case 'select':
        return (
          <Select
            key={field.id}
            label={field.label}
            description={helper}
            selectedKeys={value ? [String(value)] : []}
            onSelectionChange={(keys) => setCustomValue(field.key, String(Array.from(keys)[0] ?? ''))}
            isDisabled={isSaving}
          >
            {field.options.map((option) => <SelectItem key={option}>{option}</SelectItem>)}
          </Select>
        );
      case 'toggle':
        return (
          <div key={field.id} className="flex items-center justify-between rounded-xl bg-content2 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-tiny text-foreground-500">{field.required ? t('required') : t('optional')}</p>
            </div>
            <Switch isSelected={value === true} onValueChange={(next) => setCustomValue(field.key, next)} isDisabled={isSaving} aria-label={field.label} />
          </div>
        );
      default:
        return <Input key={field.id} label={field.label} description={helper} value={String(value ?? '')} onValueChange={(next) => setCustomValue(field.key, next)} isDisabled={isSaving} />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} isDismissable={!isSaving} scrollBehavior="inside">
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
          {customFields.length > 0 && (
            <div className="mt-1 flex flex-col gap-3 border-t border-divider pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-500">{t('custom-fields')}</p>
              {customFields.map(renderCustomField)}
            </div>
          )}
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
