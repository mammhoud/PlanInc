import { z } from "zod"
import dayjs from "@shared/lib/dayjs"

import { router, authProcedure } from "../middleware"
import { computeDailyInsights, computeMonthlyInsights } from "../lib/insights"

const tagStat = z.object({
  tagName: z.string(),
  count: z.number()
})

const monthlyInsight = z.object({
  noteCount: z.number(),
  totalWords: z.number(),
  maxDailyWords: z.number(),
  activeDays: z.number(),
  tagStats: z.array(tagStat)
})

export const analyticsRouter = router({
  dailyNoteCount: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/daily-note-count', summary: 'Query daily note count', protect: true, tags: ['Analytics'] } })
    .input(z.void())
    .output(z.array(z.object({
      date: z.string(),
      count: z.number()
    })))
    .mutation(async function ({ ctx }) {
      return computeDailyInsights(parseInt(ctx.id))
    }),

  monthlyStats: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/monthly-stats', summary: 'Query monthly statistics', protect: true, tags: ['Analytics'] } })
    .input(z.object({
      month: z.string()
    }))
    .output(monthlyInsight)
    .mutation(async function ({ ctx, input }) {
      return computeMonthlyInsights(parseInt(ctx.id), input.month)
    }),

  // Single entry point (PI-024 #10): both consumers read the same computation.
  insights: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/insights', summary: 'Query consolidated insights', protect: true, tags: ['Analytics'] } })
    .input(z.object({
      month: z.string().optional()
    }))
    .output(z.object({
      month: z.string(),
      daily: z.array(z.object({ date: z.string(), count: z.number() })),
      monthly: monthlyInsight
    }))
    .mutation(async function ({ ctx, input }) {
      const accountId = parseInt(ctx.id)
      const month = input.month ?? dayjs().format('YYYY-MM')
      const [daily, monthly] = await Promise.all([
        computeDailyInsights(accountId),
        computeMonthlyInsights(accountId, month)
      ])
      return { month, daily, monthly }
    })
})
