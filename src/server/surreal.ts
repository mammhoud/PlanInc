/**
 * SurrealDB client — embedded engine backed by a single database file.
 *
 * There is no database server, no SQL database and no PostgreSQL anywhere in
 * the stack. The SurrealDB engine runs **in-process** and persists to one file
 * (SurrealKV), the same way a SQLite database would — so nothing needs to be
 * started or kept running next to the app.
 *
 * Location/identity come from the environment:
 *   PLANINC_DB_FILE  — path of the database file (default ./data/planinc.db)
 *   PLANINC_DB_NS    — SurrealDB namespace        (default planinc)
 *   PLANINC_DB_NAME  — SurrealDB database name    (default planinc)
 *
 * Requires the SDK plus its native engine plugin:
 *   bun add surrealdb @surrealdb/node
 * Both are ESM-only, and `@surrealdb/node` is a NAPI native module, so it must
 * stay an esbuild external (see esbuild.config.ts).
 *
 * All queries are SurrealQL strings with values inlined using JSON-safe
 * escaping (see `lit`). Statements are separated by `;\n` and executed in one
 * round trip; the response is one result entry per statement.
 */

const DB_FILE = process.env.PLANINC_DB_FILE || './data/planinc.db';
const NS = process.env.PLANINC_DB_NS || 'planinc';
const DB = process.env.PLANINC_DB_NAME || 'planinc';

export interface SurrealStatementResult {
  result: any;
  status: string;
  time?: string;
}

export class SurrealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurrealError';
  }
}

/** Escape a JS value as a SurrealQL literal (string/number/bool/null/array/object). */
export function lit(v: any): string {
  if (v === null || v === undefined) return 'NONE';
  switch (typeof v) {
    case 'number':
      return Number.isFinite(v) ? String(v) : 'NONE';
    case 'boolean':
      return v ? 'true' : 'false';
    case 'string':
      return JSON.stringify(v);
    case 'object':
      if (v instanceof Date) return `type::datetime(${JSON.stringify(v.toISOString())})`;
      return JSON.stringify(v);
    default:
      return JSON.stringify(String(v));
  }
}

/** Same as `lit` but Date values become plain ISO strings (for MERGE payloads). */
export function litPlain(v: any): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  return lit(v);
}

// ---------------------------------------------------------------------
// Embedded engine — connected lazily on first query
// ---------------------------------------------------------------------

let engine: any = null;
let connected: Promise<void> | null = null;

/**
 * Load the SDK + native engine plugin and open the database file.
 * Done lazily (dynamic import) so a missing native binding surfaces as a clear
 * query-time error instead of crashing the server at boot.
 */
function ensureConnected(): Promise<void> {
  if (!connected) {
    connected = (async () => {
      const { Surreal } = await import('surrealdb');
      const { createNodeEngines } = await import('@surrealdb/node');
      const client = new Surreal({ engines: { ...createNodeEngines() } });
      await client.connect(`surrealkv://${DB_FILE}`);
      await client.use({ namespace: NS, database: DB });
      engine = client;
    })().catch((err: any) => {
      // Allow the next call to retry a transient failure.
      connected = null;
      throw new SurrealError(
        `[surreal] cannot open the database file "${DB_FILE}": ${err?.message ?? String(err)}`
      );
    });
  }
  return connected;
}

let requestSeq = 0;

async function rawSql(sql: string): Promise<SurrealStatementResult[]> {
  const id = ++requestSeq;
  await ensureConnected();
  try {
    const res: any = await engine.query(sql);
    // The SDK returns a QueryResult (indexable + iterable); normalise it to the
    // `{ status, result }` entries the callers below expect.
    const entries: any[] = Array.isArray(res)
      ? res
      : Array.from(res as Iterable<any>);
    const out: SurrealStatementResult[] = entries.map((entry: any) =>
      entry && typeof entry === 'object' && 'result' in entry
        ? { status: entry.status ?? 'OK', result: entry.result, time: entry.time }
        : { status: 'OK', result: entry }
    );
    for (const stmt of out) {
      if (stmt.status && stmt.status !== 'OK') {
        throw new SurrealError(
          `[surreal#${id}] ${stmt.status}: ${String(stmt.result).slice(0, 500)} | sql: ${sql.slice(0, 300)}`
        );
      }
    }
    return out;
  } catch (err: any) {
    if (err instanceof SurrealError) throw err;
    throw new SurrealError(
      `[surreal#${id}] ${err?.message ?? String(err)} | sql: ${sql.slice(0, 300)}`
    );
  }
}

/**
 * Run multiple statements in one round trip.
 * Returns the array of per-statement results (each entry is the statement's result value).
 */
export async function query(sql: string): Promise<any[]> {
  const results = await rawSql(sql);
  return results.map(r => r.result);
}

/** Run one statement; returns its result (array for SELECT/CREATE, count for UPDATE...). */
export async function one<T = any>(sql: string): Promise<T> {
  const results = await rawSql(sql);
  return results[0]?.result as T;
}

/** SELECT-style statement → array of rows. */
export async function select<T = any>(sql: string): Promise<T[]> {
  const result = await one<any>(sql);
  return Array.isArray(result) ? result : [];
}

export const surreal = {
  query,
  one,
  select,
  lit,
  litPlain,
  // `url` is kept as the datastore location for backwards compatibility with
  // existing log lines; it is now a file path, not an HTTP endpoint.
  config: { url: DB_FILE, file: DB_FILE, engine: 'surrealkv', ns: NS, db: DB },
};

/** Close the engine (used by graceful shutdown). */
export async function closeSurreal(): Promise<void> {
  if (engine) {
    try {
      await engine.close();
    } finally {
      engine = null;
      connected = null;
    }
  }
}
