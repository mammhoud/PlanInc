import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

const ticketSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['open', 'in_progress', 'blocked', 'done']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  accountId: z.number().int(),
  noteId: z.number().int().nullable(),
  studyItemId: z.number().int().nullable(),
  category: z.string(),
  tags: z.array(z.string()),
  customFields: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const ticketInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(''),
  status: z.enum(['open', 'in_progress', 'blocked', 'done']).default('open'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  noteId: z.number().int().nullable().optional(),
  studyItemId: z.number().int().nullable().optional(),
  category: z.string().trim().max(80).default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  customFields: z.record(z.string(), z.unknown()).default({}),
});

// Omit create defaults on update so a status-only patch does not wipe title/description.
const ticketUpdateInput = z.object({
  id: z.number().int(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  status: z.enum(['open', 'in_progress', 'blocked', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  noteId: z.number().int().nullable().optional(),
  studyItemId: z.number().int().nullable().optional(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

// Keep tags in sync with category: add the category as a tag, drop the previous category tag.
function mergeCategoryTag(tags: string[], category: string, previousCategory: string): string[] {
  const next = tags.filter((tag) => tag !== previousCategory);
  const trimmed = category.trim();
  if (trimmed) next.push(trimmed);
  return [...new Set(next.filter(Boolean))];
}

export const ticketRouter = router({
  list: authProcedure.input(z.object({
    status: ticketSchema.shape.status.optional(),
  }).optional()).output(z.array(ticketSchema)).query(async ({ ctx, input }) => {
    return db.tickets.findMany({
      where: { accountId: Number(ctx.id), ...(input?.status ? { status: input.status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }),
  get: authProcedure.input(z.object({ id: z.number().int() })).output(ticketSchema).query(async ({ ctx, input }) => {
    const row = await db.tickets.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!row) throw new Error('Ticket not found');
    return row;
  }),
  create: authProcedure.input(ticketInput).output(ticketSchema).mutation(async ({ ctx, input }) => {
    return db.tickets.create({ data: { ...input, accountId: Number(ctx.id), noteId: input.noteId ?? null, studyItemId: input.studyItemId ?? null, tags: [...new Set(mergeCategoryTag(input.tags, input.category, ''))] } });
  }),
  update: authProcedure.input(ticketUpdateInput).output(ticketSchema).mutation(async ({ ctx, input }) => {
    const current = await db.tickets.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Ticket not found');
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
    if (!Object.keys(patch).length) return current;
    return db.tickets.update({ where: { id }, data: patch });
  }),
  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.tickets.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Ticket not found');
    await db.tickets.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
