import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

/**
 * Study items are the student-facing planning surface: free-form topics plus
 * question/answer flashcards scheduled with a simplified SM-2 spaced
 * repetition state (ease, interval, reps, due date).
 */

const srsRatings = ['again', 'hard', 'good', 'easy'] as const;
type SrsRating = (typeof srsRatings)[number];

const studySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['planned', 'active', 'complete']),
  sourceUrl: z.string(),
  accountId: z.number().int(),
  noteId: z.number().int().nullable(),
  category: z.string(),
  tags: z.array(z.string()),
  customFields: z.record(z.string(), z.unknown()),
  // Q/A flashcard fields (empty string = not a question card).
  question: z.string(),
  answer: z.string(),
  // SM-2 scheduling state for spaced repetition.
  srsEase: z.number(),
  srsInterval: z.number(),
  srsReps: z.number(),
  srsLapses: z.number(),
  srsDueAt: z.coerce.date().nullable(),
  srsLastAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const studyInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(''),
  status: z.enum(['planned', 'active', 'complete']).default('planned'),
  sourceUrl: z.string().url().or(z.literal('')).default(''),
  noteId: z.number().int().nullable().optional(),
  category: z.string().trim().max(80).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  customFields: z.record(z.string(), z.unknown()).default({}),
  question: z.string().max(20000).default(''),
  answer: z.string().max(20000).default(''),
});

// Keep tags in sync with category: add the category as a tag, drop the previous category tag.
function mergeCategoryTag(tags: string[], category: string, previousCategory: string): string[] {
  const next = tags.filter((tag) => tag !== previousCategory);
  const trimmed = category.trim();
  if (trimmed) next.push(trimmed);
  return [...new Set(next.filter(Boolean))];
}

const studyListInput = z.object({
  searchText: z.string().max(200).default('').optional(),
  status: z.enum(['planned', 'active', 'complete']).optional(),
  category: z.string().max(80).optional(),
  kind: z.enum(['all', 'note', 'question']).default('all').optional(),
  dueOnly: z.boolean().default(false).optional(),
});

