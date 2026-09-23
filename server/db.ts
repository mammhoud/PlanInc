/**
 * SurrealDB data layer — the ONLY database client in the codebase.
 *
 * There is no ORM, no schema engine, no SQL database and no separate database
 * server: every operation is compiled to SurrealQL and executed against the
 * SurrealDB engine (see ./surreal.ts). The document-style call shapes
 * (`db.<table>.<method>()`) are preserved so routers and jobs keep working.
 *
 * Design notes (validated live against SurrealDB v1.5.6):
 *  - Records use deterministic numeric ids (`notes:42`); the data layer hides the
 *    `table:` prefix and hands plain numbers to callers, exactly like the old
 *    autoincrement integer PKs.
 *  - Id allocation uses an atomic per-table counter row (`seq:<table>`),
 *    updated with `UPDATE ... SET n = (IF n IS NONE { 1 } ELSE { n + 1 })`.
 *  - `WHERE id = N` is rewritten to `WHERE id = table:N` because Surreal id
 *    equality compares record references.
 *  - String filters map to: contains → string::matches regex (with
 *    `(?i)` for mode:'insensitive'), startsWith → string::starts_with,
 *    in → id IN [...] / value IN [...].
 *  - Relation filters used by the codebase (kept explicit, compiled to
 *    subqueries): notes.attachments, notes.internalShares, notes.tags,
 *    attachments.note, accounts.configs, tag.tagsToNote/note.
 *  - `include` support covers every shape the routers use: tags.tag,
 *    attachments, comments.account, references.toNote, referencedBy.fromNote,
 *    _count(comments|histories), internalShares, account, provider,
 *    provider.models, models.provider, messages, tagsToNote.tag,
 *    notes.account, configs.user.
 *  - $transaction(fn) executes fn against the same layer (best-effort atomicity;
 *    Surreal multi-statement transactions are used where a direct SQL form
 *    exists).
 *  - Dates are stored as ISO strings via type::datetime() and returned as
 *    JS Date objects (dates round-trip as real Dates).
 */
import { surreal, lit, litPlain, SurrealError } from './surreal';

const { query, select, one } = surreal;

// ---------------------------------------------------------------------
// Schema metadata
// ---------------------------------------------------------------------

const DATE_FIELDS: Record<string, string[]> = {
  accounts: ['createdAt', 'updatedAt'],
  attachments: ['createdAt', 'updatedAt'],
  config: [],
  notes: ['createdAt', 'updatedAt', 'shareExpiryDate'],
  comments: ['createdAt', 'updatedAt'],
  tag: ['createdAt', 'updatedAt'],
  tagsToNote: [],
  noteReference: ['createdAt'],
  follows: ['createdAt', 'updatedAt'],
  notifications: ['createdAt', 'updatedAt'],
  cache: ['createdAt', 'updatedAt'],
  plugin: ['createdAt', 'updatedAt'],
  conversation: ['createdAt', 'updatedAt'],
  message: ['createdAt', 'updatedAt'],
  noteHistory: ['createdAt'],
  noteInternalShare: ['createdAt', 'updatedAt'],
  aiProviders: ['createdAt', 'updatedAt'],
  aiModels: ['createdAt', 'updatedAt'],
  aiScheduledTask: ['createdAt', 'updatedAt', 'lastRun'],
  mcpServers: ['createdAt', 'updatedAt'],
  fonts: ['createdAt', 'updatedAt'],
  tickets: ['createdAt', 'updatedAt'],
  studyItems: ['createdAt', 'updatedAt', 'srsDueAt', 'srsLastAt'],
  // Learning skills (level 1–5 mastery bar, linked to notes by tag).
  skills: ['createdAt', 'updatedAt'],
  planningLinks: ['createdAt', 'updatedAt'],
  planningFormFields: ['createdAt', 'updatedAt'],
  // Layered share approvals: one row per requested share (internal recipient,
  // email invite, or public link) that must be approved before access exists.
  shareApprovals: ['createdAt', 'updatedAt', 'decidedAt', 'expiresAt'],
  // Account-scoped agent directories: working dirs and ordered skills dirs.
  agentDirectories: ['createdAt', 'updatedAt'],
  // Predefined, account-unique categories (lanes) that plans can be filed under.
  planningCategories: ['createdAt', 'updatedAt'],
};

const TABLES = Object.keys(DATE_FIELDS);

type Table = keyof typeof DATE_FIELDS;

interface FindArgs {
  where?: any;
  orderBy?: any;
  skip?: number;
  take?: number;
  select?: any;
  include?: any;
  distinct?: any;
}

interface CreateArgs {
  data: any;
}

interface UpdateArgs {
  where: any;
  data: any;
}

interface UpsertArgs {
  where: any;
  update: any;
  create: any;
}

// ---------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------

function normalizeRecord(table: string, row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };

  if (table === 'notes') {
    out.isReviewed ??= false;
    out.metadata ??= {};
    out.shareEncryptedUrl ??= null;
    out.shareMaxView ??= null;
    out.shareViewCount ??= null;
    out.sortOrder ??= 0;
    out.sharePassword ??= '';
    out.isArchived ??= false;
    out.isRecycle ??= false;
    out.isShare ??= false;
    out.isTop ??= false;
    out.type ??= 0;
    out.content ??= '';
  } else if (table === 'attachments') {
    out.accountId ??= null;
    out.sortOrder ??= 0;
    out.type ??= '';
    out.depth ??= null;
    out.perfixPath ??= null;
    out.sharePassword ??= '';
    out.isShare ??= false;
    out.size ??= 0;
  } else if (table === 'tag') {
    out.sortOrder ??= 0;
    out.icon ??= '';
    out.parent ??= 0;
    out.createdAt ??= out.created_at ?? new Date();
    out.updatedAt ??= out.updated_at ?? out.createdAt;
    if (!(out.createdAt instanceof Date) || Number.isNaN(out.createdAt.getTime())) out.createdAt = new Date();
    if (!(out.updatedAt instanceof Date) || Number.isNaN(out.updatedAt.getTime())) out.updatedAt = out.createdAt;
  } else if (table === 'accounts') {
    out.image ??= '';
    out.apiToken ??= '';
    out.note ??= 0;
  } else if (table === 'tickets') {
    out.description ??= '';
    out.status ??= 'open';
    out.priority ??= 'medium';
    out.noteId ??= null;
    out.studyItemId ??= null;
    out.category ??= '';
    out.tags ??= [];
    out.customFields ??= {};
  } else if (table === 'studyItems') {
    out.description ??= '';
    out.status ??= 'planned';
    out.sourceUrl ??= '';
    out.noteId ??= null;
    out.category ??= '';
    out.tags ??= [];
    out.customFields ??= {};
    out.question ??= '';
    out.answer ??= '';
    out.srsEase ??= 2.5;
    out.srsInterval ??= 0;
    out.srsReps ??= 0;
    out.srsLapses ??= 0;
    out.srsDueAt ??= null;
    out.srsLastAt ??= null;
  } else if (table === 'skills') {
    out.description ??= '';
    out.level ??= 1;
    out.mastery ??= 0;
    out.tags ??= [];
  } else if (table === 'planningLinks') {
    out.label ??= '';
    out.metadata ??= {};
    out.showInGraph ??= true;
  } else if (table === 'planningFormFields') {
    out.key ??= '';
    out.kind ??= 'ticket';
    out.fieldType ??= 'text';
    out.options ??= [];
    out.required ??= false;
    out.showInGraph ??= false;
    out.enabled ??= true;
    out.sortOrder ??= 0;
  }

  return out;
}

