import { observer } from 'mobx-react-lite';
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { showTipsDialog } from '@/components/Common/TipsDialog';

type FieldKind = 'ticket' | 'study';
type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'date' | 'url';

type FormField = {
  id: number;
  kind: FieldKind;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  showInGraph: boolean;
  enabled: boolean;
  sortOrder: number;
};

const fieldTypes: FieldType[] = ['text', 'textarea', 'number', 'select', 'toggle', 'date', 'url'];
const kinds: FieldKind[] = ['ticket', 'study'];

const emptyDraft = {
  id: null as number | null,
  kind: 'ticket' as FieldKind,
  key: '',
  label: '',
  fieldType: 'text' as FieldType,
  options: '',
  required: false,
  showInGraph: false,
  enabled: true,
  sortOrder: 0,
};

/**
 * Account-scoped custom form fields. Each definition is rendered by the shared
 * Ticket/Study CRUD modal, and `showInGraph` fields surface in graph previews.
 */
export const FormFieldSetting = observer(() => {
  const { t } = useTranslation();
  const [fields, setFields] = useState<FormField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setFields(await api.planningFields.list.query({ includeDisabled: true }) as FormField[]);
    } catch (cause) {
      console.error('Failed to load form fields', cause);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setDraft({ ...emptyDraft, sortOrder: fields.length });
    setError('');
    setIsOpen(true);
  };

  const openEdit = (field: FormField) => {
    setDraft({
      id: field.id,
      kind: field.kind,
      key: field.key,
      label: field.label,
      fieldType: field.fieldType,
      options: field.options.join(', '),
      required: field.required,
      showInGraph: field.showInGraph,
      enabled: field.enabled,
      sortOrder: field.sortOrder,
    });
    setError('');
    setIsOpen(true);
  };

  const save = async () => {
    if (!draft.label.trim() || !draft.key.trim()) return;
    const payload = {
      kind: draft.kind,
      key: draft.key.trim().toLowerCase(),
      label: draft.label.trim(),
      fieldType: draft.fieldType,
      options: draft.fieldType === 'select'
        ? [...new Set(draft.options.split(',').map((option) => option.trim()).filter(Boolean))]
        : [],
      required: draft.required,
      showInGraph: draft.showInGraph,
      enabled: draft.enabled,
      sortOrder: Number(draft.sortOrder) || 0,
    };
    try {
      if (draft.id == null) await api.planningFields.create.mutate(payload);
      else await api.planningFields.update.mutate({ id: draft.id, ...payload });
      setIsOpen(false);
      await load();
    } catch (cause) {
      console.error('Failed to save form field', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    }
  };

  const remove = (field: FormField) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('form-field-delete-warning', { field: field.label }),
      onConfirm: async () => {
        await PromiseCall(api.planningFields.delete.mutate({ id: field.id }));
        await load();
      },
    });
  };

  const toggleEnabled = async (field: FormField, enabled: boolean) => {
    setFields((current) => current.map((item) => (item.id === field.id ? { ...item, enabled } : item)));
    await PromiseCall(api.planningFields.update.mutate({ id: field.id, enabled }), { autoAlert: false });
  };

  return (
    <CollapsibleCard icon="tabler:forms" title={t('custom-form-fields')}>
      <div className="flex flex-col gap-3 p-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-default-500">{t('custom-form-fields-description')}</p>
          <Button size="sm" color="primary" onPress={openCreate} startContent={<Icon icon="material-symbols:add" width="16" height="16" />}>
            {t('add-form-field')}
          </Button>
        </div>

        {isLoading && <p className="py-4 text-center text-sm text-default-400">{t('in-progress')}</p>}
        {!isLoading && !fields.length && <p className="py-6 text-center text-sm text-default-400">{t('no-form-fields')}</p>}

        {!isLoading && fields.map((field) => (
          <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-default-100/60 p-3">
            <div className="min-w-[160px] flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{field.label}</span>
                <Chip size="sm" variant="flat">{t(field.kind === 'ticket' ? 'tickets' : 'study')}</Chip>
                <Chip size="sm" variant="flat">{field.fieldType}</Chip>
                {field.required && <Chip size="sm" variant="flat" color="warning">{t('required')}</Chip>}
                {field.showInGraph && (
                  <Tooltip content={t('show-in-graph')}>
                    <span className="text-primary"><Icon icon="hugeicons:share-05" width="14" height="14" /></span>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-default-400">{`{{${field.key}}}`}{field.options.length ? ` · ${field.options.join(', ')}` : ''}</p>
            </div>
            <Tooltip content={field.enabled ? t('disable') : t('enable')}>
              <Switch size="sm" isSelected={field.enabled} onValueChange={(next) => toggleEnabled(field, next)} aria-label={field.label} />
            </Tooltip>
            <Button isIconOnly size="sm" variant="light" aria-label={t('edit')} onPress={() => openEdit(field)}>
              <Icon icon="hugeicons:edit-02" width="16" height="16" />
            </Button>
            <Button isIconOnly size="sm" variant="light" color="danger" aria-label={t('delete')} onPress={() => remove(field)}>
              <Icon icon="hugeicons:delete-02" width="16" height="16" />
            </Button>
          </div>
        ))}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <ModalContent>
          <ModalHeader>{draft.id == null ? t('add-form-field') : t('edit-form-field')}</ModalHeader>
          <ModalBody className="gap-3">
            <Select label={t('form')} selectedKeys={[draft.kind]} onSelectionChange={(keys) => setDraft((current) => ({ ...current, kind: String(Array.from(keys)[0]) as FieldKind }))}>
              {kinds.map((kind) => <SelectItem key={kind}>{t(kind === 'ticket' ? 'tickets' : 'study')}</SelectItem>)}
            </Select>
            <Input label={t('field-label')} value={draft.label} onValueChange={(value) => setDraft((current) => ({ ...current, label: value }))} />
            <Input
              label={t('field-key')}
              description={t('field-key-description')}
              value={draft.key}
              onValueChange={(value) => setDraft((current) => ({ ...current, key: value }))}
            />
            <Select label={t('field-type')} selectedKeys={[draft.fieldType]} onSelectionChange={(keys) => setDraft((current) => ({ ...current, fieldType: String(Array.from(keys)[0]) as FieldType }))}>
              {fieldTypes.map((type) => <SelectItem key={type}>{type}</SelectItem>)}
            </Select>
            {draft.fieldType === 'select' && (
              <Input label={t('field-options')} description={t('field-options-description')} value={draft.options} onValueChange={(value) => setDraft((current) => ({ ...current, options: value }))} />
            )}
            <Input type="number" label={t('field-order')} value={String(draft.sortOrder)} onValueChange={(value) => setDraft((current) => ({ ...current, sortOrder: Number(value) || 0 }))} />
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('required')}</span>
              <Switch size="sm" isSelected={draft.required} onValueChange={(value) => setDraft((current) => ({ ...current, required: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('show-in-graph')}</span>
              <Switch size="sm" isSelected={draft.showInGraph} onValueChange={(value) => setDraft((current) => ({ ...current, showInGraph: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('enabled')}</span>
              <Switch size="sm" isSelected={draft.enabled} onValueChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} />
            </div>
            {error && <p className="rounded-xl bg-danger-50 p-3 text-sm text-danger">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setIsOpen(false)}>{t('cancel')}</Button>
            <Button color="primary" isDisabled={!draft.label.trim() || !draft.key.trim()} onPress={save}>{t('save')}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </CollapsibleCard>
  );
});
