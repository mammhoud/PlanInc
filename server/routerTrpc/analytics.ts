import { z } from "zod"
import dayjs from "@shared/lib/dayjs"

import { router, authProcedure } from "../middleware"
import { db, stripIdPrefix } from "../db"
import { select as surrealSelect } from "../surreal"

export const analyticsRouter = router({
  dailyNoteCount: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/daily-note-count', summary: 'Query daily note count', protect: true, tags: ['Analytics'] } })
    .input(z.void())
    .output(z.array(z.object({
      date: z.string(),
      count: z.number()
    })))
    .mutation(async function ({ ctx }) {
      // SurrealDB: group by computed day (replaces to_char + GROUP BY).
      const rows = await surrealSelect<any>(
        `SELECT time::format(createdAt, '%Y-%m-%d') AS day, count() AS c
         FROM notes WHERE accountId = ${parseInt(ctx.id)}
           AND createdAt >= type::datetime(${JSON.stringify(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())})
         GROUP BY day;`
      );
      const dailyStats = rows
        .map(r => ({ date: r.day, count: r.c }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return dailyStats.map(stat => ({
        date: stat.date,
        count: Number(stat.count)
      }));
    }),

  monthlyStats: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/monthly-stats', summary: 'Query monthly statistics', protect: true, tags: ['Analytics'] } })
    .input(z.object({
      month: z.string()
    }))
    .output(z.object({
      noteCount: z.number(),
      totalWords: z.number(),
      maxDailyWords: z.number(),
      activeDays: z.number(),
      tagStats: z.array(z.object({
        tagName: z.string(),
        count: z.number()
      })).optional()
    }))
    .mutation(async function ({ ctx, input }) {
      const startDate = dayjs(input.month).startOf('month').toDate()
      const endDate = dayjs(input.month).endOf('month').toDate()

      const noteCount = await db.notes.count({
        where: {
          accountId: parseInt(ctx.id),
          createdAt: {
            gte: startDate,
            lte: endDate
          }
        }
      })

      // SurrealDB: per-day word sums via array group (replaces SUM(LENGTH(content)) GROUP BY).
      const noteRows = await surrealSelect<any>(
        `SELECT time::format(createdAt, '%Y-%m-%d') AS day, string::len(content) AS len
         FROM notes WHERE accountId = ${parseInt(ctx.id)}
           AND createdAt >= type::datetime(${JSON.stringify(startDate.toISOString())})
           AND createdAt <= type::datetime(${JSON.stringify(endDate.toISOString())});`
      )
      const perDay = new Map<string, number>()
      for (const row of noteRows) {
        perDay.set(row.day, (perDay.get(row.day) || 0) + Number(row.len || 0))
      }
      const wordStats = [...perDay.entries()]
        .map(([date, words]) => ({ date, words: BigInt(words) }))
        .sort((a, b) => (b.words > a.words ? 1 : b.words < a.words ? -1 : 0))

      const totalWords = wordStats.reduce((sum, stat) => sum + Number(stat.words), 0)
      const maxDailyWords = wordStats.length > 0 ? Number(wordStats[0]!.words) : 0
      const activeDays = wordStats.length

      // SurrealDB: compute tag usage counts via a grouped join subquery.
      const tagCountRows = await surrealSelect<any>(
        `SELECT name, count() AS c FROM tag
         WHERE accountId = ${parseInt(ctx.id)}
           AND id IN (SELECT value tagId FROM tagsToNote
                      WHERE noteId IN (SELECT value id FROM notes WHERE accountId = ${parseInt(ctx.id)}))
         GROUP BY name;`
      )
      const tagStats = tagCountRows
        .map(r => ({ name: r.name, _count: { tagsToNote: r.c } }))
        .sort((a, b) => b._count.tagsToNote - a._count.tagsToNote)

      const validTags = tagStats.filter(tag => tag._count.tagsToNote > 0)
      const TOP_TAG_COUNT = 10
      const topTags = validTags.slice(0, TOP_TAG_COUNT)
      
      const otherTagsCount = validTags.slice(TOP_TAG_COUNT).reduce((sum, tag) => sum + tag._count.tagsToNote, 0)

      const finalTagStats = [
        ...topTags.map(tag => ({
          tagName: tag.name,
          count: tag._count.tagsToNote
        }))
      ]

      if (otherTagsCount > 0) {
        finalTagStats.push({
          tagName: 'Others',
          count: otherTagsCount
        })
      }

      return {
        noteCount,
        totalWords,
        maxDailyWords,
        activeDays,
        tagStats: finalTagStats
      }
    })
})