function parseDates(table: string, row: any): any {
  if (!row || typeof row !== 'object') return row;
  const out = normalizeRecord(table, row);
  for (const f of DATE_FIELDS[table] || []) {
    if (out[f] != null && typeof out[f] === 'string') {
      const d = new Date(out[f]);
      if (!isNaN(d.getTime())) out[f] = d;
    }
  }
  return out;
}

function parseDatesAll(table: string, rows: any[]): any[] {
  return rows.map(r => parseDates(table, r));
}

function stripIdPrefix(id: any): number {
  if (typeof id === 'number') return id;
  const value = String(id);
  const numericId = Number(value.split(':').pop());
  return Number.isFinite(numericId) ? numericId : Number(id);
}

function toRecordId(table: string, id: any): string {
  return `${table}:${stripIdPrefix(id)}`;
}

// ---------------------------------------------------------------------
// WHERE compiler
// ---------------------------------------------------------------------

function compileValue(table: string, field: string, v: any): string {
  if (v === null || v === undefined) return 'NONE';
  if (v instanceof Date) return lit(v);
  // ISO date strings (openapi / JSON body paths) on datetime fields must become
  // type::datetime; comparing against a bare string matches nothing.
  if (
    typeof v === 'string' &&
    DATE_FIELDS[table]?.includes(field) &&
    /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v)
  ) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return lit(d);
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    // Filter object: { equals, in, notIn, contains, mode, startsWith, gt, gte, lt, lte, not }
    const parts: string[] = [];
    const insensitive = v.mode === 'insensitive';
    if ('equals' in v) parts.push(`${field} = ${compileValue(table, field, v.equals)}`);
    if ('in' in v) parts.push(`${field} IN [${v.in.map((x: any) => compileValue(table, field, x)).join(', ')}]`);
    if ('notIn' in v) parts.push(`${field} NOT IN [${v.notIn.map((x: any) => compileValue(table, field, x)).join(', ')}]`);
    if ('not' in v) parts.push(`${field} != ${compileValue(table, field, v.not)}`);
    if ('contains' in v) {
      if (insensitive) {
        parts.push(`string::matches(${field}, ${JSON.stringify('(?i)' + escapeRegex(String(v.contains)))})`);
      } else {
        parts.push(`string::matches(${field}, ${JSON.stringify(escapeRegex(String(v.contains)))})`);
      }
    }
    // SurrealDB's snake_case names are the ones that exist; the camelCase forms
    // parse-error at query time ("Invalid function/constant path").
    if ('startsWith' in v) {
      parts.push(`string::starts_with(${field}, ${JSON.stringify(String(v.startsWith))})`);
    }
    if ('endsWith' in v) {
      parts.push(`string::ends_with(${field}, ${JSON.stringify(String(v.endsWith))})`);
    }
    if ('gt' in v) parts.push(`${field} > ${compileValue(table, field, v.gt)}`);
    if ('gte' in v) parts.push(`${field} >= ${compileValue(table, field, v.gte)}`);
    if ('lt' in v) parts.push(`${field} < ${compileValue(table, field, v.lt)}`);
    if ('lte' in v) parts.push(`${field} <= ${compileValue(table, field, v.lte)}`);
    return parts.length ? `(${parts.join(' AND ')})` : 'true';
  }
  return lit(v);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlainObject(v: any): boolean {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** Compile a filter `where` object into a SurrealQL WHERE expression. */
function compileWhere(table: string, where: any): string {
  if (!where || Object.keys(where).length === 0) return 'true';
  const parts: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if (key === 'OR') {
      const subs = (value as any[]).map(w => `(${compileWhere(table, w)})`).filter(s => s !== '(true)');
      parts.push(subs.length ? `(${subs.join(' OR ')})` : 'false');
      continue;
    }
    if (key === 'AND') {
      const subs = (value as any[]).map(w => compileWhere(table, w)).filter(s => s !== 'true');
      parts.push(subs.length ? `(${subs.join(' AND ')})` : 'true');
      continue;
    }
    if (key === 'NOT') {
      const w = Array.isArray(value) ? value[0] : value;
      const compiled = compileWhere(table, w);
      parts.push(compiled === 'true' ? 'true' : `NOT (${compiled})`);
      continue;
    }

    if (key === 'id') {
      // Record-reference equality / IN for ids.
      if (isPlainObject(value)) {
        if ('in' in value) parts.push(`id IN [${value.in.map((x: any) => toRecordId(table, x)).join(', ')}]`);
        else if ('notIn' in value) parts.push(`id NOT IN [${value.notIn.map((x: any) => toRecordId(table, x)).join(', ')}]`);
        else if ('equals' in value) parts.push(`id = ${toRecordId(table, value.equals)}`);
        else if ('not' in value) parts.push(`id != ${toRecordId(table, value.not)}`);
        else if ('gte' in value) parts.push(`id >= ${table}:${stripIdPrefix(value.gte)}`);
        else if ('gt' in value) parts.push(`id > ${table}:${stripIdPrefix(value.gt)}`);
        else if ('lte' in value) parts.push(`id <= ${table}:${stripIdPrefix(value.lte)}`);
        else if ('lt' in value) parts.push(`id < ${table}:${stripIdPrefix(value.lt)}`);
      } else {
        parts.push(`id = ${toRecordId(table, value)}`);
      }
      continue;
    }

    // Relation filters used by the codebase:
    if (table === 'notes' && key === 'attachments') {
      parts.push(compileRelationSome('attachments', 'noteId', value));
      continue;
    }
    if (table === 'notes' && key === 'internalShares') {
      parts.push(compileRelationSome('noteInternalShare', 'noteId', value));
      continue;
    }
    if (table === 'notes' && key === 'tags') {
      // tags: { none: {} } → note has no rows in tagsToNote
      const v: any = value;
      if (v && 'none' in v) parts.push(`(array::len((SELECT value id FROM tagsToNote WHERE noteId = id)) = 0)`);
      else if (v && 'some' in v) parts.push(`(array::len((SELECT value id FROM tagsToNote WHERE noteId = id)) > 0)`);
      continue;
    }
    if (table === 'attachments' && key === 'note') {
      const v: any = value;
      const inner = compileWhere('notes', v);
      parts.push(`(noteId IN (SELECT value id FROM notes WHERE ${inner}))`);
      continue;
    }
    if (table === 'tag' && (key === 'tagsToNote' || key === 'notes')) {
      const v: any = value;
      if (v && ('some' in v || 'none' in v)) {
        const inner = v.some ?? v.none;
        const noteWhere = compileWhere('notes', inner?.note ?? {});
        const has = `(array::len((SELECT value id FROM tagsToNote WHERE tagId = id AND noteId IN (SELECT value id FROM notes WHERE ${noteWhere}))) > 0)`;
        parts.push('some' in v ? has : `NOT ${has}`);
      }
      continue;
    }
    if (table === 'accounts' && key === 'configs') {
      const v: any = value;
      if (v && 'some' in v) {
        const inner = compileWhere('config', v.some);
        parts.push(`(array::len((SELECT value id FROM config WHERE userId = id AND ${inner})) > 0)`);
      }
      continue;
    }
    if (table === 'comments' && key === 'note') {
      const v: any = value;
      const inner = compileWhere('notes', v);
      parts.push(`(noteId IN (SELECT value id FROM notes WHERE ${inner}))`);
      continue;
    }

    // Operator filters ({ gte, lte, contains, … }) compile to a full boolean
    // expression in compileValue. Prefixing with `key =` yields invalid SQL
    // (e.g. `createdAt = (createdAt >= … AND createdAt <= …)`) and silently
    // returns zero rows — monthly stats noteCount was always 0 because of this.
    if (isPlainObject(value)) {
      const compiled = compileValue(table, key, value);
      if (compiled !== 'true') parts.push(compiled);
      continue;
    }

    // Scalar field
    parts.push(`${key} = ${compileValue(table, key, value)}`);
  }

  const filtered = parts.filter(p => p !== 'true');
  return filtered.length ? filtered.join(' AND ') : 'true';
}

