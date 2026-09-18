/**
 * Job-queue facade over the SurrealDB-backed scheduler (server/lib/scheduler.ts).
 *
 * The PostgreSQL-backed queue library this used to wrap is gone. The returned
 * object exposes the small subset of the queue API the codebase actually uses:
 * createQueue, work, schedule, unschedule, send, getSchedules, stop.
 */
import { scheduler } from './scheduler';

type JobQueueCompat = {
  createQueue: (name: string) => Promise<void>;
  work: (name: string, optsOrHandler: any, maybeHandler?: (job: any) => Promise<any>) => Promise<void>;
  schedule: (name: string, cron: string, data?: any, _opts?: any) => Promise<void>;
  unschedule: (name: string) => Promise<void>;
  send: (name: string, data?: any) => Promise<string>;
  getSchedules: () => Promise<Array<{ name: string; cron: string; lastRun: Date | null }>>;
  stop: (opts?: any) => Promise<void>;
  on: (_event: string, _cb: (...args: any[]) => void) => void;
};

let facade: JobQueueCompat | null = null;

/**
 * Get (and lazily start) the scheduler facade.
 * Lazily starts the scheduler on first use.
 */
export async function getJobQueue(): Promise<JobQueueCompat> {
  if (!facade) {
    await scheduler.start();
    facade = {
      async createQueue(name: string) {
        await scheduler.createQueue(name);
      },
      async work(name: string, optsOrHandler: any, maybeHandler?: (job: any) => Promise<any>) {
        // job queue calls come in two shapes: work(name, handler) and
        // work(name, { batchSize, batchSizePollInterval... }, handler).
        const handler = typeof optsOrHandler === 'function' ? optsOrHandler : maybeHandler;
        await scheduler.registerWorker(name, handler);
      },
      async schedule(name: string, cron: string, data?: any) {
        await scheduler.schedule(name, cron, data);
      },
      async unschedule(name: string) {
        await scheduler.unschedule(name);
      },
      async send(name: string, data?: any) {
        return scheduler.send(name, data);
      },
      async getSchedules() {
        return scheduler.getSchedules();
      },
      async stop() {
        await scheduler.stop();
      },
      on() {
        /* no-op: job queue event API is not needed by the scheduler */
      },
    };
    console.log('[scheduler] job-queue facade active (SurrealDB datastore)');
  }
  return facade;
}

/** Stop the scheduler gracefully. Kept for the SIGTERM/SIGINT handlers. */
export async function stopJobQueue(): Promise<void> {
  await scheduler.stop();
}

export function isJobQueueRunning(): boolean {
  return facade !== null;
}