// Same as skills: `.partial()` alone keeps create defaults and would wipe
// description/status/question on a title-only update.
const studyUpdateInput = z.object({
  id: z.number().int(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(['planned', 'active', 'complete']).optional(),
  sourceUrl: z.string().url().or(z.literal('')).optional(),
  noteId: z.number().int().nullable().optional(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  question: z.string().max(20000).optional(),
  answer: z.string().max(20000).optional(),
});

/** SM-2-ish grade application. First schedule defaults a new card to 1 day. */
function applySm2(
  current: { srsEase: number; srsInterval: number; srsReps: number; srsLapses: number },
  rating: SrsRating,
) {
  let ease = current.srsEase > 0 ? current.srsEase : 2.5;
  let interval = current.srsInterval > 0 ? current.srsInterval : 0;
  let reps = current.srsReps > 0 ? current.srsReps : 0;
  let lapses = current.srsLapses > 0 ? current.srsLapses : 0;

  if (rating === 'again') {
    lapses += 1;
    reps = 0;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0; // due again today
  } else if (rating === 'hard') {
    ease = Math.max(1.3, ease - 0.15);
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    reps += 1;
  } else if (rating === 'good') {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
    reps += 1;
  } else {
    ease = Math.min(3.0, ease + 0.15);
    interval = interval <= 0 ? 4 : Math.max(4, Math.round(interval * ease * 1.3));
    reps += 1;
  }

  const due = new Date();
  if (interval <= 0) {
    // Same-day requeue: due immediately so the card reappears in the queue.
    due.setHours(23, 59, 0, 0);
  } else {
    due.setDate(due.getDate() + interval);
  }

  return { srsEase: ease, srsInterval: interval, srsReps: reps, srsLapses: lapses, srsDueAt: due, srsLastAt: new Date() };
}

function matchesSearch(item: any, needle: string): boolean {
  if (!needle) return true;
  const hay = [item.title, item.description, item.question, item.answer, item.category, ...(item.tags ?? [])]
    .join(' ')
    .toLowerCase();
  return hay.includes(needle.toLowerCase());
}

function isDue(item: any, now = new Date()): boolean {
  if (!item.question && !item.answer) return false;
  if (!item.srsDueAt) return true; // never reviewed → new card is due
  return new Date(item.srsDueAt).getTime() <= now.getTime();
}

export const studyRouter = router({
  list: authProcedure
    .input(studyListInput.optional())
    .output(z.array(studySchema))
    .query(async ({ ctx, input }) => {
      const rows = await db.studyItems.findMany({
        where: { accountId: Number(ctx.id) },
        orderBy: { createdAt: 'desc' },
      });
      const searchText = (input?.searchText ?? '').trim();
      const kind = input?.kind ?? 'all';
      return rows.filter((item) => {
        if (input?.status && item.status !== input.status) return false;
        if (input?.category && item.category !== input.category) return false;
        if (kind === 'question' && !item.question && !item.answer) return false;
        if (kind === 'note' && item.question && item.answer) return false;
        if (input?.dueOnly && !isDue(item)) return false;
        return matchesSearch(item, searchText);
      });
    }),

  get: authProcedure
    .input(z.object({ id: z.number().int() }))
    .output(studySchema)
    .query(async ({ ctx, input }) => {
      const row = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
      if (!row) throw new Error('Study item not found');
      return row;
    }),

  /** Due question cards for the spaced-repetition review deck. */
  dueList: authProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).optional())
    .output(z.array(studySchema))
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const rows = await db.studyItems.findMany({
        where: { accountId: Number(ctx.id) },
        orderBy: { createdAt: 'desc' },
      });
      const now = new Date();
      return rows.filter((item) => isDue(item, now)).slice(0, limit);
    }),

  review: authProcedure
    .input(z.object({ id: z.number().int(), rating: z.enum(srsRatings) }))
    .output(studySchema)
    .mutation(async ({ ctx, input }) => {
      const current = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
      if (!current) throw new Error('Study item not found');
      const next = applySm2(
        {
          srsEase: Number(current.srsEase) || 2.5,
          srsInterval: Number(current.srsInterval) || 0,
          srsReps: Number(current.srsReps) || 0,
          srsLapses: Number(current.srsLapses) || 0,
        },
        input.rating,
      );
      return db.studyItems.update({ where: { id: input.id }, data: next });
    }),

  create: authProcedure.input(studyInput).output(studySchema).mutation(async ({ ctx, input }) => {
    const hasCard = Boolean(input.question || input.answer);
    return db.studyItems.create({
      data: {
        ...input,
        accountId: Number(ctx.id),
        noteId: input.noteId ?? null,
        tags: [...new Set(mergeCategoryTag(input.tags, input.category, ''))],
        question: input.question,
        answer: input.answer,
        // New cards are due immediately so the review deck can pick them up.
        srsEase: 2.5,
        srsInterval: 0,
        srsReps: 0,
        srsLapses: 0,
        srsDueAt: hasCard ? new Date() : null,
        srsLastAt: null,
      },
    });
  }),

  update: authProcedure.input(studyUpdateInput).output(studySchema).mutation(async ({ ctx, input }) => {
    const current = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Study item not found');
    const { id, ...data } = input;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) patch[key] = value;
    }
    // Category change updates tags: drop old category tag, add new one.
    if (patch.category !== undefined || patch.tags !== undefined) {
      const nextTags = Array.isArray(patch.tags) ? patch.tags : current.tags ?? [];
      const nextCategory = typeof patch.category === 'string' ? patch.category : current.category ?? '';
      patch.tags = [...new Set(mergeCategoryTag(nextTags, nextCategory, patch.category !== undefined ? (current.category ?? '') : ''))];
    }
    // Editing a card without clearing SRS keeps its schedule; adding Q/A to a
    // plain topic schedules it for the next review.
    const nextQuestion = (patch.question as string | undefined) ?? current.question;
    const nextAnswer = (patch.answer as string | undefined) ?? current.answer;
    if ((nextQuestion || nextAnswer) && !current.srsDueAt && current.srsReps === 0) {
      patch.srsDueAt = patch.srsDueAt ?? new Date();
    }
    if (!Object.keys(patch).length) return current;
    return db.studyItems.update({ where: { id }, data: patch });
  }),

  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Study item not found');
    await db.studyItems.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
