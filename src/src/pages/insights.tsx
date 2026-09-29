import React, { useEffect, useState } from 'react'
import { observer } from "mobx-react-lite"
import { RootStore } from "@/store/root"
import { AnalyticsStore } from "@/store/analyticsStore"
import { useTranslation } from "react-i18next"
import { HeatMap } from "@/components/PlanIncAnalytics/HeatMap"
import { StatsCards } from "@/components/PlanIncAnalytics/StatsCards"
import { TagDistributionChart } from "@/components/PlanIncAnalytics/TagDistributionChart"
import dayjs from "dayjs"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Icon } from '@/components/Common/Iconify/icons'
import { ScrollArea } from '@/components/Common/ScrollArea'
import { api } from '@/lib/trpc'

type InsightsModal = 'analytics' | 'reports' | null

const Insights = observer(() => {
  const analyticsStore = RootStore.Get(AnalyticsStore)
  const { t } = useTranslation()
  const [selectedMonth, setSelectedMonth] = React.useState(dayjs().format("YYYY-MM"))
  const [openModal, setOpenModal] = useState<InsightsModal>(null)
  const [reportStats, setReportStats] = useState<any>(null)
  const [reportTickets, setReportTickets] = useState<any[]>([])
  const [reportStudy, setReportStudy] = useState<any[]>([])
  const [isReportLoading, setIsReportLoading] = useState(false)
  analyticsStore.use()

  useEffect(() => {
    analyticsStore.setSelectedMonth(selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    if (openModal !== 'reports') return
    let cancelled = false
    setIsReportLoading(true)
    void Promise.all([
      api.analytics.monthlyStats.mutate({ month: selectedMonth }),
      api.tickets.list.query(),
      api.study.list.query(),
    ]).then(([stats, tickets, study]) => {
      if (cancelled) return
      setReportStats(stats)
      setReportTickets(tickets as any[])
      setReportStudy(study as any[])
    }).catch((cause) => {
      console.error('Failed to load report data', cause)
    }).finally(() => {
      if (!cancelled) setIsReportLoading(false)
    })
    return () => { cancelled = true }
  }, [openModal, selectedMonth])

  const currentMonth = dayjs().format("YYYY-MM")
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    return dayjs().subtract(i, "month").format("YYYY-MM")
  })

  const data = analyticsStore.dailyNoteCount.value?.map(item => [
    item.date,
    item.count
  ] as [string, number]) ?? []

  const stats = analyticsStore.monthlyStats.value

  const monthPicker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-[160px] justify-between bg-muted hover:bg-muted/80"
        >
          <Icon icon="mdi:calendar" className="h-4 w-4" />
          {selectedMonth}
          <Icon icon="mdi:chevron-down" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Select month" className="max-h-[400px] overflow-y-auto">
        {last12Months.map((month) => (
          <DropdownMenuItem
            key={month}
            onSelect={() => setSelectedMonth(month)}
            data-selected={selectedMonth === month}
          >
            {month}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const openTicketsDone = reportTickets.filter((item) => item.status === 'done').length
  const openStudyActive = reportStudy.filter((item) => item.status === 'active').length

  return (
    <ScrollArea onBottom={() => { }} fixMobileTopBar className="px-6 space-y-4 md:p-6 md:space-y-6 mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('insights')}</h1>
          <p className="text-sm text-muted-foreground">{t('insights-description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {monthPicker}
          <Button onClick={() => setOpenModal('analytics')}>
            <Icon icon="hugeicons:analytics-01" width="16" height="16" />
            {t('analytics')}
          </Button>
          <Button variant="secondary" onClick={() => setOpenModal('reports')}>
            <Icon icon="ri:file-list-3-line" width="16" height="16" />
            {t('reports')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpenModal('analytics')}
          className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2">
            <Icon icon="hugeicons:analytics-01" width="20" height="20" className="text-primary" />
            <span className="font-semibold">{t('analytics')}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t('analytics-modal-description')}</p>
        </button>
        <button
          type="button"
          onClick={() => setOpenModal('reports')}
          className="rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/40"
        >
          <div className="flex items-center gap-2">
            <Icon icon="ri:file-list-3-line" width="20" height="20" className="text-primary" />
            <span className="font-semibold">{t('reports')}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t('reports-modal-description')}</p>
        </button>
      </div>

      <Dialog open={openModal === 'analytics'} onOpenChange={(open) => { if (!open) setOpenModal(null) }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('analytics')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <StatsCards stats={stats ?? {}} />
            <HeatMap
              data={data}
              title={t('heatMapTitle')}
              description={t('heatMapDescription')}
            />
            {stats?.tagStats && stats.tagStats.length > 0 && (
              <TagDistributionChart tagStats={stats.tagStats} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === 'reports'} onOpenChange={(open) => { if (!open) setOpenModal(null) }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('reports')}: {selectedMonth}</DialogTitle>
          </DialogHeader>
          {isReportLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('loading')}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('note-count')}</p>
                  <p className="text-2xl font-semibold">{reportStats?.noteCount ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('total-words')}</p>
                  <p className="text-2xl font-semibold">{reportStats?.totalWords ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('active-days')}</p>
                  <p className="text-2xl font-semibold">{reportStats?.activeDays ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('max-daily-words')}</p>
                  <p className="text-2xl font-semibold">{reportStats?.maxDailyWords ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('tickets')}</p>
                  <p className="text-2xl font-semibold">{reportTickets.length}</p>
                  <p className="text-xs text-muted-foreground">{t('done')}: {openTicketsDone}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t('study')}</p>
                  <p className="text-2xl font-semibold">{reportStudy.length}</p>
                  <p className="text-xs text-muted-foreground">{t('active')}: {openStudyActive}</p>
                </div>
              </div>
              {reportStats?.tagStats?.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">{t('tags')}</p>
                  <div className="flex flex-wrap gap-2">
                    {reportStats.tagStats.map((tag: { tagName: string; count: number }) => (
                      <span key={tag.tagName} className="rounded-full border border-border px-2.5 py-1 text-xs">
                        #{tag.tagName} · {tag.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
})

export default Insights
