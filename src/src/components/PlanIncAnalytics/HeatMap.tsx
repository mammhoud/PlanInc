import * as echarts from 'echarts'
import { useEffect, useRef } from "react"
import dayjs from "dayjs"
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'
import { readToken } from '@/lib/cssTokens'
import { HEATMAP_SCALE } from '@/lib/colorSeries'
import { useSideNav } from '@/platform/PlatformProvider';

interface HeatMapProps {
  data: Array<[string, number]>
  title?: string
  description?: string
}

export const HeatMap = ({ data, title, description }: HeatMapProps) => {
  const chartRef = useRef<HTMLDivElement>(null)
  const isPc = useSideNav()
  const { theme } = useTheme()
  const { t } = useTranslation()
  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)

    const handleResize = () => {
      if (!chartRef.current) return
      chart.resize()

      const width = chartRef.current.clientWidth - 30
      const height = chartRef.current.clientHeight

      const minCellSize = 14

      let cellSize
      if (!isPc) {
        cellSize = minCellSize
      } else {
        const cellSizeFromWidth = Math.floor(width / 53)
        const cellSizeFromHeight = Math.floor((height - 50) / 7)
        cellSize = Math.min(cellSizeFromWidth, cellSizeFromHeight)
      }

      chart.setOption({
        calendar: {
          cellSize: [cellSize, cellSize],
          top: 30,
          left: 0,
          right: !isPc ? 'auto' : 'auto'
        }
      })
    }
    window.addEventListener('resize', handleResize)

    const foregroundColor = readToken('foreground')
    const backgroundColor = readToken('card')
    const secondbackground = readToken('secondbackground')

    const option = {
      backgroundColor: backgroundColor,
      tooltip: {
        formatter: function (params: any) {
          return `${params.value[0]}: ${params.value[1]} ${t('notes')}`
        }
      },
      visualMap: {
        show: false,
        min: 0,
        max: 10,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        top: 'top',
        textStyle: {
          color: foregroundColor
        },
        inRange: {
          color: theme === 'dark' ? HEATMAP_SCALE.dark : HEATMAP_SCALE.light
        }
      },
      calendar: {
        top: 30,
        left: 'auto',
        right: 'auto',
        aspectScale: 1,
        gap: 3,
        range: [dayjs().subtract(1, 'year').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')],
        itemStyle: {
          borderWidth: isPc ? 5 : 2,
          borderColor: backgroundColor,
          borderRadius: 5,
          color: secondbackground
        },
        yearLabel: { show: false },
        dayLabel: {
          show: false,
          color: foregroundColor,
          nameMap: [t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')],
        },
        monthLabel: {
          color: foregroundColor,
          margin: 8
        },
        splitLine: {
          show: false
        }
      },
      series: [{
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data: data,
        itemStyle: {
          borderRadius: 3,
          borderWidth: 1,
          borderColor: readToken('chart-cell-border')
        },
        emphasis: {
          itemStyle: {
            borderColor: readToken('chart-cell-shadow'),
            borderWidth: 1,
            shadowBlur: 1,
            shadowColor: readToken('chart-cell-shadow')
          }
        },
        showEmptyItem: true,
        animation: false
      }]
    }

    chart.setOption(option)
    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.dispose()
    }
  }, [data, isPc])

  return (
    <div className="rounded-xl bg-card p-6 shadow-sm">
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-lg font-medium">{title}</h2>}
          {description && <p className="text-sm text-desc">{description}</p>}
        </div>
      )}
      <div className="overflow-x-auto md:overflow-x-hidden">
        <div ref={chartRef} className="w-full md:w-full h-[150px] md:h-[240px] min-w-[800px]" />
      </div>
    </div>
  )
} 