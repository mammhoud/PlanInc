import { useEffect, useMemo, useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { PlanningStats } from '@/components/PlanIncAnalytics/PlanningStats';
import { PlanningFab } from '@/components/PlanincPlanning/PlanningFab';

type Ticket = { id: number; title: string; status: 'open' | 'in_progress' | 'blocked' | 'done'; priority: 'low' | 'medium' | 'high' | 'critical'; updatedAt: string };
type StudyItem = { id: number; title: string; status: 'planned' | 'active' | 'complete'; updatedAt: string };

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [study, setStudy] = useState<StudyItem[]>([]);
  const [noteStats, setNoteStats] = useState<{ noteCount?: number; totalWords?: number; activeDays?: number }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.tickets.list.query(),
      api.study.list.query(),
      api.analytics.monthlyStats.mutate({ month: dayjs().format('YYYY-MM') }),
    ])
      .then(([nextTickets, nextStudy, nextStats]) => {
        setTickets(nextTickets as Ticket[]);
        setStudy(nextStudy as StudyItem[]);
        setNoteStats(nextStats as typeof noteStats);
      })
      .catch((cause) => {
        console.error('Failed to load dashboard data', cause);
        setError(t('operation-failed'));
      })
      .finally(() => setIsLoading(false));
  }, [t]);

  const completedTasks = tickets.filter((item) => item.status === 'done').length + study.filter((item) => item.status === 'complete').length;
  const totalTasks = tickets.length + study.length;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const activeWork = tickets.filter((item) => item.status === 'in_progress').length;
  const blockedWork = tickets.filter((item) => item.status === 'blocked').length;
  const activeStudy = study.filter((item) => item.status === 'active').length;
  const recentItems = useMemo(
    () => [
      ...tickets.map((item) => ({ ...item, kind: 'ticket' as const })),
      ...study.map((item) => ({ ...item, kind: 'study' as const })),
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6),
    [tickets, study],
  );

  return (
    <ScrollArea fixMobileTopBar className="mx-auto w-full max-w-7xl space-y-5 px-3 pb-24 md:px-6">
      <section className="dashboard-hero rounded-[1.5rem] border border-divider/60 p-5 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">{dayjs().format('MMMM D, YYYY')}</p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{t('dashboard-title')}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-foreground-500">{t('dashboard-description')}</p>
          </div>
          <div className="flex gap-2">
            {/* Links styled with `buttonVariants` rather than `<Button asChild>`:
                the action is a navigation, so it should stay an anchor, and the
                slot-based `asChild` path is not what this Button supports. */}
            <Link to="/tickets" className={buttonVariants()}>
              <Icon icon="hugeicons:add-01" width="16" height="16" />
              {t('new-ticket')}
            </Link>
            <Link to="/study" className={buttonVariants({ variant: 'secondary' })}>{t('open-study')}</Link>
          </div>
        </div>
      </section>

      {error && <p className="rounded-xl bg-danger-50 p-3 text-danger">{error}</p>}
      {isLoading ? <p className="py-8 text-center text-foreground-500">{t('in-progress')}</p> : (
        <>
          <PlanningStats items={[
            { label: t('notes-this-month'), value: noteStats.noteCount ?? 0, icon: 'hugeicons:note', accent: 'text-primary' },
            { label: t('completed-tasks'), value: completedTasks, icon: 'hugeicons:edit-02', accent: 'text-success' },
            { label: t('active-work'), value: activeWork, icon: 'hugeicons:analytics-01', accent: 'text-warning' },
            { label: t('active-study'), value: activeStudy, icon: 'hugeicons:book-edit', accent: 'text-secondary' },
          ]} />

          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
            <Card className="border border-divider/60 bg-background/80 shadow-sm">
              <CardContent className="flex flex-col gap-5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="text-lg font-semibold">{t('delivery-report')}</h2><p className="text-sm text-foreground-500">{t('delivery-report-description')}</p></div>
                  <Badge variant={completionRate >= 70 ? 'success' : 'warning'}>{completionRate}%</Badge>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-content2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completionRate}%` }} /></div>
                {/* Three stats side by side is a desktop reading; at phone widths
                    the labels wrap into each other, so they stack until sm. */}
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-foreground-500">{t('total-items')}</p><strong>{totalTasks}</strong></div>
                  <div><p className="text-foreground-500">{t('blocked')}</p><strong>{blockedWork}</strong></div>
                  <div><p className="text-foreground-500">{t('words-this-month')}</p><strong>{noteStats.totalWords ?? 0}</strong></div>
                </div>
              </CardContent>
            </Card>
            <Card className="border border-divider/60 bg-background/80 shadow-sm">
              <CardContent className="flex flex-col gap-4 p-5">
                <div><h2 className="text-lg font-semibold">{t('completed-tasks')}</h2><p className="text-sm text-foreground-500">{t('completed-tasks-description')}</p></div>
                <div className="flex items-end gap-3"><strong className="text-5xl font-semibold tracking-tight">{completedTasks}</strong><span className="pb-2 text-sm text-foreground-500">{t('items')}</span></div>
                <Link to="/tickets" className={buttonVariants({ variant: 'secondary', className: 'w-fit' })}>{t('review-tickets')}</Link>
              </CardContent>
            </Card>
          </div>

          <Card className="border border-divider/60 bg-background/80 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">{t('recent-activity')}</h2><p className="text-sm text-foreground-500">{t('recent-activity-description')}</p></div><Link to="/graph" className={buttonVariants({ variant: 'ghost' })}>{t('view-graph')}</Link></div>
              {recentItems.length ? <div className="grid gap-2 md:grid-cols-2">{recentItems.map((item) => <Link key={`${item.kind}-${item.id}`} to={item.kind === 'ticket' ? '/tickets' : '/study'} className="flex items-center justify-between rounded-xl border border-divider/60 p-3 transition-colors hover:bg-content2"><div className="flex min-w-0 items-center gap-3"><Icon icon={item.kind === 'ticket' ? 'tabler:list-check' : 'hugeicons:book-edit'} width="18" height="18" className="shrink-0 text-foreground-500" /><span className="truncate text-sm font-medium">{item.title}</span></div><Badge variant="secondary">{t(item.status)}</Badge></Link>)}</div> : <p className="py-5 text-sm text-foreground-500">{t('no-recent-activity')}</p>}
            </CardContent>
          </Card>
        </>
      )}
      <PlanningFab label={t('new-ticket')} onPress={() => navigate('/tickets')} />
    </ScrollArea>
  );
}
