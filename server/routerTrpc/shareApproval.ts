import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, authProcedure, superAdminAuthMiddleware } from '../middleware';
import { db } from '../db';
import { CreateNotification } from './notification';

/**
 * Layered share approvals.
 *
 * A share is only access-bearing once its approval row is `approved`. This
 * keeps the existing `noteInternalShare` gate untouched: pending internal
 * requests never create a share row, so they can never leak a note.
 *
 * Three layers, all recorded in `shareApprovals`:
 *  1. `internal` — an invited account approves (or declines) in-app.
 *  2. `email`    — an invite token is emailed; accepting it approves the share.
 *  3. `public`   — a public link is published immediately unless the workspace
 *                  policy `requireShareApproval` is on, in which case an admin
 *                  approves it before the link goes live. Admin approval is
 *                  also required for the other two scopes when the policy asks
 *                  for it.
 */

export const shareScope = z.enum(['internal', 'email', 'public']);
export const shareStatus = z.enum(['pending', 'approved', 'rejected', 'revoked']);

export const SHARE_APPROVAL_POLICY_KEY = 'requireShareApproval';
/** Email invites stay valid for 14 days unless the caller overrides it. */
const INVITE_TTL_DAYS = 14;

const shareApprovalSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  noteId: z.number().int(),
  scope: shareScope,
  status: shareStatus,
  inviteeAccountId: z.number().int().nullable(),
  inviteeEmail: z.string().nullable(),
  token: z.string().nullable(),
  canEdit: z.boolean(),
  requiresAdmin: z.boolean(),
  adminApproved: z.boolean(),
  requestedBy: z.number().int().nullable(),
  decidedBy: z.number().int().nullable(),
  decidedAt: z.coerce.date().nullable(),
  decisionNote: z.string().nullable(),
  expiresAt: z.coerce.date().nullable(),
  message: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

const approvalInput = z.object({
  noteId: z.number().int(),
  canEdit: z.boolean().default(true),
  message: z.string().trim().max(280).default(''),
});

export function generateShareToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Whether new shares in this workspace must wait for an admin decision. */
export async function isShareApprovalRequired(): Promise<boolean> {
  try {
    const row = await db.config.findFirst({ where: { key: SHARE_APPROVAL_POLICY_KEY } });
    const config = row?.config as { value?: unknown } | undefined;
    const value = config?.value;
    return value === true || value === 'true';
  } catch (error) {
    console.error('Failed to read share approval policy', error);
    return false;
  }
}

async function findOwnedNote(noteId: number, accountId: number) {
  return db.notes.findFirst({ where: { id: noteId, accountId } });
}

