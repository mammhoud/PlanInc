/**
 * Django API adapter layer.
 *
 * The Django server speaks one envelope shape (`{status, message, data, meta}`
 * or `{status, error, message, details}`) across every slice. This module is the
 * single client that talks to it, so callers never re-implement envelope or
 * tenant handling. It is intentionally dependency-free and does not import the
 * tRPC router types, so it stays cheap for `tsc`.
 *
 * Migration order (see `MIGRATION_ORDER`): auth -> notes -> planning -> files ->
 * search -> AI -> integrations. `isDjangoSliceEnabled` lets each slice cut over
 * independently while the legacy tRPC API is still served.
 */

export type ApiStatus = 'success' | 'error';

export interface ApiEnvelope<T> {
  status: ApiStatus;
  message?: string;
  data?: T;
  meta?: ApiMeta;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  page_size?: number;
  total?: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

export class DjangoApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DjangoApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type ApiSlice = 'auth' | 'notes' | 'planning' | 'files' | 'search' | 'ai' | 'integrations';

export const MIGRATION_ORDER: readonly ApiSlice[] = [
  'auth',
  'notes',
  'planning',
  'files',
  'search',
  'ai',
  'integrations',
];

function envValue(key: string): string | undefined {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env ? env[key] : undefined;
  } catch {
    return undefined;
  }
}

/** Django base URL: explicit env, then a saved endpoint, then same origin. */
export function resolveDjangoBaseUrl(): string {
  const fromEnv = envValue('VITE_PLANINC_DJANGO_URL');
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem('planincDjangoEndpoint');
    if (saved) {
      return saved.replace(/\/+$/, '');
    }
  }
  return '';
}

export function resolveTenantSlug(): string | undefined {
  const fromEnv = envValue('VITE_PLANINC_TENANT');
  if (fromEnv) {
    return fromEnv;
  }
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('planincTenant') || undefined;
  }
  return undefined;
}

/**
 * Whether a slice should use Django. Defaults to the global
 * `VITE_PLANINC_API_MODE` (`django` enables all), with per-slice overrides via
 * `VITE_PLANINC_API_<SLICE>`.
 */
export function isDjangoSliceEnabled(slice: ApiSlice): boolean {
  const override = envValue(`VITE_PLANINC_API_${slice.toUpperCase()}`);
  if (override === 'django') {
    return true;
  }
  if (override === 'legacy') {
    return false;
  }
  return envValue('VITE_PLANINC_API_MODE') === 'django';
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bearer token; falls back to the saved session when omitted. */
  token?: string;
  tenant?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  baseUrl?: string;
}

