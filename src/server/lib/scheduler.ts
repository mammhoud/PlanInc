/**
 * In-process scheduler persisted in SurrealDB — replaces job queue (PostgreSQL).
 *
 * job queue was the only remaining hard PostgreSQL dependency (its queue is a
 * set of Postgres tables). After the Postgres removal, jobs run on a small
 * in-process timer loop; schedules live in a Surreal table `jobSchedule`
 * (one row per task: name, cron, enabled, lastRun) so they survive restarts
 * and the task list endpoint can read last-run info from the same row.
 */
import { surreal } from '../surreal';

const { query, select } = surreal;

export interface ScheduleRow {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  lastRun: string | null;
  data?: any;
}

// ---------------------------------------------------------------------
// Minimal cron parser (m/h/d/dom/mon with *, */n, ranges, lists)
// ---------------------------------------------------------------------

function parseField(expr: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const part of expr.split(',')) {
    let step = 1;
    let range = part;
    if (part.includes('/')) {
      const [r, s] = part.split('/');
      range = r;
      step = Math.max(1, parseInt(s, 10) || 1);
    }
    let start: number, end: number;
    if (range === '*' || range === '') {
      start = min; end = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      start = parseInt(a, 10); end = parseInt(b, 10);
    } else {
      start = end = parseInt(range, 10);
    }
    if (isNaN(start) || isNaN(end)) continue;
    for (let v = start; v <= Math.min(end, max); v += step) values.add(v);
  }
  return [...values];
}

/** Does the 5-field cron expression match the given UTC time? */
export function cronMatches(cron: string, d: Date): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const dom = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12);
  const dow = parseField(fields[4], 0, 7);
  const dowNorm = dow.includes(7) && !dow.includes(0) ? [...dow, 0] : dow;
  return (
    minute.includes(d.getUTCMinutes()) &&
    hour.includes(d.getUTCHours()) &&
    dom.includes(d.getUTCDate()) &&
    month.includes(d.getUTCMonth() + 1) &&
    (fields[4] === '*' || dowNorm.includes(d.getUTCDay()))
  );
}

// ---------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------

type Worker = (job: any) => Promise<any>;

const workers = new Map<string, Worker>();
// Jobs sent via send() while no worker was registered yet (job queue would
// have stored them in the queue table).
const pendingJobs = new Map<string, any[]>();
let timer: ReturnType<typeof setInterval> | null = null;
let lastMinuteKey = '';
let started = false;

/** Invoke a registered worker job queue style: handler receives an array of jobs. */
function dispatch(name: string, data: any): Promise<any> | null {
  const worker = workers.get(name);
  if (!worker) return null;
  return Promise.resolve()
    .then(() => worker([{ id: `${name}:${Date.now()}`, name, data: data ?? {} }]))
    .catch(err => console.error(`[scheduler] ${name} failed:`, err));
}

/** Serialize a JS value as an inline SurrealQL literal. */
function surrealLiteral(value: any): string {
  if (value === undefined || value === null) return 'NONE';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  return JSON.stringify(value);
}

async function ensureTable(): Promise<void> {
  await query(`
    DEFINE TABLE IF NOT EXISTS jobSchedule;
    DEFINE INDEX IF NOT EXISTS uniq_job_name ON TABLE jobSchedule COLUMNS name UNIQUE;
  `);
}

export const scheduler = {
  /** Start the timer loop and create the schedule table. */
  async start(): Promise<void> {
    if (started) return;
    await ensureTable();
    started = true;
    // Check every 20s; a minute-key dedupe makes each job run once per
    // matching minute even with the coarse tick.
    timer = setInterval(async () => {
      const now = new Date();
      const minuteKey = `${now.getUTCHours()}:${now.getUTCMinutes()}`;
      if (minuteKey === lastMinuteKey) return;
      lastMinuteKey = minuteKey;
      try {
        const rows = await select<ScheduleRow & { id: string }>(
          `SELECT * FROM jobSchedule WHERE enabled = true;`
        );
        for (const row of rows) {
          if (!cronMatches(row.cron, now)) continue;
          const ts = new Date().toISOString();
          const run = dispatch(row.name, row.data);
          const mark = () =>
            query(`UPDATE jobSchedule SET lastRun = time::datetime(${JSON.stringify(ts)}) WHERE name = ${JSON.stringify(row.name)};`);
          if (run) {
            console.log(`[scheduler] firing ${row.name}`);
            run.then(mark).catch(err => console.error(`[scheduler] ${row.name} failed:`, err));
          } else {
            await mark();
          }
        }
      } catch (err) {
        console.error('[scheduler] tick failed:', err);
      }
    }, 20_000);
    if (typeof timer.unref === 'function') timer.unref();
    console.log('[scheduler] started (SurrealDB-backed, replaces job queue)');
  },

  async stop(): Promise<void> {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    started = false;
    console.log('[scheduler] stopped');
  },

  /** Queues are implicit — a jobSchedule row plus a registered worker. */
  async createQueue(_name: string): Promise<void> {},

  async registerWorker(name: string, fn: Worker): Promise<void> {
    workers.set(name, fn);
    // Drain jobs sent before this worker existed.
    const queued = pendingJobs.get(name);
    if (queued?.length) {
      pendingJobs.set(name, []);
      for (const data of queued) {
        dispatch(name, data);
      }
    }
  },

  /** Upsert a cron schedule row. */
  async schedule(name: string, cron: string, data?: any): Promise<void> {
    await query(`
      DELETE FROM jobSchedule WHERE name = ${JSON.stringify(name)};
      CREATE jobSchedule CONTENT {
        name: ${JSON.stringify(name)},
        cron: ${JSON.stringify(cron)},
        enabled: true,
        lastRun: NONE,
        data: ${surrealLiteral(data)}
      };
    `);
  },

  async unschedule(name: string): Promise<void> {
    await query(`DELETE FROM jobSchedule WHERE name = ${JSON.stringify(name)};`);
  },

  /** Fetch all schedules (used by task.list). */
  async getSchedules(): Promise<Array<{ name: string; cron: string; lastRun: Date | null }>> {
    const rows = await select<any>(`SELECT * FROM jobSchedule;`);
    return rows.map(r => ({
      name: r.name,
      cron: r.cron,
      lastRun: r.lastRun ? new Date(r.lastRun) : null,
    }));
  },

  /** Run a task right now (worker must be registered; data delivered to it). */
  async send(name: string, data?: any): Promise<string> {
    if (workers.get(name)) {
      dispatch(name, data);
    } else {
      // Queue until a worker registers.
      const q = pendingJobs.get(name) ?? [];
      q.push(data ?? {});
      pendingJobs.set(name, q);
    }
    return name;
  },

  /** Last completed run for a task (replaces the pgboss.job raw query). */
  async getLastRun(name: string): Promise<Date | null> {
    const rows = await select<any>(`SELECT lastRun FROM jobSchedule WHERE name = ${JSON.stringify(name)};`);
    const lr = rows[0]?.lastRun;
    return lr ? new Date(lr) : null;
  },
};

export default scheduler;
