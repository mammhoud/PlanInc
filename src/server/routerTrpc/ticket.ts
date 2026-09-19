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
});

export const ticketRouter = router({
  list: authProcedure.input(z.object({
    status: ticketSchema.shape.status.optional(),
  }).optional()).output(z.array(ticketSchema)).query(async ({ ctx, input }) => {
    return db.tickets.findMany({
      where: { accountId: Number(ctx.id), ...(input?.status ? { status: input.status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }),
  create: authProcedure.input(ticketInput).output(ticketSchema).mutation(async ({ ctx, input }) => {
    return db.tickets.create({ data: { ...input, accountId: Number(ctx.id), noteId: input.noteId ?? null, studyItemId: input.studyItemId ?? null, tags: [...new Set(input.tags)] } });
  }),
  update: authProcedure.input(ticketInput.partial().extend({ id: z.number().int() })).output(ticketSchema).mutation(async ({ ctx, input }) => {
    const current = await db.tickets.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Ticket not found');
    const { id, ...data } = input;
    return db.tickets.update({ where: { id }, data });
  }),
  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.tickets.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Ticket not found');
    await db.tickets.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
