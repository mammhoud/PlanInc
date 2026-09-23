import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

/**
 * Lightweight learning skills: name, level 1–5, free-form tags that link the
 * skill back to notes/study items by hashtag, and a 0–100 mastery bar.
 */

const skillSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  name: z.string(),
  description: z.string(),
  level: z.number().int(),
  mastery: z.number().int(),
  tags: z.array(z.string()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const skillInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  level: z.number().int().min(1).max(5).default(1),
  mastery: z.number().int().min(0).max(100).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});

// Partial updates must not re-apply create defaults for omitted fields
// (`.partial()` keeps `.default()`, which would wipe description/tags/level).
const skillUpdateInput = z.object({
  id: z.number().int(),
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  level: z.number().int().min(1).max(5).optional(),
  mastery: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export const skillRouter = router({
  list: authProcedure.input(z.void()).output(z.array(skillSchema)).query(async ({ ctx }) => {
    return db.skills.findMany({ where: { accountId: Number(ctx.id) }, orderBy: { createdAt: 'desc' } });
  }),

  create: authProcedure.input(skillInput).output(skillSchema).mutation(async ({ ctx, input }) => {
    return db.skills.create({
      data: { ...input, accountId: Number(ctx.id), tags: [...new Set(input.tags)] },
    });
  }),

  update: authProcedure.input(skillUpdateInput).output(skillSchema).mutation(async ({ ctx, input }) => {
    const current = await db.skills.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Skill not found');
    const { id, ...data } = input;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) patch[key] = value;
    }
    if (patch.tags) patch.tags = [...new Set(patch.tags as string[])];
    if (!Object.keys(patch).length) return current;
    return db.skills.update({ where: { id }, data: patch });
  }),

  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.skills.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Skill not found');
    await db.skills.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
