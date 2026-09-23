import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { Icon } from '@/components/Common/Iconify/icons';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';

type Skill = {
  id: number;
  name: string;
  description: string;
  level: number;
  mastery: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const emptyForm = { name: '', description: '', level: 1, mastery: 0, tags: '' };

export default function SkillsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    setIsLoading(true);
    try {
      setSkills(await api.skills.list.query());
      setError('');
    } catch (cause) {
      console.error('Failed to load skills', cause);
      setError(t('operation-failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description, ...(skill.tags ?? [])].join(' ').toLowerCase().includes(needle),
    );
  }, [skills, searchText]);

  const overallMastery = skills.length
    ? Math.round(skills.reduce((sum, skill) => sum + (skill.mastery || 0), 0) / skills.length)
    : 0;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setForm({
      name: skill.name,
      description: skill.description,
      level: skill.level,
      mastery: skill.mastery,
      tags: (skill.tags ?? []).join(', '),
    });
    setIsDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        level: Number(form.level),
        mastery: Number(form.mastery),
        tags: [...new Set(form.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      };
      if (editingId == null) await api.skills.create.mutate(payload);
      else await api.skills.update.mutate({ id: editingId, ...payload });
      setIsDialogOpen(false);
      await load();
    } catch (cause) {
      console.error('Failed to save skill', cause);
      setError(t('operation-failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = (skill: Skill) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-will-be-delete-resource-are-you-sure'),
      onConfirm: async () => {
        await api.skills.delete.mutate({ id: skill.id });
        await load();
      },
    });
  };

  const openTag = (tag: string) => {
    navigate(`/?path=all&searchText=%23${encodeURIComponent(tag)}`);
  };

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-24 md:px-6">
      <div className="flex items-center gap-2 pt-2">
        <Icon icon="tabler:sparkles" width="24" height="24" />
        <h1 className="text-xl font-bold">{t('skills')}</h1>
      </div>

      <Card>
        <CardContent className="gap-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t('overall-mastery')}</span>
            <span className="text-muted-foreground">{overallMastery}%</span>
          </div>
          <Progress value={overallMastery} aria-label={t('overall-mastery')} />
        </CardContent>
      </Card>

      <div className="relative">
        <Icon icon="lets-icons:search" width="16" height="16" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('search')}
          className="pl-9"
          placeholder={t('search-skills')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {error && <p className="rounded-xl bg-destructive/10 p-3 text-destructive">{error}</p>}
      <LoadingAndEmpty isLoading={isLoading} isEmpty={!visible.length} emptyMessage={t('no-skills-yet')} />

      <div className="grid gap-3 sm:grid-cols-2">
        {!isLoading && visible.map((skill) => (
          <Card key={skill.id}>
            <CardContent className="gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{skill.name}</h2>
                  <p className="text-xs text-muted-foreground">{t('level-n', { n: skill.level })}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => openEdit(skill)}>
                    <Icon icon="hugeicons:edit-02" width="18" height="18" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={t('delete')} onClick={() => remove(skill)}>
                    <Icon icon="hugeicons:delete-02" width="18" height="18" />
                  </Button>
                </div>
              </div>
              {skill.description && <p className="line-clamp-2 text-sm text-muted-foreground">{skill.description}</p>}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('mastery')}</span>
                  <span>{skill.mastery}%</span>
                </div>
                <Progress value={skill.mastery} aria-label={`${skill.name} ${t('mastery')}`} />
              </div>
              <div className="flex flex-wrap gap-1">
                {(skill.tags ?? []).map((tag) => (
                  <button key={tag} type="button" onClick={() => openTag(tag)} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80" aria-label={`#${tag}`}>
                    #{tag}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <PlanningFab label={t('add-skill')} onPress={openCreate} />

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open && !isSaving) setIsDialogOpen(false); }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId == null ? t('add-skill') : t('edit')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <Label htmlFor="skill-name">{t('skill-name')}</Label>
              <Input
                id="skill-name"
                autoFocus
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (form.name.trim() && !isSaving) void save();
                  }
                }}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill-description">{t('description')}</Label>
              <Textarea id="skill-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={isSaving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="skill-level">{t('level')}</Label>
                <Input
                  id="skill-level"
                  type="number"
                  min={1}
                  max={5}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: Math.min(5, Math.max(1, Number(e.target.value) || 1)) }))}
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skill-mastery">{t('mastery')}</Label>
                <Input
                  id="skill-mastery"
                  type="number"
                  min={0}
                  max={100}
                  value={form.mastery}
                  onChange={(e) => setForm((f) => ({ ...f, mastery: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))}
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill-tags">{t('tags')}</Label>
              <Input id="skill-tags" placeholder={t('tags-placeholder')} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} disabled={isSaving} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{t('level-n', { n: form.level })}</Badge>
              <Badge variant="outline">{form.mastery}%</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>{t('cancel')}</Button>
            <Button onClick={() => void save()} disabled={!form.name.trim() || isSaving} loading={isSaving}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
