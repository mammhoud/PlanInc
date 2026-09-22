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
import { CATEGORY_COLOR_PRESETS as COLOR_PRESETS } from '@/lib/colorSeries';

const ICON_PRESETS = [
  'tabler:list-check',
  'tabler:target-arrow',
  'tabler:flag',
  'tabler:sparkles',
  'tabler:clock-hour-4',
  'tabler:book',
  'tabler:rocket',
  'tabler:archive',
];

type PlanCategory = {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon: string;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
};

const emptyDraft = {
  id: null as number | null,
  name: '',
  slug: '',
  color: COLOR_PRESETS[0].value,
  icon: ICON_PRESETS[0],
  isDefault: false,
  enabled: true,
};

/**
 * Predefined plan categories.
 *
 * Categories are unique per account (enforced by their slug) and feed the plans
 * board columns, the category filter, and the category picker in the CRUD modal.
 * Editing here never breaks existing plans: renaming keeps the slug, and deleting
 * moves affected plans to a replacement category.
 */
export const CategorySetting = observer(() => {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      setCategories(await api.planningCategories.list.query({ includeDisabled: true }) as PlanCategory[]);
    } catch (cause) {
      console.error('Failed to load plan categories', cause);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setDraft({ ...emptyDraft, isDefault: categories.length === 0 });
    setError('');
    setIsOpen(true);
  };

  const openEdit = (category: PlanCategory) => {
    setDraft({
      id: category.id,
      name: category.name,
      slug: category.slug,
      color: category.color,
      icon: category.icon,
      isDefault: category.isDefault,
      enabled: category.enabled,
    });
    setError('');
    setIsOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    const payload = {
      name: draft.name.trim(),
      color: draft.color,
      icon: draft.icon,
      isDefault: draft.isDefault,
      enabled: draft.enabled,
    };
    try {
      if (draft.id == null) await api.planningCategories.create.mutate(payload);
      else await api.planningCategories.update.mutate({ id: draft.id, ...payload });
      setIsOpen(false);
      await load();
    } catch (cause) {
      console.error('Failed to save plan category', cause);
      setError((cause as Error)?.message ?? t('operation-failed'));
    }
  };

  const remove = (category: PlanCategory) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('category-delete-warning', { name: category.name }),
      onConfirm: async () => {
        await PromiseCall(api.planningCategories.delete.mutate({ id: category.id, reassignToId: null }));
        await load();
      },
    });
  };

  const move = async (category: PlanCategory, direction: -1 | 1) => {
    const index = categories.findIndex((item) => item.id === category.id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    try {
      await api.planningCategories.reorder.mutate({ orderedIds: next.map((item) => item.id) });
    } catch (cause) {
      console.error('Failed to reorder plan categories', cause);
      await load();
    }
  };

  const toggleEnabled = async (category: PlanCategory, enabled: boolean) => {
    setCategories((current) => current.map((item) => (item.id === category.id ? { ...item, enabled } : item)));
    await PromiseCall(api.planningCategories.update.mutate({ id: category.id, enabled }), { autoAlert: false });
  };

  const seedDefaults = async () => {
    await PromiseCall(api.planningCategories.seedDefaults.mutate({}), { autoAlert: false });
    await load();
  };

  return (
    <CollapsibleCard icon="tabler:category" title={t('plan-categories')}>
      <div className="flex flex-col gap-3 p-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-default-500">{t('plan-categories-description')}</p>
          <div className="flex gap-2">
            {!categories.length && (
              <Button size="sm" variant="ghost" onClick={seedDefaults}><Icon icon="tabler:sparkles" width="16" height="16" />
                {t('seed-default-categories')}
              </Button>
            )}
            <Button size="sm" onClick={openCreate}><Icon icon="material-symbols:add" width="16" height="16" />
              {t('add-category')}
            </Button>
          </div>
        </div>

        {isLoading && <p className="py-4 text-center text-sm text-default-400">{t('in-progress')}</p>}
        {!isLoading && !categories.length && <p className="py-6 text-center text-sm text-default-400">{t('no-categories')}</p>}

        {!isLoading && categories.map((category, index) => (
          <div key={category.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-default-100/60 p-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: category.color }}
            >
              <Icon icon={category.icon} width="17" height="17" className="text-white" />
            </span>
            <div className="min-w-[150px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{category.name}</span>
                {category.isDefault && <Badge variant="default">{t('default')}</Badge>}
                {!category.enabled && <Badge variant="warning">{t('disabled')}</Badge>}
              </div>
              <p className="text-xs text-default-400">{category.slug} · {category.color}</p>
            </div>

            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" disabled={index === 0} aria-label={t('move-up')} onClick={() => move(category, -1)}>
                <Icon icon="mdi:arrow-up" width="16" height="16" />
              </Button>
              <Button size="icon" variant="ghost" disabled={index === categories.length - 1} aria-label={t('move-down')} onClick={() => move(category, 1)}>
                <Icon icon="mdi:arrow-down" width="16" height="16" />
              </Button>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Switch checked={category.enabled} onCheckedChange={(next) => toggleEnabled(category, next)} aria-label={category.name} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{category.enabled ? t('disable') : t('enable')}</TooltipContent>
            </Tooltip>
            <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => openEdit(category)}>
              <Icon icon="hugeicons:edit-02" width="16" height="16" />
            </Button>
            <Button size="icon" variant="destructive" aria-label={t('delete')} onClick={() => remove(category)}>
              <Icon icon="hugeicons:delete-02" width="16" height="16" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setIsOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft.id == null ? t('add-category') : t('edit-category')}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label>{t('category-name')}</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('category-slug')}</Label>
              <Input
                value={draft.slug}
                readOnly={draft.id != null}
                onChange={(e) => setDraft((current) => ({ ...current, slug: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">{t('category-slug-description')}</p>
            </div>
            <div>
              <p className="mb-2 text-sm text-default-500">{t('category-color')}</p>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    aria-label={preset.key}
                    aria-pressed={draft.color === preset.value}
                    onClick={() => setDraft((current) => ({ ...current, color: preset.value }))}
                    className={`h-8 w-8 rounded-lg border-2 ${draft.color === preset.value ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('category-icon')}</Label>
              <Select
                value={draft.icon}
                onValueChange={(value) => setDraft((current) => ({ ...current, icon: value }))}
              >
                <SelectTrigger>
                  <span className="flex items-center gap-2">
                    <Icon icon={draft.icon} width="16" height="16" />
                    {draft.icon}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {ICON_PRESETS.map((icon) => (
                    <SelectItem key={icon} value={icon}>
                      <span className="flex items-center gap-2">
                        <Icon icon={icon} width="16" height="16" />
                        {icon}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('set-as-default')}</span>
              <Switch checked={draft.isDefault} onCheckedChange={(value) => setDraft((current) => ({ ...current, isDefault: value }))} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-default-100/60 px-3 py-2">
              <span className="text-sm">{t('enabled')}</span>
              <Switch checked={draft.enabled} onCheckedChange={(value) => setDraft((current) => ({ ...current, enabled: value }))} />
            </div>
            {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>{t('cancel')}</Button>
            <Button disabled={!draft.name.trim()} onClick={save}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CollapsibleCard>
  );
});