function compileRelationSome(relTable: string, fkField: string, v: any): string {
  if (!v || !('some' in v)) return 'true';
  const inner = compileWhere(relTable === 'attachments' || relTable === 'noteInternalShare' ? relTable : relTable, { ...v.some, [fkField]: undefined });
  // inner references the related row; correlate via fkField = outer id
  const cond = inner === 'true' ? '' : ` AND ${inner}`;
  return `(array::len((SELECT value id FROM ${relTable} WHERE ${fkField} = id${cond})) > 0)`;
}

// ---------------------------------------------------------------------
// ORDER BY compiler
// ---------------------------------------------------------------------

function compileOrderBy(table: string, orderBy: any): string {
  if (!orderBy) return '';
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const item of items) {
    for (const [field, dir] of Object.entries(item)) {
      const d = dir === 'asc' ? 'ASC' : 'DESC';
      if (field === 'id') {
        parts.push(`id ${d}`);
      } else {
        parts.push(`${field} ${d}`);
      }
    }
  }
  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
}

// ---------------------------------------------------------------------
// Id allocation (atomic per-table counter)
// ---------------------------------------------------------------------

async function nextId(table: string): Promise<number> {
  // UPSERT is required here: a plain UPDATE on a missing record is a no-op
  // under the bundled @surrealdb/node 2.6.x core, which left `n` NONE and
  // made every first create fail with "failed to allocate id".
  const rows = await query(`
    UPSERT seq:${table} SET n = (IF n IS NONE { 1 } ELSE { n + 1 }) RETURN AFTER;
    SELECT VALUE n FROM seq:${table};
  `);
  const n = rows[1]?.[0]?.n ?? rows[1]?.[0];
  if (typeof n !== 'number') throw new SurrealError(`failed to allocate id for ${table}`);
  return n;
}

async function peekMaxId(table: string): Promise<number> {
  const rows = await select(`SELECT value record::tb(id) FROM ${table} LIMIT 1;`);
  void rows;
  // Deterministic numeric ids: derive max from the counter if present.
  const counter = await select(`SELECT value n FROM seq:${table};`);
  return counter[0] ?? 0;
}

// ---------------------------------------------------------------------
// Include engine
// ---------------------------------------------------------------------

async function hydrate(table: string, rows: any[], include: any): Promise<any[]> {
  if (!include || !rows.length) return rows;
  const out: any[] = [];
  for (const row of rows) {
    out.push(await hydrateRow(table, row, include));
  }
  return out;
}

