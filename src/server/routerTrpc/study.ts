import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

const studySchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['planned', 'active', 'complete']),
  sourceUrl: z.string(),
  accountId: z.number().int(),
  noteId: z.number().int().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const studyInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(''),
  status: z.enum(['planned', 'active', 'complete']).default('planned'),
  sourceUrl: z.string().url().or(z.literal('')).default(''),
  noteId: z.number().int().nullable().optional(),
});

export const studyRouter = router({
  list: authProcedure.input(z.void()).output(z.array(studySchema)).query(async ({ ctx }) => {
    return db.studyItems.findMany({ where: { accountId: Number(ctx.id) }, orderBy: { createdAt: 'desc' } });
  }),
  create: authProcedure.input(studyInput).output(studySchema).mutation(async ({ ctx, input }) => {
    return db.studyItems.create({ data: { ...input, accountId: Number(ctx.id), noteId: input.noteId ?? null } });
  }),
  update: authProcedure.input(studyInput.partial().extend({ id: z.number().int() })).output(studySchema).mutation(async ({ ctx, input }) => {
    const current = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Study item not found');
    const { id, ...data } = input;
    return db.studyItems.update({ where: { id }, data });
  }),
  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.studyItems.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Study item not found');
    await db.studyItems.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
