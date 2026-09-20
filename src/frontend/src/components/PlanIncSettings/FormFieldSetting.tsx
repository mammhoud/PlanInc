import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
          <Button size="sm" onClick={openCreate}><Icon icon="material-symbols:add" width="16" height="16" />
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
                <Badge variant="secondary">{t(field.kind === 'ticket' ? 'tickets' : 'study')}</Badge>
                <Badge variant="secondary">{field.fieldType}</Badge>
                {field.required && <Badge variant="warning">{t('required')}</Badge>}
                {field.showInGraph && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-primary"><Icon icon="hugeicons:share-05" width="14" height="14" /></span>
                    </TooltipTrigger>
                    <TooltipContent>{t('show-in-graph')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-xs text-default-400">{`{{${field.key}}}`}{field.options.length ? ` · ${field.options.join(', ')}` : ''}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch checked={field.enabled} onCheckedChange={(next) => toggleEnabled(field, next)} aria-label={field.label} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{field.enabled ? t('disable') : t('enable')}</TooltipContent>
            </Tooltip>
            <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => openEdit(field)}>
              <Icon icon="hugeicons:edit-02" width="16" height="16" />
            </Button>
            <Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => remove(field)} className="text-destructive hover:text-destructive">
              <Icon icon="hugeicons:delete-02" width="16" height="16" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setIsOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.id == null ? t('add-form-field') : t('edit-form-field')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label>{t('form')}</Label>
              <Select value={draft.kind} onValueChange={(value) => setDraft((current) => ({ ...current, kind: value as FieldKind }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kinds.map((kind) => <SelectItem key={kind} value={kind}>{t(kind === 'ticket' ? 'tickets' : 'study')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('field-label')}</Label>
              <Input value={draft.label} onChange={(e) => setDraft((current) => ({ ...current, label: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('field-key')}</Label>
              <Input
                value={draft.key}
                onChange={(e) => setDraft((current) => ({ ...current, key: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{t('field-key-description')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('field-type')}</Label>
              <Select value={draft.fieldType} onValueChange={(value) => setDraft((current) => ({ ...current, fieldType: value as FieldType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {draft.fieldType === 'select' && (
              <div className="space-y-1.5">
                <Label>{t('field-options')}</Label>
                <Input value={draft.options} onChange={(e) => setDraft((current) => ({ ...current, options: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{t('field-options-description')}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{t('field-order')}</Label>
              <Input type="number" value={String(draft.sortOrder)} onChange={(e) => setDraft((current) => ({ ...current, sortOrder: Number(e.target.value) || 0 }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('required')}</span>
              <Switch checked={draft.required} onCheckedChange={(value) => setDraft((current) => ({ ...current, required: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('show-in-graph')}</span>
              <Switch checked={draft.showInGraph} onCheckedChange={(value) => setDraft((current) => ({ ...current, showInGraph: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('enabled')}</span>
              <Switch checked={draft.enabled} onCheckedChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} />
            </div>
            {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>{t('cancel')}</Button>
            <Button disabled={!draft.label.trim() || !draft.key.trim()} onClick={save}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  );
});