/** Core request: builds the URL, sends JSON, unwraps the standard envelope. */
export async function djangoRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = (options.baseUrl ?? resolveDjangoBaseUrl()).replace(/\/+$/, '');
  const url = `${base}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };

  const tenant = options.tenant ?? resolveTenantSlug();
  if (tenant) {
    headers['X-Planinc-Tenant'] = tenant;
  }

  const token = options.token ?? (typeof window !== 'undefined' ? window.localStorage.getItem('planincToken') ?? undefined : undefined);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = { method: options.method ?? 'GET', headers, signal: options.signal };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, init);
  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || envelope?.status === 'error') {
    throw new DjangoApiError(
      envelope?.error ?? 'request_failed',
      envelope?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      envelope?.details,
    );
  }
  return (envelope?.data ?? (null as unknown)) as T;
}

/** Request that also exposes envelope metadata (pagination). */
export async function djangoRequestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: ApiMeta }> {
  const base = (options.baseUrl ?? resolveDjangoBaseUrl()).replace(/\/+$/, '');
  const url = `${base}${path}`;
  const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers ?? {}) };
  const tenant = options.tenant ?? resolveTenantSlug();
  if (tenant) {
    headers['X-Planinc-Tenant'] = tenant;
  }
  const token = options.token ?? (typeof window !== 'undefined' ? window.localStorage.getItem('planincToken') ?? undefined : undefined);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url, { method: options.method ?? 'GET', headers, signal: options.signal });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || envelope.status === 'error') {
    throw new DjangoApiError(
      envelope.error ?? 'request_failed',
      envelope.message ?? `Request failed with status ${response.status}.`,
      response.status,
      envelope.details,
    );
  }
  return { data: envelope.data as T, meta: envelope.meta };
}

// ---------------------------------------------------------------------------
// Domain types (kept local and minimal on purpose)
// ---------------------------------------------------------------------------
export interface NoteDto {
  id: number;
  title: string;
  body: string;
  workspace_id: number | null;
  author: string | null;
  tags: TagDto[];
  created_at: string;
  updated_at: string;
}

export interface TagDto {
  id: number;
  name: string;
  slug: string;
  color: string;
}

export interface NoteCommentDto {
  id: number;
  body: string;
  author: string | null;
  parent_id: number | null;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteVersionDto {
  id: number;
  version: number;
  title: string;
  body: string;
  created_at: string;
}

export interface TaskDto {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  due_at: string | null;
  workspace_id: number | null;
  categories: { id: number; name: string; slug: string }[];
}

export interface TicketDto {
  id: number;
  title: string;
  body: string;
  status: string;
  priority: string;
  task_id: number | null;
}

export interface StudyItemDto {
  id: number;
  title: string;
  status: string;
  due_at: string | null;
  interval_days: number;
  review_count: number;
}

export interface AttachmentDto {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  object_key: string;
  note_id: number | null;
}

export interface SearchHitDto {
  id: number;
  object_type: string;
  object_id: number;
  title: string;
  workspace_id: number | null;
  tag_slugs: string[];
}

export interface ConversationDto {
  id: number;
  title: string;
  agent_id: number | null;
  updated_at: string;
}

export interface AiRunDto {
  id: number;
  status: string;
  output: string;
  error: string;
  usage: { total_tokens: number; latency_ms: number }[];
}

// ---------------------------------------------------------------------------
// Slice adapters, in migration order
// ---------------------------------------------------------------------------
export const djangoApi = {
  auth: {
    profile: () => djangoRequest<Record<string, unknown>>('/api/account/profile'),
    updateProfile: (patch: Record<string, unknown>) =>
      djangoRequest<Record<string, unknown>>('/api/account/profile', { method: 'PATCH', body: patch }),
    tokens: () => djangoRequest<Record<string, unknown>[]>('/api/account/tokens'),
    issueToken: (name: string, ttlDays?: number) =>
      djangoRequest<Record<string, unknown>>('/api/account/tokens', {
        method: 'POST',
        body: { name, ttl_days: ttlDays },
      }),
  },

  notes: {
    list: (params: { page?: number; pageSize?: number; search?: string; tag?: string } = {}) => {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.pageSize) query.set('page_size', String(params.pageSize));
      if (params.search) query.set('search', params.search);
      if (params.tag) query.set('tag', params.tag);
      const suffix = query.toString();
      return djangoRequestWithMeta<NoteDto[]>(`/api/notes${suffix ? `?${suffix}` : ''}`);
    },
    create: (input: { title: string; body?: string }) =>
      djangoRequest<NoteDto>('/api/notes', { method: 'POST', body: input }),
    update: (id: number, patch: { title?: string; body?: string }) =>
      djangoRequest<NoteDto>(`/api/notes/${id}`, { method: 'PATCH', body: patch }),
    remove: (id: number) => djangoRequest<null>(`/api/notes/${id}`, { method: 'DELETE' }),
    history: (id: number) =>
      djangoRequest<{ versions: NoteVersionDto[]; comments: NoteCommentDto[] }>(`/api/notes/${id}/history`),
    versions: (id: number) => djangoRequest<NoteVersionDto[]>(`/api/notes/${id}/versions`),
    restore: (id: number, versionId: number) =>
      djangoRequest<NoteDto>(`/api/notes/${id}/versions/${versionId}/restore`, { method: 'POST' }),
    comments: (id: number) => djangoRequest<NoteCommentDto[]>(`/api/notes/${id}/comments`),
    addComment: (id: number, body: string, parentId?: number) =>
      djangoRequest<NoteCommentDto>(`/api/notes/${id}/comments`, {
        method: 'POST',
        body: { body, parent_id: parentId },
      }),
    backlinks: (id: number) =>
      djangoRequest<{ id: number; note_id: number; title: string }[]>(`/api/notes/${id}/backlinks`),
    link: (id: number, targetId: number) =>
      djangoRequest<{ id: number }>(`/api/notes/${id}/links`, { method: 'POST', body: { target_id: targetId } }),
    tags: () => djangoRequest<TagDto[]>('/api/tags'),
    attachTag: (id: number, tagId: number) =>
      djangoRequest<TagDto[]>(`/api/notes/${id}/tags`, { method: 'POST', body: { tag_id: tagId } }),
    detachTag: (id: number, tagId: number) =>
      djangoRequest<null>(`/api/notes/${id}/tags/${tagId}`, { method: 'DELETE' }),
  },

  planning: {
    tasks: (status?: string) =>
      djangoRequestWithMeta<TaskDto[]>(`/api/planning/tasks${status ? `?status=${status}` : ''}`),
    createTask: (input: { title: string; priority?: string; note_id?: number }) =>
      djangoRequest<TaskDto>('/api/planning/tasks', { method: 'POST', body: input }),
    updateTask: (id: number, patch: Record<string, unknown>) =>
      djangoRequest<TaskDto>(`/api/planning/tasks/${id}`, { method: 'PATCH', body: patch }),
    tickets: (status?: string) =>
      djangoRequestWithMeta<TicketDto[]>(`/api/planning/tickets${status ? `?status=${status}` : ''}`),
    createTicket: (input: { title: string; task_id?: number }) =>
      djangoRequest<TicketDto>('/api/planning/tickets', { method: 'POST', body: input }),
    study: () => djangoRequestWithMeta<StudyItemDto[]>('/api/planning/study'),
    reviewStudy: (id: number, correct: boolean) =>
      djangoRequest<StudyItemDto>(`/api/planning/study/${id}/review`, { method: 'POST', body: { correct } }),
  },

  files: {
    attachments: (noteId?: number) =>
      djangoRequestWithMeta<AttachmentDto[]>(`/api/knowledge/attachments${noteId ? `?note_id=${noteId}` : ''}`),
    createAttachment: (input: { filename: string; note_id?: number; content_type?: string; size_bytes?: number }) =>
      djangoRequest<AttachmentDto>('/api/knowledge/attachments', { method: 'POST', body: input }),
    requestExtraction: (id: number) =>
      djangoRequest<Record<string, unknown>>(`/api/knowledge/attachments/${id}/extraction`, { method: 'POST' }),
    extraction: (id: number) =>
      djangoRequest<Record<string, unknown>>(`/api/knowledge/attachments/${id}/extraction`),
  },

  search: {
    query: (params: { q?: string; type?: string; tag?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params.q) query.set('q', params.q);
      if (params.type) query.set('type', params.type);
      if (params.tag) query.set('tag', params.tag);
      if (params.limit) query.set('limit', String(params.limit));
      const suffix = query.toString();
      return djangoRequestWithMeta<SearchHitDto[]>(`/api/search${suffix ? `?${suffix}` : ''}`);
    },
    reindex: () => djangoRequest<Record<string, number>>('/api/search/reindex', { method: 'POST' }),
  },

  ai: {
    providers: () => djangoRequest<Record<string, unknown>[]>('/api/ai/providers'),
    createProvider: (input: { name: string; kind: string; api_key?: string; base_url?: string }) =>
      djangoRequest<Record<string, unknown>>('/api/ai/providers', { method: 'POST', body: input }),
    conversations: () => djangoRequestWithMeta<ConversationDto[]>('/api/ai/conversations'),
    createConversation: (input: { title?: string; agent_id?: number } = {}) =>
      djangoRequest<ConversationDto>('/api/ai/conversations', { method: 'POST', body: input }),
    messages: (id: number) => djangoRequest<{ id: number; role: string; content: string }[]>(`/api/ai/conversations/${id}/messages`),
    addMessage: (id: number, role: string, content: string) =>
      djangoRequest<Record<string, unknown>>(`/api/ai/conversations/${id}/messages`, {
        method: 'POST',
        body: { role, content },
      }),
    runs: (id: number) => djangoRequest<AiRunDto[]>(`/api/ai/conversations/${id}/runs`),
    startRun: (id: number) =>
      djangoRequest<AiRunDto>(`/api/ai/conversations/${id}/runs`, { method: 'POST', body: {} }),
  },

  integrations: {
    webhooks: () => djangoRequest<Record<string, unknown>[]>('/api/integrations/webhooks'),
    shares: () => djangoRequest<Record<string, unknown>[]>('/api/integrations/shares'),
    resolveShare: (token: string) =>
      djangoRequest<Record<string, unknown>>(`/api/integrations/shares/${token}/resolve`),
  },
} as const;
