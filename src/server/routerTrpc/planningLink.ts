import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

const entityType = z.enum(['note', 'ticket', 'study']);

const planningLinkSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  sourceType: entityType,
  sourceId: z.number().int(),
  targetType: entityType,
  targetId: z.number().int(),
  label: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const linkInput = z.object({
  sourceType: entityType,
  sourceId: z.number().int(),
  targetType: entityType,
  targetId: z.number().int(),
  label: z.string().trim().max(120).default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).refine((value) => !(value.sourceType === value.targetType && value.sourceId === value.targetId), {
  message: 'An item cannot link to itself',
});

const tableForType = {
  note: 'notes',
  ticket: 'tickets',
  study: 'studyItems',
} as const;

async function assertEntity(accountId: number, type: z.infer<typeof entityType>, id: number) {
  const entity = await db[tableForType[type]].findFirst({ where: { id, accountId } });
  if (!entity) throw new Error(`${type} not found`);
}

export const planningLinkRouter = router({
  list: authProcedure.input(z.object({
    entityType: entityType.optional(),
    entityId: z.number().int().optional(),
  }).optional()).output(z.array(planningLinkSchema)).query(async ({ ctx, input }) => {
    const accountId = Number(ctx.id);
    const filter = input?.entityType && input.entityId != null
      ? {
        OR: [
          { sourceType: input.entityType, sourceId: input.entityId },
          { targetType: input.entityType, targetId: input.entityId },
        ],
      }
      : {};
    return db.planningLinks.findMany({
      where: { accountId, ...filter },
      orderBy: { createdAt: 'desc' },
    });
  }),

  create: authProcedure.input(linkInput).output(planningLinkSchema).mutation(async ({ ctx, input }) => {
    const accountId = Number(ctx.id);
    await assertEntity(accountId, input.sourceType, input.sourceId);
    await assertEntity(accountId, input.targetType, input.targetId);
    const existing = await db.planningLinks.findFirst({
      where: {
        accountId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });
    if (existing) return existing;
    return db.planningLinks.create({ data: { ...input, accountId } });
  }),

  delete: authProcedure.input(z.object({ id: z.number().int() })).output(z.object({ success: z.boolean() })).mutation(async ({ ctx, input }) => {
    const current = await db.planningLinks.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
    if (!current) throw new Error('Planning link not found');
    await db.planningLinks.delete({ where: { id: input.id } });
    return { success: true };
  }),
});