async function hydrateRow(table: string, row: any, include: any): Promise<any> {
  const rid = stripIdPrefix(row.id);
  const out: any = { ...row, id: rid };

  const want = (k: string) => include[k] !== undefined && include[k] !== false;

  if (table === 'notes') {
    if (want('tags')) {
      const t2n = await select(`SELECT id, noteId, tagId FROM tagsToNote WHERE noteId = ${rid};`);
      const tagIds = t2n.map(t => t.tagId);
      const tags = tagIds.length
        ? await select(`SELECT id, name, icon, parent, accountId, sortOrder, createdAt, updatedAt FROM tag WHERE id IN [${tagIds.map(i => `tag:${i}`).join(', ')}];`)
        : [];
      out.tags = t2n
        .map(t2 => {
          const tag = tags.find(t => stripIdPrefix(t.id) === t2.tagId);
          if (!tag) return null;
          const t = parseDates('tag', { ...tag, id: stripIdPrefix(tag.id) });
          return { id: stripIdPrefix(t2.id), noteId: t2.noteId, tagId: t2.tagId, tag: t };
        })
        .filter(Boolean);
      if (include.tags && isPlainObject(include.tags) && (include.tags as any).include?.tag) {
        // already nested above
      }
    }
    if (want('attachments')) {
      const order = compileOrderBy('attachments', (include.attachments as any)?.orderBy);
      const atts = await select(`SELECT * FROM attachments WHERE noteId = ${rid}${order};`);
      out.attachments = parseDatesAll('attachments', atts.map(a => ({ ...a, id: stripIdPrefix(a.id) })));
    }
    if (want('comments')) {
      const comments = await select(`SELECT * FROM comments WHERE noteId = ${rid} ORDER BY createdAt ASC;`);
      const hydrated: any[] = [];
      for (const c of comments) {
        const cr = { ...c, id: stripIdPrefix(c.id) };
        if ((include.comments as any)?.include?.account) {
          if (cr.accountId) {
            const acc = await select(`SELECT * FROM accounts WHERE id = accounts:${cr.accountId};`);
            cr.account = acc[0]
              ? ((include.comments as any).include.account.select
                ? pickFields(parseDates('accounts', { ...acc[0], id: stripIdPrefix(acc[0].id) }), (include.comments as any).include.account.select)
                : null)
              : null;
          } else {
            cr.account = null;
          }
        }
        hydrated.push(parseDates('comments', cr));
      }
      out.comments = hydrated;
    }
    if (want('references')) {
      const refs = await select(`SELECT id, fromNoteId, toNoteId FROM noteReference WHERE fromNoteId = ${rid};`);
      const withTo: any[] = [];
      for (const r of refs) {
        const sel = (include.references as any)?.select?.toNote?.select;
        const fields = sel ? Object.keys(sel).join(', ') : 'id, content, createdAt, updatedAt';
        const to = await select(`SELECT ${fields} FROM notes WHERE id = notes:${r.toNoteId};`);
        withTo.push({
          id: stripIdPrefix(r.id),
          fromNoteId: r.fromNoteId,
          toNoteId: r.toNoteId,
          toNote: to[0] ? parseDates('notes', { ...to[0], id: stripIdPrefix(to[0].id) }) : null,
        });
      }
      out.references = withTo;
    }
    if (want('referencedBy')) {
      const refs = await select(`SELECT id, fromNoteId, toNoteId FROM noteReference WHERE toNoteId = ${rid};`);
      const withFrom: any[] = [];
      for (const r of refs) {
        const sel = (include.referencedBy as any)?.select?.fromNote?.select;
        const fields = sel ? Object.keys(sel).join(', ') : 'id, content, createdAt, updatedAt';
        const from = await select(`SELECT ${fields} FROM notes WHERE id = notes:${r.fromNoteId};`);
        withFrom.push({
          id: stripIdPrefix(r.id),
          fromNoteId: r.fromNoteId,
          toNoteId: r.toNoteId,
          fromNote: from[0] ? parseDates('notes', { ...from[0], id: stripIdPrefix(from[0].id) }) : null,
        });
      }
      out.referencedBy = withFrom;
    }
    if (want('_count')) {
      const countSel = (include._count as any)?.select || {};
      const counts: any = {};
      if (countSel.comments) {
        const c = await select(`SELECT count() FROM comments WHERE noteId = ${rid} GROUP ALL;`);
        counts.comments = c[0]?.count ?? 0;
      }
      if (countSel.histories) {
        const h = await select(`SELECT count() FROM noteHistory WHERE noteId = ${rid} GROUP ALL;`);
        counts.histories = h[0]?.count ?? 0;
      }
      if (countSel.attachments) {
        const a = await select(`SELECT count() FROM attachments WHERE noteId = ${rid} GROUP ALL;`);
        counts.attachments = a[0]?.count ?? 0;
      }
      if (countSel.tagsToNote) {
        const t = await select(`SELECT count() FROM tagsToNote WHERE noteId = ${rid} GROUP ALL;`);
        counts.tagsToNote = t[0]?.count ?? 0;
      }
      out._count = counts;
    }
    if (want('internalShares')) {
      const shares = await select(`SELECT * FROM noteInternalShare WHERE noteId = ${rid};`);
      out.internalShares = parseDatesAll('noteInternalShare', shares.map(s => ({ ...s, id: stripIdPrefix(s.id) })));
    }
    if (want('account') && row.accountId) {
      const sel = (include.account as any)?.select;
      const fields = sel ? Object.keys(sel).filter(f => f !== '_count').join(', ') : '*';
      const acc = await select(`SELECT ${fields} FROM accounts WHERE id = accounts:${row.accountId};`);
      out.account = acc[0] ? parseDates('accounts', { ...acc[0], id: stripIdPrefix(acc[0].id) }) : null;
      if (out.account === null && row.accountId) {
        // relation select on a missing account resolves to null
        out.account = null;
      }
    }
    if (want('histories')) {
      const hist = await select(`SELECT * FROM noteHistory WHERE noteId = ${rid} ORDER BY createdAt DESC;`);
      out.histories = parseDatesAll('noteHistory', hist.map(h => ({ ...h, id: stripIdPrefix(h.id) })));
    }
    if (want('owner') && row.accountId) {
      const acc = await select(`SELECT id, name, nickname, image FROM accounts WHERE id = accounts:${row.accountId};`);
      out.owner = acc[0] ? { ...acc[0], id: stripIdPrefix(acc[0].id) } : null;
    }
  } else if (table === 'accounts') {
    if (want('configs')) {
      const cfgs = await select(`SELECT * FROM config WHERE userId = ${rid};`);
      out.configs = cfgs.map(c => ({ ...c, id: stripIdPrefix(c.id) }));
    }
    if (want('notes')) {
      const ns = await select(`SELECT * FROM notes WHERE accountId = ${rid};`);
      out.notes = parseDatesAll('notes', ns.map(n => ({ ...n, id: stripIdPrefix(n.id) })));
    }
  } else if (table === 'attachments') {
    if (want('note') && row.noteId) {
      const n = await select(`SELECT * FROM notes WHERE id = notes:${row.noteId};`);
      out.note = n[0] ? parseDates('notes', { ...n[0], id: stripIdPrefix(n[0].id) }) : null;
    }
    if (want('account') && row.accountId) {
      const a = await select(`SELECT * FROM accounts WHERE id = accounts:${row.accountId};`);
      out.account = a[0] ? parseDates('accounts', { ...a[0], id: stripIdPrefix(a[0].id) }) : null;
    }
  } else if (table === 'tag') {
    if (want('tagsToNote')) {
      const t2n = await select(`SELECT * FROM tagsToNote WHERE tagId = ${rid};`);
      out.tagsToNote = t2n.map(t => ({ ...t, id: stripIdPrefix(t.id) }));
      if ((include.tagsToNote as any)?.include?.note) {
        for (const t of out.tagsToNote) {
          const n = await select(`SELECT * FROM notes WHERE id = notes:${t.noteId};`);
          t.note = n[0] ? parseDates('notes', { ...n[0], id: stripIdPrefix(n[0].id) }) : null;
        }
      }
    }
    if (want('_count')) {
      const countSel = (include._count as any)?.select || {};
      const counts: any = {};
      if (countSel.tagsToNote) {
        const c = await select(`SELECT count() FROM tagsToNote WHERE tagId = ${rid} GROUP ALL;`);
        counts.tagsToNote = c[0]?.count ?? 0;
      }
      out._count = counts;
    }
  } else if (table === 'aiProviders') {
    if (want('models')) {
      const ms = await select(`SELECT * FROM aiModels WHERE providerId = ${rid} ORDER BY sortOrder ASC;`);
      out.models = parseDatesAll('aiModels', ms.map(m => ({ ...m, id: stripIdPrefix(m.id) })));
    }
  } else if (table === 'aiModels') {
    if (want('provider') && row.providerId) {
      const p = await select(`SELECT * FROM aiProviders WHERE id = aiProviders:${row.providerId};`);
      out.provider = p[0] ? parseDates('aiProviders', { ...p[0], id: stripIdPrefix(p[0].id) }) : null;
    }
  } else if (table === 'conversation') {
    if (want('messages')) {
      const ms = await select(`SELECT * FROM message WHERE conversationId = ${rid} ORDER BY createdAt ASC;`);
      out.messages = parseDatesAll('message', ms.map(m => ({ ...m, id: stripIdPrefix(m.id) })));
    }
    if (want('account') && row.accountId) {
      const a = await select(`SELECT * FROM accounts WHERE id = accounts:${row.accountId};`);
      out.account = a[0] ? pickFields(parseDates('accounts', { ...a[0], id: stripIdPrefix(a[0].id) }), (include.account as any)?.select) : null;
    }
  } else if (table === 'config') {
    if (want('user') && row.userId) {
      const a = await select(`SELECT * FROM accounts WHERE id = accounts:${row.userId};`);
      out.user = a[0] ? parseDates('accounts', { ...a[0], id: stripIdPrefix(a[0].id) }) : null;
    }
  } else if (table === 'comments') {
    if (want('account') && row.accountId) {
      const a = await select(`SELECT * FROM accounts WHERE id = accounts:${row.accountId};`);
      out.account = a[0] ? parseDates('accounts', { ...a[0], id: stripIdPrefix(a[0].id) }) : null;
    }
    if (want('replies')) {
      const rs = await select(`SELECT * FROM comments WHERE parentId = ${rid} ORDER BY createdAt ASC;`);
      out.replies = parseDatesAll('comments', rs.map(r => ({ ...r, id: stripIdPrefix(r.id) })));
    }
  } else if (table === 'follows') {
    if (want('account') && row.accountId) {
      const a = await select(`SELECT * FROM accounts WHERE id = accounts:${row.accountId};`);
      out.account = a[0] ? parseDates('accounts', { ...a[0], id: stripIdPrefix(a[0].id) }) : null;
    }
  } else if (table === 'message') {
    if (want('conversation') && row.conversationId) {
      const c = await select(`SELECT * FROM conversation WHERE id = conversation:${row.conversationId};`);
      out.conversation = c[0] ? parseDates('conversation', { ...c[0], id: stripIdPrefix(c[0].id) }) : null;
    }
  }

  return out;
}

