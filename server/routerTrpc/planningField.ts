import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

/**
 * Account-scoped custom form fields.
 *
 * A field definition belongs to one planning surface (`kind`) and is rendered
 * by the shared CRUD modal for that surface. Values are stored on the entity
 * records under `customFields` keyed by the field `key`.
 */
export const formFieldKind = z.enum(['ticket', 'study']);
export const formFieldType = z.enum(['text', 'textarea', 'number', 'select', 'toggle', 'date', 'url']);

const fieldKey = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'Key must start with a letter and contain only letters, numbers, "-" or "_"')
  .transform((value) => value.toLowerCase());

const formFieldSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  kind: formFieldKind,
  key: z.string(),
  label: z.string(),
  fieldType: formFieldType,
  options: z.array(z.string()),
  required: z.boolean(),
  showInGraph: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const formFieldInputSchema = z.object({
  kind: formFieldKind,
  key: fieldKey,
  label: z.string().trim().min(1).max(80),
  fieldType: formFieldType.default('text'),
  options: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  required: z.boolean().default(false),
  showInGraph: z.boolean().default(false),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const fieldInput = formFieldInputSchema;

export const planningFieldRouter = router({
  list: authProcedure
    .input(z.object({ kind: formFieldKind.optional(), includeDisabled: z.boolean().optional() }).optional())
    .output(z.array(formFieldSchema))
    .query(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const where: any = { accountId };
      if (input?.kind) where.kind = input.kind;
      if (!input?.includeDisabled) where.enabled = true;
      return db.planningFormFields.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }),

  create: authProcedure.input(fieldInput).output(formFieldSchema).mutation(async ({ ctx, input }) => {
    const accountId = Number(ctx.id);
    const existing = await db.planningFormFields.findFirst({
      where: { accountId, kind: input.kind, key: input.key },
    });
    if (existing) throw new Error(`A "${input.key}" field already exists for this form`);
    return db.planningFormFields.create({ data: { ...input, accountId } });
  }),

  update: authProcedure
    .input(fieldInput.partial().extend({ id: z.number().int() }))
    .output(formFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const current = await db.planningFormFields.findFirst({ where: { id: input.id, accountId } });
      if (!current) throw new Error('Form field not found');
      const { id, ...data } = input;
      if (data.key && (data.key !== current.key || (data.kind && data.kind !== current.kind))) {
        const clash = await db.planningFormFields.findFirst({
          where: { accountId, kind: data.kind ?? current.kind, key: data.key },
        });
        if (clash && clash.id !== id) throw new Error(`A "${data.key}" field already exists for this form`);
      }
      if (Object.keys(data).length === 0) return current;
      return db.planningFormFields.update({ where: { id }, data });
    }),

  delete: authProcedure
    .input(z.object({ id: z.number().int() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const current = await db.planningFormFields.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
      if (!current) throw new Error('Form field not found');
      await db.planningFormFields.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
