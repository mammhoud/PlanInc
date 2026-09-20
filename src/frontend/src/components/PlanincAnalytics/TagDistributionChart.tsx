import { Card, CardBody } from "@heroui/react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"
import * as echarts from 'echarts'
import { readToken } from '@/lib/cssTokens'
import { CATEGORICAL_SERIES } from '@/lib/colorSeries'
import { useIsPhone } from '@/platform/PlatformProvider';

interface TagDistributionChartProps {
  tagStats: {
    tagName: string
    count: number
  }[]
}

export const TagDistributionChart = observer(({ tagStats }: TagDistributionChartProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const chartRef = useRef<HTMLDivElement>(null)
  let chart: echarts.ECharts | null = null
  const isMobile = useIsPhone()

  useEffect(() => {
    if (!chartRef.current) return

    if (!chart) {
      chart = echarts.init(chartRef.current)
    }

    // Tokens resolve to the active theme's value, so the chart no longer needs
    // an `isDark` branch — and it follows a theme switch without a re-render
    // path of its own.
    const foreground = readToken('foreground')
    const muted = readToken('ignore')
    const cardBackground = readToken('card')

    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} ({d}%)'
      },
      legend: {
        type: 'scroll',
        orient: isMobile ? 'horizontal' : 'vertical',
        right: isMobile ? 'center' : 10,
        top: isMobile ? 'bottom' : 'center',
        bottom: isMobile ? 0 : undefined,
        textStyle: {
          color: foreground,
          fontSize: isMobile ? 12 : 14
        },
        pageTextStyle: {
          color: foreground
        },
        pageIconColor: foreground,
        pageIconInactiveColor: muted
      },
      series: [
        {
          name: t('tag-distribution'),
          type: 'pie',
          radius: isMobile ? ['30%', '60%'] : ['40%', '70%'],
          center: isMobile ? ['50%', '40%'] : ['40%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 10,
            borderColor: cardBackground,
            borderWidth: 2
          },
          label: {
            show: !isMobile,
            position: 'outer',
            formatter: '{b}\n{d}%',
            color: foreground
          },
          emphasis: {
            label: {
              show: true,
              fontSize: isMobile ? 12 : 14,
              fontWeight: 'bold'
            },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: readToken('chart-emphasis-shadow')
            }
          },
          labelLine: {
            show: !isMobile,
            length: 15,
            length2: 10,
            smooth: true
          },
          data: tagStats.map(item => ({
            value: item.count,
            name: item.tagName === 'Others' ? t('other-tags') : item.tagName
          }))
        }
      ],
      color: CATEGORICAL_SERIES
    }

    chart.setOption(option)

    const handleResize = () => {
      if (chart) {
        chart.resize()
        const newIsMobile = window.innerWidth < 768
        chart.setOption({
          legend: {
            orient: newIsMobile ? 'horizontal' : 'vertical',
            right: newIsMobile ? 'center' : 10,
            top: newIsMobile ? 'bottom' : 'center',
            bottom: newIsMobile ? 0 : undefined,
            textStyle: {
              fontSize: newIsMobile ? 12 : 14
            }
          },
          series: [{
            radius: newIsMobile ? ['30%', '60%'] : ['40%', '70%'],
            center: newIsMobile ? ['50%', '40%'] : ['40%', '50%'],
            label: {
              show: !newIsMobile
            },
            labelLine: {
              show: !newIsMobile
            }
          }]
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart?.dispose()
      chart = null
    }
  }, [tagStats, theme, t])

  return (
    <Card className="bg-background col-span-full" shadow="none">
      <CardBody>
        <p className="text-tiny uppercase font-bold mb-4">{t('tag-distribution')}</p>
        <div ref={chartRef} className="w-full h-[500px] md:h-[400px]" />
      </CardBody>
    </Card>
  )
}) 