function pickFields(row: any, select: any): any {
  if (!select || !row) return row;
  const out: any = {};
  for (const k of Object.keys(select)) {
    if (select[k] && k in row) out[k] = row[k];
  }
  return out;
}

// ---------------------------------------------------------------------
// Table delegate
// ---------------------------------------------------------------------

function applySelect(rows: any[], select: any): any[] {
  if (!select) return rows;
  return rows.map(r => {
    const out: any = { id: r.id };
    for (const k of Object.keys(select)) {
      if (select[k] && k in r) out[k] = r[k];
    }
    return out;
  });
}

function createDelegate(table: string): any {
  const delegate = {
    async findMany(args: FindArgs = {}): Promise<any[]> {
      let sql = `SELECT * FROM ${table}`;
      const whereSql = compileWhere(table, args.where);
      if (whereSql !== 'true') sql += ` WHERE ${whereSql}`;
      sql += compileOrderBy(table, args.orderBy);
      if (args.take != null) sql += ` LIMIT ${Number(args.take)}`;
      if (args.skip != null) sql += ` START ${Number(args.skip)}`;
      let rows = await select(sql + ';');
      rows = parseDatesAll(table, rows.map(r => ({ ...r, id: stripIdPrefix(r.id) })));
      rows = await hydrate(table, rows, args.include);
      rows = applySelect(rows, args.select);
      return rows;
    },

    async findFirst(args: FindArgs = {}): Promise<any | null> {
      const rows = await delegate.findMany({ ...args, take: 1 });
      return rows[0] ?? null;
    },

    async findUnique(args: { where: any; include?: any; select?: any }): Promise<any | null> {
      // Only unique single-field identifiers exist: { id }
      const id = args.where?.id;
      if (id == null) {
        // e.g. cache unique key
        if (args.where?.key != null && table === 'cache') {
          const rows = await delegate.findMany({ where: { key: args.where.key }, take: 1, include: args.include });
          return rows[0] ?? null;
        }
        return null;
      }
      const rows = await delegate.findMany({ where: { id }, include: args.include, select: args.select, take: 1 });
      return rows[0] ?? null;
    },

    async create(args: CreateArgs): Promise<any> {
      const data = { ...args.data };
      let id: number;
      if (data.id != null) {
        id = stripIdPrefix(data.id);
        delete data.id;
      } else {
        id = await nextId(table);
      }
      if (!(table in { tagsToNote: 1 }) ) {
        if (DATE_FIELDS[table]?.includes('createdAt') && data.createdAt == null) data.createdAt = new Date();
        if (DATE_FIELDS[table]?.includes('updatedAt') && data.updatedAt == null) data.updatedAt = new Date();
      }
      const sets = Object.entries(data).map(([k, v]) => `${k} = ${lit(v)}`).join(', ');
      // Explicit seed ids (e.g. tagsToNote:1) can race the seq counter — skip
      // or re-allocate instead of failing CREATE with "already exists".
      for (let attempt = 0; attempt < 32; attempt++) {
        const clash = await select(`SELECT id FROM ${table} WHERE id = ${table}:${id};`);
        if (!clash.length) break;
        if (attempt === 0 && args.data?.id != null && data.id == null) {
          // caller forced an id that already exists — fall through to update semantics
        }
        id = await nextId(table);
      }
      const still = await select(`SELECT id FROM ${table} WHERE id = ${table}:${id};`);
      if (still.length) {
        await one(`UPDATE ${table}:${id} SET ${sets};`);
      } else {
        await one(`CREATE ${table}:${id} SET ${sets};`);
      }
      const rows = await select(`SELECT * FROM ${table} WHERE id = ${table}:${id};`);
      return parseDates(table, { ...rows[0], id });
    },

    async createMany(args: { data: any[] | any; skipDuplicates?: boolean }): Promise<{ count: number }> {
      const list = Array.isArray(args.data) ? args.data : [args.data];
      let count = 0;
      for (const item of list) {
        const data = { ...item };
        let id: number;
        if (data.id != null) {
          id = stripIdPrefix(data.id);
          delete data.id;
        } else {
          id = await nextId(table);
        }
        if (DATE_FIELDS[table]?.includes('createdAt') && data.createdAt == null) data.createdAt = new Date();
        if (DATE_FIELDS[table]?.includes('updatedAt') && data.updatedAt == null) data.updatedAt = new Date();
        const sets = Object.entries(data).map(([k, v]) => `${k} = ${lit(v)}`).join(', ');
        const exists = await select(`SELECT id FROM ${table} WHERE id = ${table}:${id};`);
        if (exists.length && args.skipDuplicates) continue;
        if (exists.length) {
          await one(`UPDATE ${table}:${id} SET ${sets};`);
        } else {
          await one(`CREATE ${table}:${id} SET ${sets};`);
        }
        count++;
      }
      return { count };
    },

    async update(args: UpdateArgs): Promise<any> {
      const id = stripIdPrefix(args.where.id);
      const existing = await select(`SELECT * FROM ${table} WHERE id = ${table}:${id};`);
      if (!existing[0]) throw new SurrealError(`Record to update not found (${table}:${id})`);
      const data = { ...args.data };
      if (DATE_FIELDS[table]?.includes('updatedAt')) data.updatedAt = data.updatedAt ?? new Date();
      const sets = Object.entries(data).map(([k, v]) => `${k} = ${lit(v)}`).join(', ');
      await one(`UPDATE ${table}:${id} SET ${sets};`);
      const rows = await select(`SELECT * FROM ${table} WHERE id = ${table}:${id};`);
      return parseDates(table, { ...rows[0], id });
    },

    async updateMany(args: { where: any; data: any }): Promise<{ count: number }> {
      const rowsBefore = await select(`SELECT id FROM ${table} WHERE ${compileWhere(table, args.where)};`);
      if (!rowsBefore.length) return { count: 0 };
      const data = { ...args.data };
      if (DATE_FIELDS[table]?.includes('updatedAt')) data.updatedAt = data.updatedAt ?? new Date();
      const sets = Object.entries(data).map(([k, v]) => `${k} = ${lit(v)}`).join(', ');
      const ids = rowsBefore.map(r => toRecordId(table, r.id));
      await one(`UPDATE ${table} SET ${sets} WHERE id IN [${ids.join(', ')}];`);
      return { count: rowsBefore.length };
    },

    async upsert(args: UpsertArgs): Promise<any> {
      // Fast path: unique single id
      if (args.where?.id != null) {
        const id = stripIdPrefix(args.where.id);
        const exists = await select(`SELECT id FROM ${table} WHERE id = ${table}:${id};`);
        if (exists[0]) {
          return delegate.update({ where: { id }, data: args.update });
        }
        return delegate.create({ data: { ...args.create, id } });
      }
      // Compound unique keys used in the codebase
      const existing = await delegate.findFirst({ where: args.where });
      if (existing) {
        return delegate.update({ where: { id: existing.id }, data: args.update });
      }
      return delegate.create({ data: args.create });
    },

    async delete(args: { where: any }): Promise<any> {
      const id = stripIdPrefix(args.where.id);
      const rows = await select(`SELECT * FROM ${table} WHERE id = ${table}:${id};`);
      if (!rows[0]) throw new SurrealError(`Record to delete not found (${table}:${id})`);
      await one(`DELETE ${table}:${id};`);
      return parseDates(table, { ...rows[0], id });
    },

    async deleteMany(args: { where?: any } = {}): Promise<{ count: number }> {
      const whereSql = compileWhere(table, args.where);
      if (whereSql === 'true') {
        const before = await select(`SELECT id FROM ${table};`);
        await one(`DELETE ${table};`);
        return { count: before.length };
      }
      const before = await select(`SELECT id FROM ${table} WHERE ${whereSql};`);
      if (!before.length) return { count: 0 };
      const ids = before.map(r => toRecordId(table, r.id));
      await one(`DELETE ${table} WHERE id IN [${ids.join(', ')}];`);
      return { count: before.length };
    },

    async count(args: { where?: any } = {}): Promise<number> {
      const whereSql = compileWhere(table, args.where);
      let sql = `SELECT count() FROM ${table}`;
      if (whereSql !== 'true') sql += ` WHERE ${whereSql}`;
      sql += ' GROUP ALL;';
      const rows = await select(sql);
      return rows[0]?.count ?? 0;
    },

    async aggregate(_args: any): Promise<any> {
      throw new SurrealError(`aggregate not implemented for ${table}`);
    },
  };
  return delegate;
}

