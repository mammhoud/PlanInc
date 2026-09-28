import dayjs from "@shared/lib/dayjs"

import { db } from "../db"
import { select as surrealSelect } from "../surreal"

export type DailyInsight = { date: string; count: number }

export type MonthlyInsight = {
  noteCount: number
  totalWords: number
  maxDailyWords: number
  activeDays: number
  tagStats: { tagName: string; count: number }[]
}

/**
 * Single entry point for derived counts so the analytics procedures and any
 * scheduled/reporting consumer cannot drift. Callers pass the numeric account id
 * (ctx.id) — this module never reads request state.
 */
export async function computeDailyInsights(accountId: number): Promise<DailyInsight[]> {
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const rows = await surrealSelect<any>(
    `SELECT time::format(createdAt, '%Y-%m-%d') AS day, count() AS c
     FROM notes WHERE accountId = ${accountId}
       AND createdAt >= type::datetime(${JSON.stringify(since)})
     GROUP BY day;`
  )
  return rows
    .map(r => ({ date: r.day, count: r.c }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(stat => ({ date: stat.date, count: Number(stat.count) }))
}

export async function computeMonthlyInsights(
  accountId: number,
  month: string
): Promise<MonthlyInsight> {
  const startDate = dayjs(month).startOf("month").toDate()
  const endDate = dayjs(month).endOf("month").toDate()

  const noteCount = await db.notes.count({
    where: {
      accountId,
      createdAt: { gte: startDate, lte: endDate },
    },
  })

  // SurrealDB: per-day word sums via array group (replaces SUM(LENGTH(content)) GROUP BY).
  const noteRows = await surrealSelect<any>(
    `SELECT time::format(createdAt, '%Y-%m-%d') AS day, string::len(content) AS len
     FROM notes WHERE accountId = ${accountId}
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

  // tagsToNote stores numeric noteId/tagId while notes/tag use record ids
  // (notes:1 / tag:1). Count usage by number id, then map names in JS.
  const usageRows = await surrealSelect<any>(
    `SELECT tagId, count() AS c FROM tagsToNote
     WHERE noteId IN (SELECT VALUE meta::id(id) FROM notes
                      WHERE accountId = ${accountId}
                        AND createdAt >= type::datetime(${JSON.stringify(startDate.toISOString())})
                        AND createdAt <= type::datetime(${JSON.stringify(endDate.toISOString())}))
     GROUP BY tagId;`
  )
  const tagRows = await surrealSelect<any>(
    `SELECT id, name FROM tag WHERE accountId = ${accountId};`
  )
  const tagNameById = new Map<number, string>()
  for (const row of tagRows) {
    const numId = Number(String(row.id).split(":").pop())
    if (Number.isFinite(numId) && row.name != null) tagNameById.set(numId, String(row.name))
  }
  const tagStats = usageRows
    .map(r => ({
      name: tagNameById.get(Number(r.tagId)) ?? String(r.tagId),
      _count: { tagsToNote: Number(r.c) || 0 },
    }))
    .filter(tag => tag._count.tagsToNote > 0)
    .sort((a, b) => b._count.tagsToNote - a._count.tagsToNote)

  const TOP_TAG_COUNT = 10
  const topTags = tagStats.slice(0, TOP_TAG_COUNT)
  const otherTagsCount = tagStats.slice(TOP_TAG_COUNT).reduce((sum, tag) => sum + tag._count.tagsToNote, 0)

  const finalTagStats = topTags.map(tag => ({ tagName: tag.name, count: tag._count.tagsToNote }))
  if (otherTagsCount > 0) finalTagStats.push({ tagName: "Others", count: otherTagsCount })

  return { noteCount, totalWords, maxDailyWords, activeDays, tagStats: finalTagStats }
}