function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/share/invite/${token}`;
}

/**
 * Deliver an email invite.
 *
 * No mail transport is bundled with the server, so delivery is best-effort:
 * when `SHARE_INVITE_WEBHOOK` is configured the rendered message is POSTed to
 * it (letting any SMTP/API relay handle delivery), and the rendered subject,
 * body and accept URL are always returned so the UI can copy the link and the
 * invitee can approve from the in-app notification either way.
 */
export async function deliverShareInvite(input: {
  email: string;
  origin: string;
  token: string;
  noteTitle: string;
  inviterName: string;
  message?: string;
}): Promise<{ delivered: boolean; subject: string; body: string; url: string }> {
  const url = inviteUrl(input.origin, input.token);
  const subject = `${input.inviterName} shared "${input.noteTitle}" with you on PlanInc`;
  const body = [
    `${input.inviterName} would like to share "${input.noteTitle}" with you.`,
    input.message ? `\nMessage: ${input.message}` : '',
    `\nApprove the share: ${url}`,
    `\nThis invitation expires in ${INVITE_TTL_DAYS} days.`,
  ].join('\n');

  const webhook = process.env.SHARE_INVITE_WEBHOOK;
  if (!webhook) return { delivered: false, subject, body, url };

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: input.email, subject, body, url, token: input.token }),
    });
    return { delivered: response.ok, subject, body, url };
  } catch (error) {
    console.error('Share invite delivery failed', error);
    return { delivered: false, subject, body, url };
  }
}

/** Publish a note's public link (used when an approval is granted). */
async function publishPublicNote(noteId: number, password: string, expireAt: Date | null) {
  const note = await db.notes.findFirst({ where: { id: noteId } });
  if (!note) return null;
  const shareId = note.shareEncryptedUrl || randomBytes(6).toString('hex').slice(0, 8);
  return db.notes.update({
    where: { id: noteId },
    data: {
      isShare: true,
      shareEncryptedUrl: shareId,
      sharePassword: password ?? note.sharePassword ?? '',
      shareExpiryDate: expireAt,
    },
  });
}

export const shareApprovalRouter = router({
  /** Workspace policy plus the caller's own queue summary. */
  policy: authProcedure
    .output(z.object({ requireShareApproval: z.boolean(), isAdmin: z.boolean() }))
    .query(async ({ ctx }) => ({
      requireShareApproval: await isShareApprovalRequired(),
      isAdmin: ctx.role === 'superadmin',
    })),

  /** Requests waiting on the caller: internal invites to approve. */
  inbox: authProcedure
    .input(z.object({ status: shareStatus.optional() }).optional())
    .output(z.array(shareApprovalSchema))
    .query(async ({ ctx, input }) => {
      const where: any = { inviteeAccountId: Number(ctx.id) };
      where.status = input?.status ?? 'pending';
      return db.shareApprovals.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
    }),

  /** Requests the caller raised on their own notes. */
  outgoing: authProcedure
    .input(z.object({ noteId: z.number().int().optional(), status: shareStatus.optional() }).optional())
    .output(z.array(shareApprovalSchema))
    .query(async ({ ctx, input }) => {
      const where: any = { accountId: Number(ctx.id) };
      if (input?.noteId) where.noteId = input.noteId;
      if (input?.status) where.status = input.status;
      return db.shareApprovals.findMany({ where, orderBy: [{ createdAt: 'desc' }] });
    }),

  /** Admin queue: everything awaiting a workspace decision. */
  pendingAdmin: authProcedure
    .use(superAdminAuthMiddleware)
    .input(z.object({ status: shareStatus.optional() }).optional())
    .output(z.array(shareApprovalSchema))
    .query(async ({ input }) => {
      return db.shareApprovals.findMany({
        where: { status: input?.status ?? 'pending' },
        orderBy: [{ createdAt: 'asc' }],
      });
    }),

  /** Owner asks to share with internal accounts (layer 1). */
  requestInternal: authProcedure
    .input(
      z.object({
        noteId: z.number().int(),
        accountIds: z.array(z.number().int()).min(1),
        canEdit: z.boolean().default(true),
        message: z.string().trim().max(280).default(''),
      }),
    )
    .output(z.array(shareApprovalSchema))
    .mutation(async ({ ctx, input }) => {
      const ownerId = Number(ctx.id);
      const note = await findOwnedNote(input.noteId, ownerId);
      if (!note) throw new Error('Note not found');

      const targets = input.accountIds.filter((id) => id !== ownerId);
      if (!targets.length) throw new Error('Select at least one person to share with');

      const accounts = await db.accounts.findMany({ where: { id: { in: targets } } });
      const validIds = accounts.map((account: any) => account.id);
      if (!validIds.length) throw new Error('No matching accounts');

      const requiresAdmin = await isShareApprovalRequired();
      const created: any[] = [];

      for (const accountId of validIds) {
        // Upsert keeps a single pending row per (note, invitee) so re-requesting
        // does not pile up duplicates; an already-approved share is kept.
        const existing = await db.shareApprovals.findFirst({
          where: { noteId: input.noteId, scope: 'internal', inviteeAccountId: accountId },
        });

        if (existing && existing.status === 'approved') {
          created.push(existing);
          continue;
        }

        const data = {
          accountId: ownerId,
          noteId: input.noteId,
          scope: 'internal',
          status: 'pending',
          inviteeAccountId: accountId,
          canEdit: input.canEdit,
          requiresAdmin,
          adminApproved: false,
          requestedBy: ownerId,
          message: input.message,
          token: generateShareToken(),
        };

        const row = existing
          ? await db.shareApprovals.update({ where: { id: existing.id }, data })
          : await db.shareApprovals.create({ data });

        await CreateNotification({
          accountId,
          type: 'system',
          title: 'Share request',
          content: `${ctx.name ?? 'A teammate'} wants to share "${String(note.content ?? '').slice(0, 60)}" with you`,
          metadata: { kind: 'share-approval', approvalId: row.id, noteId: input.noteId, scope: 'internal' },
        });

        if (requiresAdmin) {
          await CreateNotification({
            useAdmin: true,
            type: 'system',
            title: 'Share approval required',
            content: `An internal share of note #${input.noteId} is waiting for admin approval`,
            metadata: { kind: 'share-approval', approvalId: row.id, noteId: input.noteId, scope: 'internal' },
          });
        }

        created.push(row);
      }

      return created;
    }),

  /** Owner creates an email invite (layer 2). */
  inviteByEmail: authProcedure
    .input(
      approvalInput.extend({
        email: z.string().trim().email(),
        origin: z.string().trim().url(),
        expiryDays: z.number().int().min(1).max(60).default(INVITE_TTL_DAYS),
      }),
    )
    .output(
      z.object({
        approval: shareApprovalSchema,
        delivered: z.boolean(),
        subject: z.string(),
        body: z.string(),
        url: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ownerId = Number(ctx.id);
      const note = await findOwnedNote(input.noteId, ownerId);
      if (!note) throw new Error('Note not found');

      const requiresAdmin = await isShareApprovalRequired();
      const token = generateShareToken();
      const expiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);

      const existing = await db.shareApprovals.findFirst({
        where: { noteId: input.noteId, scope: 'email', inviteeEmail: input.email },
      });

      const data = {
        accountId: ownerId,
        noteId: input.noteId,
        scope: 'email',
        status: 'pending',
        inviteeEmail: input.email,
        token,
        canEdit: input.canEdit,
        requiresAdmin,
        adminApproved: false,
        requestedBy: ownerId,
        message: input.message,
        expiresAt,
      };

      const approval = existing
        ? await db.shareApprovals.update({ where: { id: existing.id }, data })
        : await db.shareApprovals.create({ data });

      const delivery = await deliverShareInvite({
        email: input.email,
        origin: input.origin,
        token,
        noteTitle: String(note.content ?? '').split('\n')[0].slice(0, 80) || 'a note',
        inviterName: String(ctx.name ?? 'A teammate'),
        message: input.message,
      });

      return { approval, ...delivery };
    }),

  /** Owner asks for a public link (layer 3). */
  requestPublic: authProcedure
    .input(
      approvalInput.extend({
        password: z.string().max(32).default(''),
        expireAt: z.coerce.date().nullable().default(null),
      }),
    )
    .output(z.object({ approval: shareApprovalSchema, published: z.boolean(), shareUrl: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = Number(ctx.id);
      const note = await findOwnedNote(input.noteId, ownerId);
      if (!note) throw new Error('Note not found');

      const requiresAdmin = await isShareApprovalRequired();
      if (!requiresAdmin) {
        // Policy off: publish immediately, keeping the historical behaviour.
        const published = await publishPublicNote(input.noteId, input.password, input.expireAt ?? null);
        const approval = await db.shareApprovals.create({
          data: {
            accountId: ownerId,
            noteId: input.noteId,
            scope: 'public',
            status: 'approved',
            requiresAdmin: false,
            adminApproved: true,
            requestedBy: ownerId,
            decidedBy: ownerId,
            decidedAt: new Date(),
            canEdit: false,
            token: generateShareToken(),
            message: input.message,
          },
        });
        return { approval, published: true, shareUrl: published?.shareEncryptedUrl ?? null };
      }

      const approval = await db.shareApprovals.create({
        data: {
          accountId: ownerId,
          noteId: input.noteId,
          scope: 'public',
          status: 'pending',
          requiresAdmin: true,
          adminApproved: false,
          requestedBy: ownerId,
          canEdit: false,
          token: generateShareToken(),
          message: input.message,
          expiresAt: input.expireAt ?? null,
        },
      });

      await CreateNotification({
        useAdmin: true,
        type: 'system',
        title: 'Public share approval required',
        content: `A public link for note #${input.noteId} is waiting for admin approval`,
        metadata: { kind: 'share-approval', approvalId: approval.id, noteId: input.noteId, scope: 'public' },
      });

      return { approval, published: false, shareUrl: null };
    }),

  /** Invitee (layer 1) or admin decides a request. */
  decide: authProcedure
    .input(
      z.object({
        id: z.number().int(),
        approve: z.boolean(),
        decisionNote: z.string().trim().max(280).default(''),
      }),
    )
    .output(shareApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      const callerId = Number(ctx.id);
      const isAdmin = ctx.role === 'superadmin';
      const row = await db.shareApprovals.findFirst({ where: { id: input.id } });
      if (!row) throw new Error('Share request not found');

      const isInvitee = row.inviteeAccountId === callerId;
      const isOwner = row.accountId === callerId;
      if (!isAdmin && !isInvitee) throw new Error('You cannot decide this share request');
      if (isOwner && !isAdmin) throw new Error('Only the recipient or an administrator can decide');

      const wantsAdminOnly = row.requiresAdmin && !row.adminApproved;
      if (row.scope === 'public' && !isAdmin) throw new Error('Only an administrator can decide a public share');

      if (input.approve && wantsAdminOnly) {
        // Invitee approved but the workspace still needs an admin sign-off.
        const updated = await db.shareApprovals.update({
          where: { id: input.id },
          data: { status: 'pending', adminApproved: isAdmin, decidedBy: callerId, decisionNote: input.decisionNote },
        });
        if (isAdmin) {
          await CreateNotification({
            accountId: row.accountId,
            type: 'system',
            title: 'Share approved by admin',
            content: `Your share request for note #${row.noteId} was approved and is still waiting on the recipient`,
            metadata: { kind: 'share-approval', approvalId: row.id },
          });
        }
        return updated;
      }

      const updated = await db.shareApprovals.update({
        where: { id: input.id },
        data: {
          status: input.approve ? 'approved' : 'rejected',
          adminApproved: isAdmin ? true : row.adminApproved,
          decidedBy: callerId,
          decidedAt: new Date(),
          decisionNote: input.decisionNote,
        },
      });

      if (input.approve) {
        if (row.scope === 'internal' && row.inviteeAccountId) {
          await db.noteInternalShare.upsert({
            where: { noteId_accountId: { noteId: row.noteId, accountId: row.inviteeAccountId } },
            update: { canEdit: row.canEdit },
            create: { noteId: row.noteId, accountId: row.inviteeAccountId, canEdit: row.canEdit },
          });
        }
        if (row.scope === 'public') {
          await publishPublicNote(row.noteId, '', row.expiresAt ?? null);
        }
      }

      await CreateNotification({
        accountId: row.accountId,
        type: 'system',
        title: input.approve ? 'Share approved' : 'Share declined',
        content: `${isAdmin && !isInvitee ? 'An administrator' : 'The recipient'} ${input.approve ? 'approved' : 'declined'} your share request for note #${row.noteId}`,
        metadata: { kind: 'share-approval', approvalId: row.id, status: updated.status },
      });

      return updated;
    }),

  /** Accept an emailed invite token. */
  acceptInvite: authProcedure
    .input(z.object({ token: z.string().min(8) }))
    .output(shareApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await db.shareApprovals.findFirst({ where: { token: input.token, scope: 'email' } });
      if (!row) throw new Error('Invitation not found');
      if (row.status === 'rejected' || row.status === 'revoked') throw new Error('This invitation is no longer valid');
      if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) throw new Error('This invitation has expired');
      if (row.requiresAdmin && !row.adminApproved) {
        throw new Error('This invitation is still waiting for administrator approval');
      }

      const updated = await db.shareApprovals.update({
        where: { id: row.id },
        data: { status: 'approved', inviteeAccountId: Number(ctx.id), decidedBy: Number(ctx.id), decidedAt: new Date() },
      });

      await db.noteInternalShare.upsert({
        where: { noteId_accountId: { noteId: row.noteId, accountId: Number(ctx.id) } },
        update: { canEdit: row.canEdit },
        create: { noteId: row.noteId, accountId: Number(ctx.id), canEdit: row.canEdit },
      });

      await CreateNotification({
        accountId: row.accountId,
        type: 'system',
        title: 'Invitation accepted',
        content: `${ctx.name ?? 'A teammate'} accepted your invitation for note #${row.noteId}`,
        metadata: { kind: 'share-approval', approvalId: row.id },
      });

      return updated;
    }),

  /** Owner revokes a pending request or an email invite. */
  revoke: authProcedure
    .input(z.object({ id: z.number().int() }))
    .output(shareApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      const callerId = Number(ctx.id);
      const row = await db.shareApprovals.findFirst({ where: { id: input.id } });
      if (!row) throw new Error('Share request not found');
      if (row.accountId !== callerId && ctx.role !== 'superadmin') throw new Error('You cannot revoke this share');

      if (row.scope === 'internal' && row.inviteeAccountId && row.status === 'approved') {
        await db.noteInternalShare.deleteMany({ where: { noteId: row.noteId, accountId: row.inviteeAccountId } });
      }

      return db.shareApprovals.update({ where: { id: input.id }, data: { status: 'revoked', decidedAt: new Date() } });
    }),

  /** Admin: turn the workspace-wide approval gate on or off. */
  setPolicy: authProcedure
    .use(superAdminAuthMiddleware)
    .input(z.object({ requireShareApproval: z.boolean() }))
    .output(z.object({ requireShareApproval: z.boolean() }))
    .mutation(async ({ input }) => {
      const existing = await db.config.findFirst({ where: { key: SHARE_APPROVAL_POLICY_KEY } });
      const data = { key: SHARE_APPROVAL_POLICY_KEY, config: { type: 'boolean', value: input.requireShareApproval } };
      if (existing) await db.config.update({ where: { id: existing.id }, data });
      else await db.config.create({ data });
      return { requireShareApproval: input.requireShareApproval };
    }),

  /** Resolve a pending row by note for the share dialog status line. */
  forNote: authProcedure
    .input(z.object({ noteId: z.number().int() }))
    .output(z.array(shareApprovalSchema))
    .query(async ({ ctx, input }) => {
      return db.shareApprovals.findMany({
        where: { noteId: input.noteId, accountId: Number(ctx.id) },
        orderBy: [{ createdAt: 'desc' }],
      });
    }),
});