// ---------------------------------------------------------------------
// Special delegates
// ---------------------------------------------------------------------

/** cache table: unique `key` field used with findUnique/upsert. */
function cacheDelegate(base: any): any {
  return {
    ...base,
    async findUnique(args: { where: any }): Promise<any | null> {
      if (args.where?.key != null) {
        const rows = await base.findMany({ where: { key: args.where.key }, take: 1 });
        return rows[0] ?? null;
      }
      return base.findUnique(args);
    },
    async upsert(args: UpsertArgs): Promise<any> {
      if (args.where?.key != null) {
        const rows = await base.findMany({ where: { key: args.where.key }, take: 1 });
        if (rows[0]) {
          return base.update({ where: { id: rows[0].id }, data: args.update });
        }
        return base.create({ data: { ...args.create, key: args.where.key } });
      }
      return base.upsert(args);
    },
  };
}

/** tagsToNote: compound PK (noteId, tagId) — upsert keyed on the pair. */
function tagsToNoteDelegate(base: any): any {
  return {
    ...base,
    async upsert(args: UpsertArgs & { where: any }): Promise<any> {
      const w = args.where;
      if (w?.noteId != null && w?.tagId != null) {
        const rows = await base.findMany({ where: { noteId: w.noteId, tagId: w.tagId }, take: 1 });
        if (rows[0]) return base.update({ where: { id: rows[0].id }, data: args.update });
        return base.create({ data: { ...args.create, noteId: w.noteId, tagId: w.tagId } });
      }
      return base.upsert(args);
    },
    async create(args: CreateArgs): Promise<any> {
      const d = { ...args.data };
      if (d.noteId != null && d.tagId != null) {
        const rows = await base.findMany({ where: { noteId: d.noteId, tagId: d.tagId }, take: 1 });
        if (rows[0]) return rows[0];
      }
      return base.create(args);
    },
  };
}

