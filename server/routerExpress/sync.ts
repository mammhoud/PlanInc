/**
 * Postgres → Surreal sync ingest (Django outbox deliverables).
 *
 * POST /api/sync/ingest — superadmin bearer only. Accepts the JSONL objects
 * produced by Django `publish_outbox`:
 *   { idempotency_key, tenant, event_type, aggregate_type, aggregate_id,
 *     payload, tombstone, available_at }
 *
 * Dedupe key is `notes.syncKey` (= Django idempotency_key). Account mapping
 * is by `payload.accountName` → Surreal `accounts.name`; rows without a
 * resolvable account are reported as skipped (`unmapped`), never guessed.
 * Tombstones delete the synced note. LWW is enforced by the Django side
 * (only newer rows are published per aggregate).
 */
import express from 'express';
import { db } from '../db';
import { getTokenFromRequest } from '../lib/helper';

const router = express.Router();

const MAX_EVENTS = 500;

router.post('/ingest', async (req, res) => {
  try {
    const token = await getTokenFromRequest(req);
    if (!token || token.role !== 'superadmin') {
      return res.status(token ? 403 : 401).json({ error: token ? 'Forbidden' : 'Unauthorized' });
    }

    const events = (req.body as any)?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }
    if (events.length > MAX_EVENTS) {
      return res.status(400).json({ error: `events exceeds ${MAX_EVENTS}` });
    }

    let applied = 0;
    const skipped: Array<{ idempotency_key: string; reason: string }> = [];

    for (const event of events) {
      const key = typeof event?.idempotency_key === 'string' ? event.idempotency_key : '';
      if (!key) {
        skipped.push({ idempotency_key: '', reason: 'missing idempotency_key' });
        continue;
      }
      if (event?.aggregate_type !== 'note') {
        skipped.push({ idempotency_key: key, reason: 'unsupported aggregate_type' });
        continue;
      }

      const existing = await db.notes.findFirst({ where: { syncKey: key } });

      if (event?.tombstone) {
        if (existing) {
          await db.notes.delete({ where: { id: existing.id } });
          applied += 1;
        } else {
          skipped.push({ idempotency_key: key, reason: 'tombstone without target' });
        }
        continue;
      }

      const accountName = event?.payload?.accountName;
      let accountId: number | null = null;
      if (typeof accountName === 'string' && accountName) {
        const account = await db.accounts.findFirst({ where: { name: accountName } });
        if (account) accountId = account.id;
      }
      if (accountId === null) {
        skipped.push({ idempotency_key: key, reason: 'unmapped account' });
        continue;
      }

      const content = typeof event?.payload?.body === 'string'
        ? event.payload.body
        : typeof event?.payload?.title === 'string'
          ? event.payload.title
          : '';
      if (existing) {
        await db.notes.update({ where: { id: existing.id }, data: { content } });
      } else {
        await db.notes.create({ data: { content, accountId, syncKey: key } });
      }
      applied += 1;
    }

    return res.json({ status: 'success', applied, skipped });
  } catch (error) {
    console.error('sync ingest error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
