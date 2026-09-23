import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  question?: string;
  answer?: string;
};

export type PlanningFormValues = {
  title: string;
  description: string;
  status: string;
  priority?: string;
  category: string;
  tags: string[];
  customFields: Record<string, unknown>;
  question?: string;
  answer?: string;
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
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void api.planningFields.list.query({ kind })
      .then((fields) => { if (!cancelled) setCustomFields(fields as CustomField[]); })
      .catch((cause) => {
        console.error('Failed to load custom form fields', cause);
        setError((cause as Error)?.message || 'Failed to load custom fields');
      });
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
    setQuestion(item?.question ?? '');
    setAnswer(item?.answer ?? '');
    setCustomValues({ ...(item?.customFields ?? {}) });
    setError('');
  }, [isOpen, item, kind]);

  const close = () => {
    if (!isSaving) onClose();
  };

  const setCustomValue = (key: string, value: unknown) => {
    setCustomValues((current) => ({ ...current, [key]: value }));
  };

  // Category changes mirror into tags: drop the previous category tag, add the new one.
  const handleCategoryChange = (next: string) => {
    const previous = category.trim();
    const trimmed = next.trim();
    const list = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    const withoutPrevious = previous ? list.filter((tag) => tag !== previous) : list;
    const merged = trimmed && !withoutPrevious.includes(trimmed) ? [...withoutPrevious, trimmed] : withoutPrevious;
    setCategory(next);
    setTags(merged.join(', '));
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
        ...(kind === 'study' ? { question: question.trim(), answer: answer.trim() } : {}),
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
      <span className="flex items-center gap-1 pl-1 text-xs text-muted-foreground">
        {field.showInGraph && <Icon icon="hugeicons:share-05" width="12" height="12" />}
        {field.required ? t('required') : t('optional')}
      </span>
    );
    switch (field.fieldType) {
      case 'textarea':
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Textarea
              value={String(value ?? '')}
              onChange={(e) => setCustomValue(field.key, e.target.value)}
              disabled={isSaving}
            />
            {helper}
          </div>
        );
      case 'number':
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Input
              type="number"
              value={String(value ?? '')}
              onChange={(e) => setCustomValue(field.key, e.target.value === '' ? '' : Number(e.target.value))}
              disabled={isSaving}
            />
            {helper}
          </div>
        );
      case 'date':
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Input
              type="date"
              value={String(value ?? '')}
              onChange={(e) => setCustomValue(field.key, e.target.value)}
              disabled={isSaving}
            />
            {helper}
          </div>
        );
      case 'url':
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Input
              type="url"
              value={String(value ?? '')}
              onChange={(e) => setCustomValue(field.key, e.target.value)}
              disabled={isSaving}
            />
            {helper}
          </div>
        );
      case 'select':
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Select
              value={String(value ?? '')}
              onValueChange={(v) => setCustomValue(field.key, v)}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.label} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {helper}
          </div>
        );
      case 'toggle':
        return (
          <div key={field.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
            <div>
              <p className="text-sm font-medium">{field.label}</p>
              <p className="text-xs text-muted-foreground">{field.required ? t('required') : t('optional')}</p>
            </div>
            <Switch
              checked={value === true}
              onCheckedChange={(next) => setCustomValue(field.key, next)}
              disabled={isSaving}
              aria-label={field.label}
            />
          </div>
        );
      default:
        return (
          <div key={field.id} className="space-y-1">
            <Label>{field.label}</Label>
            <Input
              value={String(value ?? '')}
              onChange={(e) => setCustomValue(field.key, e.target.value)}
              disabled={isSaving}
            />
            {helper}
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90dvh] overflow-y-auto" onPointerDownOutside={(e) => { if (isSaving) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{item ? t('edit') : kind === 'ticket' ? t('create-ticket') : t('add-study-item')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="planning-title">{kind === 'ticket' ? t('title') : t('study-title')}</Label>
            <Input
              id="planning-title"
              autoFocus
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (title.trim() && !isSaving) void save();
                }
              }}
              disabled={isSaving}
              aria-invalid={!title.trim() ? true : undefined}
            />
          </div>
          {kind === 'ticket' && (
            <div className="space-y-1">
              <Label>{t('priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v)} disabled={isSaving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((value) => (
                    <SelectItem key={value} value={value}>{t(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>{t('description')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isSaving} />
          </div>
          <div className="space-y-1">
            <Label>{t('status')}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v)} disabled={isSaving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>{t(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('category')}</Label>
            <Input placeholder={t('category-placeholder')} value={category} onChange={(e) => handleCategoryChange(e.target.value)} disabled={isSaving} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="planning-tags">{t('tags')}</Label>
            <Input id="planning-tags" placeholder={t('tags-placeholder')} value={tags} onChange={(e) => setTags(e.target.value)} disabled={isSaving} />
          </div>
          {kind === 'study' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="planning-question">{t('question')}</Label>
                <Textarea
                  id="planning-question"
                  placeholder={t('question-placeholder')}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={isSaving}
                  maxLength={20000}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="planning-answer">{t('answer')}</Label>
                <Textarea
                  id="planning-answer"
                  placeholder={t('answer-placeholder')}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={isSaving}
                  maxLength={20000}
                />
              </div>
            </>
          )}
          {customFields.length > 0 && (
            <div className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('custom-fields')}</p>
              {customFields.map(renderCustomField)}
            </div>
          )}
          {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={isSaving}>{t('cancel')}</Button>
          <Button onClick={save} disabled={!title.trim() || isSaving} loading={isSaving}>{item ? t('save') : kind === 'ticket' ? t('create-ticket') : t('add-study-item')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