/** noteInternalShare: compound unique (noteId, accountId). */
function noteInternalShareDelegate(base: any): any {
  return {
    ...base,
    async upsert(args: UpsertArgs & { where: any }): Promise<any> {
      const w = args.where?.noteId_accountId;
      if (w) {
        const rows = await base.findMany({ where: { noteId: w.noteId, accountId: w.accountId }, take: 1 });
        if (rows[0]) return base.update({ where: { id: rows[0].id }, data: args.update });
        return base.create({ data: { ...args.create, noteId: w.noteId, accountId: w.accountId } });
      }
      return base.upsert(args);
    },
  };
}

// ---------------------------------------------------------------------
// $transaction / $queryRaw replacements
// ---------------------------------------------------------------------

async function transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  // Surreal best-effort: run the callback against the same (single) client.
  // Multi-statement atomicity is not required by the migrated call sites.
  return fn(db);
}

// ---------------------------------------------------------------------
// Exported db facade
// ---------------------------------------------------------------------

const delegates: Record<string, any> = {};
for (const table of TABLES) {
  let d = createDelegate(table);
  if (table === 'cache') d = cacheDelegate(d);
  if (table === 'tagsToNote') d = tagsToNoteDelegate(d);
  if (table === 'noteInternalShare') d = noteInternalShareDelegate(d);
  delegates[table] = d;
}

export const db: any = {
  ...delegates,
  $transaction: transaction,
  /**
   * Direct SurrealQL escape hatch (replaces db.$queryRaw).
   * Expects a COMPLETE SurrealQL query string.
   */
  $queryRaw: async <T = any>(sql: string): Promise<T[]> => {
    return select(sql);
  },
  /** Replaces db.$executeRaw. */
  $executeRaw: async (sql: string): Promise<number> => {
    const result = await one(sql);
    return Array.isArray(result) ? result.length : 1;
  },
  async $connect() { /* HTTP client: nothing to do */ },
  async $disconnect() { /* HTTP client: nothing to do */ },
};

/**
 * Ensure schema indexes/counter rows exist. Called once at server bootstrap
 * (idempotent).
 */
