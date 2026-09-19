import { z } from 'zod';
import { router, authProcedure } from '../middleware';
import { db } from '../db';

/**
 * Account-scoped agent directories.
 *
 * Two kinds share one table so they can share ordering and validation:
 *  - `working`: directories the agent may run in (one may be marked default).
 *  - `skills`: directories skills are loaded from, in priority order.
 *
 * Paths are stored as the user typed them (absolute or `~`-relative) and are
 * validated here only — the server never touches the filesystem, so no agent
 * setting can reach outside the machine that runs the agent client.
 */

export const agentDirKind = z.enum(['working', 'skills']);

const agentPath = z
  .string()
  .trim()
  .min(1, 'Path is required')
  .max(512, 'Path is too long')
  .refine((value) => !value.includes('\0'), 'Path contains a null byte')
  .refine(
    (value) => !value.split(/[\\/]+/).includes('..'),
    'Path must not contain ".." segments',
  );

const agentDirSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  kind: agentDirKind,
  label: z.string(),
  path: z.string(),
  isDefault: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const agentDirInputSchema = z.object({
  kind: agentDirKind,
  label: z.string().trim().max(80).default(''),
  path: agentPath,
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

/** Display label falls back to the last path segment. */
export function deriveAgentDirLabel(label: string, path: string): string {
  const trimmed = (label ?? '').trim();
  if (trimmed) return trimmed;
  const segments = path.replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

export const agentDirectoryRouter = router({
  list: authProcedure
    .input(z.object({ kind: agentDirKind.optional(), includeDisabled: z.boolean().optional() }).optional())
    .output(z.array(agentDirSchema))
    .query(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const where: any = { accountId };
      if (input?.kind) where.kind = input.kind;
      if (!input?.includeDisabled) where.enabled = true;
      return db.agentDirectories.findMany({
        where,
        orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }),

  create: authProcedure.input(agentDirInputSchema).output(agentDirSchema).mutation(async ({ ctx, input }) => {
    const accountId = Number(ctx.id);
    const clash = await db.agentDirectories.findFirst({
      where: { accountId, kind: input.kind, path: input.path },
    });
    if (clash) throw new Error('That directory is already configured');

    const siblings = await db.agentDirectories.findMany({ where: { accountId, kind: input.kind } });
    const sortOrder = siblings.length;

    // Only one default per kind.
    if (input.isDefault) {
      for (const sibling of siblings) {
        if (sibling.isDefault) await db.agentDirectories.update({ where: { id: sibling.id }, data: { isDefault: false } });
      }
    }

    return db.agentDirectories.create({
      data: {
        accountId,
        kind: input.kind,
        label: deriveAgentDirLabel(input.label, input.path),
        path: input.path,
        isDefault: input.isDefault || siblings.length === 0,
        enabled: input.enabled,
        sortOrder,
      },
    });
  }),

  update: authProcedure
    .input(agentDirInputSchema.partial().extend({ id: z.number().int() }))
    .output(agentDirSchema)
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const current = await db.agentDirectories.findFirst({ where: { id: input.id, accountId } });
      if (!current) throw new Error('Agent directory not found');

      const { id, ...data } = input;
      if (data.path && data.path !== current.path) {
        const clash = await db.agentDirectories.findFirst({
          where: { accountId, kind: data.kind ?? current.kind, path: data.path },
        });
        if (clash && clash.id !== id) throw new Error('That directory is already configured');
      }

      if (data.isDefault) {
        const siblings = await db.agentDirectories.findMany({ where: { accountId, kind: data.kind ?? current.kind } });
        for (const sibling of siblings) {
          if (sibling.id !== id && sibling.isDefault) {
            await db.agentDirectories.update({ where: { id: sibling.id }, data: { isDefault: false } });
          }
        }
      }

      const nextPath = data.path ?? current.path;
      if (Object.keys(data).length === 0) return current;
      return db.agentDirectories.update({
        where: { id },
        data: { ...data, label: deriveAgentDirLabel(data.label ?? current.label ?? '', nextPath) },
      });
    }),

  delete: authProcedure
    .input(z.object({ id: z.number().int() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const current = await db.agentDirectories.findFirst({ where: { id: input.id, accountId } });
      if (!current) throw new Error('Agent directory not found');
      await db.agentDirectories.delete({ where: { id: input.id } });

      // Keep ordering dense and promote a new default when needed.
      const remaining = await db.agentDirectories.findMany({
        where: { accountId, kind: current.kind },
        orderBy: [{ sortOrder: 'asc' }],
      });
      for (let index = 0; index < remaining.length; index += 1) {
        const sibling = remaining[index];
        const data: Record<string, unknown> = {};
        if (sibling.sortOrder !== index) data.sortOrder = index;
        if (current.isDefault && index === 0 && !sibling.isDefault) data.isDefault = true;
        if (Object.keys(data).length) await db.agentDirectories.update({ where: { id: sibling.id }, data });
      }

      return { success: true };
    }),

  /** Persist drag-and-drop / move-up-move-down ordering for one kind. */
  reorder: authProcedure
    .input(z.object({ kind: agentDirKind, orderedIds: z.array(z.number().int()).min(1) }))
    .output(z.array(agentDirSchema))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const rows = await db.agentDirectories.findMany({ where: { accountId, kind: input.kind } });
      const known = new Set(rows.map((row: any) => row.id));
      const ordered = input.orderedIds.filter((id) => known.has(id));

      for (let index = 0; index < ordered.length; index += 1) {
        const id = ordered[index];
        const current = rows.find((row: any) => row.id === id);
        if (current && current.sortOrder !== index) {
          await db.agentDirectories.update({ where: { id }, data: { sortOrder: index } });
        }
      }

      return db.agentDirectories.findMany({
        where: { accountId, kind: input.kind },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
    }),
});
