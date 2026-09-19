import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

/**
 * Predefined, account-unique plan categories.
 *
 * Categories are created once in Settings → Plans and then reused everywhere a
 * plan is filed. The name is what people see; the slug is what the plans board
 * and filters address, so renaming never breaks a saved filter.
 *
 * Each category carries a colour + icon from a fixed preset palette, which is
 * what keeps the board readable without letting a single account invent a
 * hundred near-identical swatches.
 */

export const CATEGORY_COLOR_PRESETS = [
  { key: 'teal', value: '#20808D' },
  { key: 'cyan', value: '#1FB8CD' },
  { key: 'ink', value: '#091717' },
  { key: 'amber', value: '#B4791E' },
  { key: 'rose', value: '#B4426B' },
  { key: 'violet', value: '#6D5AE6' },
  { key: 'green', value: '#2F7D5B' },
  { key: 'slate', value: '#5A6B7B' },
] as const;

export const CATEGORY_ICON_PRESETS = [
  'tabler:list-check',
  'tabler:target-arrow',
  'tabler:flag',
  'tabler:sparkles',
  'tabler:clock-hour-4',
  'tabler:book',
  'tabler:rocket',
  'tabler:archive',
] as const;

const categorySlug = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug must be lowercase letters, numbers and "-"')
  .transform((value) => value.toLowerCase());

/** Turn a display name into a stable, unique-able slug. */
export function slugifyCategory(name: string): string {
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.slice(0, 60) || 'category';
}

const categorySchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  name: z.string(),
  slug: z.string(),
  color: z.string(),
  icon: z.string(),
  isDefault: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: categorySlug.optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a #rrggbb hex value').default('#20808D'),
  icon: z.string().trim().max(60).default('tabler:list-check'),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const planningCategoryRouter = router({
  list: authProcedure
    .input(z.object({ includeDisabled: z.boolean().optional() }).optional())
    .output(z.array(categorySchema))
    .query(async ({ ctx, input }) => {
      const where: any = { accountId: Number(ctx.id) };
      if (!input?.includeDisabled) where.enabled = true;
      return db.planningCategories.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }),

  create: authProcedure.input(categoryInputSchema).output(categorySchema).mutation(async ({ ctx, input }) => {
    const accountId = Number(ctx.id);
    const slug = input.slug ?? slugifyCategory(input.name);

    const clash = await db.planningCategories.findFirst({ where: { accountId, slug } });
    if (clash) throw new Error(`A "${input.name}" category already exists`);

    const siblings = await db.planningCategories.findMany({ where: { accountId } });
    if (input.isDefault) {
      for (const sibling of siblings) {
        if (sibling.isDefault) await db.planningCategories.update({ where: { id: sibling.id }, data: { isDefault: false } });
      }
    }

    return db.planningCategories.create({
      data: {
        accountId,
        name: input.name,
        slug,
        color: input.color,
        icon: input.icon,
        isDefault: input.isDefault || siblings.length === 0,
        enabled: input.enabled,
        sortOrder: siblings.length,
      },
    });
  }),

  update: authProcedure
    .input(categoryInputSchema.partial().extend({ id: z.number().int() }))
    .output(categorySchema)
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const current = await db.planningCategories.findFirst({ where: { id: input.id, accountId } });
      if (!current) throw new Error('Category not found');

      const { id, ...data } = input;
      if (data.slug && data.slug !== current.slug) {
        const clash = await db.planningCategories.findFirst({ where: { accountId, slug: data.slug } });
        if (clash && clash.id !== id) throw new Error('That slug is already in use');
      }

      if (data.isDefault) {
        const siblings = await db.planningCategories.findMany({ where: { accountId } });
        for (const sibling of siblings) {
          if (sibling.id !== id && sibling.isDefault) {
            await db.planningCategories.update({ where: { id: sibling.id }, data: { isDefault: false } });
          }
        }
      }

      if (Object.keys(data).length === 0) return current;
      return db.planningCategories.update({ where: { id }, data });
    }),

  delete: authProcedure
    .input(z.object({ id: z.number().int(), reassignToId: z.number().int().nullable().optional() }))
    .output(z.object({ success: z.boolean(), reassigned: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const current = await db.planningCategories.findFirst({ where: { id: input.id, accountId } });
      if (!current) throw new Error('Category not found');

      // Plans pointing at a deleted category are moved to the replacement (or
      // uncategorised) rather than silently losing their lane.
      let reassigned = 0;
      if (input.reassignToId) {
        const target = await db.planningCategories.findFirst({ where: { id: input.reassignToId, accountId } });
        if (!target) throw new Error('Replacement category not found');
      }
      const affected = await db.notes.findMany({ where: { accountId, categoryId: input.id } });
      reassigned = affected.length;
      for (const note of affected) {
        await db.notes.update({
          where: { id: note.id },
          data: { categoryId: input.reassignToId ?? null },
        });
      }

      await db.planningCategories.delete({ where: { id: input.id } });

      const remaining = await db.planningCategories.findMany({
        where: { accountId },
        orderBy: [{ sortOrder: 'asc' }],
      });
      for (let index = 0; index < remaining.length; index += 1) {
        const sibling = remaining[index];
        const data: Record<string, unknown> = {};
        if (sibling.sortOrder !== index) data.sortOrder = index;
        if (current.isDefault && index === 0 && !sibling.isDefault) data.isDefault = true;
        if (Object.keys(data).length) await db.planningCategories.update({ where: { id: sibling.id }, data });
      }

      return { success: true, reassigned };
    }),

  reorder: authProcedure
    .input(z.object({ orderedIds: z.array(z.number().int()).min(1) }))
    .output(z.array(categorySchema))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const rows = await db.planningCategories.findMany({ where: { accountId } });
      const known = new Set(rows.map((row: any) => row.id));
      const ordered = input.orderedIds.filter((id) => known.has(id));

      for (let index = 0; index < ordered.length; index += 1) {
        const id = ordered[index];
        const current = rows.find((row: any) => row.id === id);
        if (current && current.sortOrder !== index) {
          await db.planningCategories.update({ where: { id }, data: { sortOrder: index } });
        }
      }

      return db.planningCategories.findMany({
        where: { accountId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }),

  /** Assign (or clear) the category of one plan. */
  assign: authProcedure
    .input(z.object({ noteId: z.number().int(), categoryId: z.number().int().nullable() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const note = await db.notes.findFirst({ where: { id: input.noteId, accountId } });
      if (!note) throw new Error('Plan not found');
      if (input.categoryId) {
        const category = await db.planningCategories.findFirst({ where: { id: input.categoryId, accountId } });
        if (!category) throw new Error('Category not found');
      }
      await db.notes.update({ where: { id: input.noteId }, data: { categoryId: input.categoryId } });
      return { success: true };
    }),

  /** Seed the palette so a new account starts with usable, unique lanes. */
  seedDefaults: authProcedure
    .input(z.object({ names: z.array(z.string().trim().min(1).max(60)).max(12).optional() }).optional())
    .output(z.array(categorySchema))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const names = input?.names?.length
        ? input.names
        : ['Now', 'Next', 'Later', 'Ideas'];

      const existing = await db.planningCategories.findMany({ where: { accountId } });
      const created: any[] = [];
      for (let index = 0; index < names.length; index += 1) {
        const name = names[index];
        const slug = slugifyCategory(name);
        if (existing.some((row: any) => row.slug === slug) || created.some((row) => row.slug === slug)) continue;
        const preset = CATEGORY_COLOR_PRESETS[index % CATEGORY_COLOR_PRESETS.length];
        const icon = CATEGORY_ICON_PRESETS[index % CATEGORY_ICON_PRESETS.length];
        created.push(await db.planningCategories.create({
          data: {
            accountId,
            name,
            slug,
            color: preset.value,
            icon,
            isDefault: existing.length === 0 && created.length === 0,
            enabled: true,
            sortOrder: existing.length + created.length,
          },
        }));
      }
      return created;
    }),
});