export async function ensureSurrealSchema(): Promise<void> {
  const statements: string[] = [];
  // Unique index for cache keys (used by cacheDelegate fast paths)
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_cache_key ON TABLE cache COLUMNS key UNIQUE;`);
  // tag.name has no unique constraint, so the name index stays non-unique —
  // it exists for lookup speed only.
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_tag_name ON TABLE tag COLUMNS name;`);
  // Some deployments carry a foreign SCHEMAFULL definition on `notes` that
  // requires relation fields (account/category) this data layer never writes.
  // Relax those and declare every camelCase field PlanInc stores so creates
  // and updates are accepted under SCHEMAFULL as well as SCHEMALESS.
  const noteFields: Array<[string, string]> = [
    ['account', 'option<record<account>>'],
    ['category', 'option<record<category>>'],
    ['assignee', 'option<record<account>>'],
    ['created_by', 'option<record<account>>'],
    ['type', 'option<number>'],
    ['content', 'option<string>'],
    ['accountId', 'option<number>'],
    ['isArchived', 'option<bool>'],
    ['isRecycle', 'option<bool>'],
    ['isShare', 'option<bool>'],
    ['isTop', 'option<bool>'],
    ['isReviewed', 'option<bool>'],
    ['sharePassword', 'option<string>'],
    ['shareEncryptedUrl', 'option<string>'],
    ['shareExpiryDate', 'option<datetime>'],
    ['shareMaxView', 'option<number>'],
    ['shareViewCount', 'option<number>'],
    ['metadata', 'option<object>'],
    ['categoryId', 'option<number>'],
    ['sortOrder', 'option<number>'],
    ['createdAt', 'option<datetime>'],
    ['updatedAt', 'option<datetime>'],
  ];
  for (const [field, type] of noteFields) {
    // Only content/metadata need FLEXIBLE (free-form objects/strings under
    // SCHEMAFULL); the modifier sits before TYPE: `FLEXIBLE TYPE <kind>`.
    const flexible = field === 'content' || field === 'metadata';
    statements.push(
      flexible
        ? `DEFINE FIELD IF NOT EXISTS ${field} ON notes FLEXIBLE TYPE ${type};`
        : `DEFINE FIELD IF NOT EXISTS ${field} ON notes TYPE ${type};`
    );
  }
  // IF NOT EXISTS leaves a previously required foreign field required, so also
  // overwrite the two relation fields that blocked creates (idempotent).
  statements.push(`DEFINE FIELD OVERWRITE account ON notes TYPE option<record<account>>;`);
  statements.push(`DEFINE FIELD OVERWRITE category ON notes TYPE option<record<category>>;`);
  // Foreign SCHEMAFULL definitions may still store the legacy snake_case twins
  // (`is_recycle`, …) without the camelCase fields PlanInc queries filter on.
  // Declaring camelCase alone is not enough: rows written before this schema
  // only have the snake_case keys, so `WHERE isRecycle = false` matches nothing
  // and every notes/attachments list comes back empty. One-time copy (idempotent).
  statements.push(
    `UPDATE notes SET isRecycle = is_recycle WHERE isRecycle IS NONE AND is_recycle IS NOT NONE;`
  );
  statements.push(
    `UPDATE notes SET isArchived = is_archived WHERE isArchived IS NONE AND is_archived IS NOT NONE;`
  );
  statements.push(
    `UPDATE notes SET isShare = is_share WHERE isShare IS NONE AND is_share IS NOT NONE;`
  );
  statements.push(
    `UPDATE notes SET isTop = is_top WHERE isTop IS NONE AND is_top IS NOT NONE;`
  );
  // Tag schema: seed rows and list hydration select icon/parent/dates/accountId.
  const tagFields: Array<[string, string]> = [
    ['name', 'string'],
    ['icon', 'option<string>'],
    ['parent', 'option<number>'],
    ['accountId', 'option<number>'],
    ['sortOrder', 'option<number>'],
    ['createdAt', 'option<datetime>'],
    ['updatedAt', 'option<datetime>'],
  ];
  for (const [field, type] of tagFields) {
    statements.push(`DEFINE FIELD IF NOT EXISTS ${field} ON tag TYPE ${type};`);
  }
  statements.push(
    `UPDATE tag SET icon = '' WHERE icon IS NONE;`
  );
  statements.push(
    `UPDATE tag SET parent = 0 WHERE parent IS NONE;`
  );
  statements.push(
    `UPDATE tag SET sortOrder = 0 WHERE sortOrder IS NONE;`
  );
  statements.push(
    `UPDATE tag SET createdAt = created_at WHERE createdAt IS NONE AND created_at IS NOT NONE;`
  );
  statements.push(
    `UPDATE tag SET updatedAt = updated_at WHERE updatedAt IS NONE AND updated_at IS NOT NONE;`
  );
  statements.push(
    `UPDATE tag SET createdAt = time::now() WHERE createdAt IS NONE;`
  );
  statements.push(
    `UPDATE tag SET updatedAt = time::now() WHERE updatedAt IS NONE;`
  );
  // Ensure every tag is owned so tags.list (scoped by accountId) returns them.
  statements.push(
    `UPDATE tag SET accountId = 1 WHERE accountId IS NONE;`
  );
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_notes_account ON TABLE notes COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_t2n_note ON TABLE tagsToNote COLUMNS noteId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_t2n_tag ON TABLE tagsToNote COLUMNS tagId;`);
  // Attachments schema (foreign SCHEMAFULL may omit camelCase PlanInc fields).
  const attachmentFields: Array<[string, string]> = [
    ['type', 'option<string>'],
    ['size', 'option<number>'],
    ['accountId', 'option<number>'],
    ['noteId', 'option<number>'],
    ['depth', 'option<number>'],
    ['perfixPath', 'option<string>'],
    ['sortOrder', 'option<number>'],
    ['isShare', 'option<bool>'],
    ['sharePassword', 'option<string>'],
    ['createdAt', 'option<datetime>'],
    ['updatedAt', 'option<datetime>'],
  ];
  for (const [field, type] of attachmentFields) {
    statements.push(`DEFINE FIELD IF NOT EXISTS ${field} ON attachments TYPE ${type};`);
  }
  // Existing deployments may have required `type`/`size`; keep inserts flexible.
  statements.push(`DEFINE FIELD OVERWRITE type ON attachments TYPE option<string>;`);
  statements.push(`DEFINE FIELD OVERWRITE size ON attachments TYPE option<number>;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_att_note ON TABLE attachments COLUMNS noteId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_nis_note ON TABLE noteInternalShare COLUMNS noteId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_msg_conv ON TABLE message COLUMNS conversationId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_aiModels_provider ON TABLE aiModels COLUMNS providerId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_t2n ON TABLE tagsToNote COLUMNS noteId, tagId UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_nis ON TABLE noteInternalShare COLUMNS noteId, accountId UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_noteref ON TABLE noteReference COLUMNS fromNoteId, toNoteId UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_fonts_name ON TABLE fonts COLUMNS name UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_tickets_account ON TABLE tickets COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_study_account ON TABLE studyItems COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_skills_account ON TABLE skills COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_planning_links_account ON TABLE planningLinks COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_planning_links_source ON TABLE planningLinks COLUMNS sourceType, sourceId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_planning_links_target ON TABLE planningLinks COLUMNS targetType, targetId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_planning_link ON TABLE planningLinks COLUMNS accountId, sourceType, sourceId, targetType, targetId UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_form_fields_account ON TABLE planningFormFields COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_form_fields_kind ON TABLE planningFormFields COLUMNS kind;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_form_field_key ON TABLE planningFormFields COLUMNS accountId, kind, key UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_share_approvals_account ON TABLE shareApprovals COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_share_approvals_note ON TABLE shareApprovals COLUMNS noteId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_share_approvals_invitee ON TABLE shareApprovals COLUMNS inviteeAccountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_share_approvals_status ON TABLE shareApprovals COLUMNS status;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_share_approval_token ON TABLE shareApprovals COLUMNS token UNIQUE;`);
  // shareApprovals: declare every column so output validation sees nulls not
  // undefined (legacy rows and creates that omit optional fields).
  const shareApprovalFields: Array<[string, string]> = [
    ['accountId', 'option<number>'],
    ['noteId', 'option<number>'],
    ['scope', 'option<string>'],
    ['status', 'option<string>'],
    ['inviteeAccountId', 'option<number>'],
    ['inviteeEmail', 'option<string>'],
    ['token', 'option<string>'],
    ['canEdit', 'option<bool>'],
    ['requiresAdmin', 'option<bool>'],
    ['adminApproved', 'option<bool>'],
    ['requestedBy', 'option<number>'],
    ['decidedBy', 'option<number>'],
    ['decidedAt', 'option<datetime>'],
    ['decisionNote', 'option<string>'],
    ['expiresAt', 'option<datetime>'],
    ['message', 'option<string>'],
    ['createdAt', 'option<datetime>'],
    ['updatedAt', 'option<datetime>'],
  ];
  for (const [field, type] of shareApprovalFields) {
    statements.push(`DEFINE FIELD IF NOT EXISTS ${field} ON shareApprovals TYPE ${type};`);
  }
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_agent_dirs_account ON TABLE agentDirectories COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_agent_dir_path ON TABLE agentDirectories COLUMNS accountId, kind, path UNIQUE;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS idx_planning_categories_account ON TABLE planningCategories COLUMNS accountId;`);
  statements.push(`DEFINE INDEX IF NOT EXISTS uniq_planning_category_slug ON TABLE planningCategories COLUMNS accountId, slug UNIQUE;`);
  // Apply one statement at a time so a single foreign/legacy DEFINE failure
  // (e.g. index on a field that does not exist yet) cannot abort the rest of
  // the bootstrap — the notes camelCase migration below must still run.
  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (err: any) {
      console.warn('[ensureSurrealSchema] skipped:', err?.message?.slice?.(0, 160) ?? err, '|', stmt.slice(0, 120));
    }
  }
}

export { peekMaxId, stripIdPrefix, toRecordId };

export default db;
