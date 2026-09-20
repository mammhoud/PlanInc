import React, { useEffect } from 'react'
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
import { Icon } from '@/components/Common/Iconify/icons'
import { ScrollArea } from '@/components/Common/ScrollArea'

const Analytics = observer(() => {
  const analyticsStore = RootStore.Get(AnalyticsStore)
  const { t } = useTranslation()
  const [selectedMonth, setSelectedMonth] = React.useState(dayjs().format("YYYY-MM"))
  analyticsStore.use()

  useEffect(() => {
    analyticsStore.setSelectedMonth(selectedMonth)
  }, [selectedMonth])

  const currentMonth = dayjs().format("YYYY-MM")
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    return dayjs().subtract(i, "month").format("YYYY-MM")
  })

  const data = analyticsStore.dailyNoteCount.value?.map(item => [
    item.date,
    item.count
  ] as [string, number]) ?? []

  const stats = analyticsStore.monthlyStats.value

  return (
    <ScrollArea onBottom={() => { }} fixMobileTopBar className="px-6 space-y-2 md:p-6 md:space-y-6  mx-auto max-w-7xl" >
      <div className="w-72">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-[160px] justify-between bg-default-100 hover:bg-default-200"
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
                className="data-[selected=true]:bg-primary-500/20"
                data-selected={selectedMonth === month}
              >
                {month}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <StatsCards stats={stats ?? {}} />

      <HeatMap
        data={data}
        title={t('heatMapTitle')}
        description={t('heatMapDescription')}
      />

      {
        stats?.tagStats && stats.tagStats.length > 0 && (
          <TagDistributionChart tagStats={stats.tagStats} />
        )
      }
    </ScrollArea >
  )
})

export default Analytics