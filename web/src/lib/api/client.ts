// Tsumii API 客户端（对应 api/ 中的 FastAPI 服务，前缀 /api/v1）。
// 前端目前以 localStorage 作为 MVP 存储；迁移到服务器存储时，store 中的各个 action 改为调用这里的函数即可。

import type { DesignIdea, DesignVariant, ItemType, ParsedBrief, Strand } from '../types';

export interface Task<R = unknown> {
  id: string;
  kind: 'ideas' | 'image-convert';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: R | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ServerPattern {
  id: string;
  beadType: string;
  layoutType: string;
  width: number;
  height: number;
  cells: string[];
  /** 项链主链 */
  strand?: Strand | null;
  version: number;
  revision: number;
  validationErrors: string[];
}

export interface ServerProject {
  id: string;
  name: string;
  description: string;
  creationMode: 'image' | 'ai';
  status: 'draft' | 'editing' | 'exported' | 'purchasing';
  itemType: ItemType;
  createdAt: string;
  updatedAt: string;
  exportedAt: string | null;
  idea: DesignIdea | null;
  pattern: ServerPattern | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : ((detail as { message?: string })?.message ?? `HTTP ${status}`));
  }
}

export interface ClientOptions {
  baseUrl: string;
  userId?: string;
  fetchImpl?: typeof fetch;
}

export function createClient({ baseUrl, userId, fetchImpl = fetch }: ClientOptions) {
  const root = baseUrl.replace(/\/$/, '') + '/api/v1';
  const headers = (extra?: HeadersInit): HeadersInit => ({ ...(userId ? { 'X-User-Id': userId } : {}), ...extra });

  async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(root + path, {
      method,
      headers: headers(body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' }),
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.detail ?? data);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  async function waitTask<R>(task: Task<R>, { intervalMs = 800, timeoutMs = 120_000 } = {}): Promise<R> {
    const started = Date.now();
    let t = task;
    while (t.status === 'queued' || t.status === 'running') {
      if (Date.now() - started > timeoutMs) throw new Error('任务超时');
      await new Promise((r) => setTimeout(r, intervalMs));
      t = await req<Task<R>>('GET', `/tasks/${t.id}`);
    }
    if (t.status === 'failed') throw new Error(t.error ?? '任务失败');
    return t.result as R;
  }

  return {
    waitTask,
    catalog: () => req<{ verified: boolean; colors: unknown[] }>('GET', '/catalog'),
    parse: (prompt: string) => req<ParsedBrief>('POST', '/ai/parse', { prompt }),
    async generateIdeas(prompt: string, count = 4, brief?: Partial<ParsedBrief>) {
      const task = await req<Task<{ brief: ParsedBrief; ideas: DesignIdea[] }>>('POST', '/ai/ideas', { prompt, count, brief });
      return waitTask(task);
    },
    refine: (ideaId: string, instruction: string, parentVariantId?: string) =>
      req<DesignVariant & { notes: string[] }>('POST', `/ai/ideas/${ideaId}/refine`, { instruction, parentVariantId }),
    async uploadImage(file: Blob, filename = 'image') {
      const fd = new FormData();
      fd.append('file', file, filename);
      return req<{ id: string; width: number; height: number }>('POST', '/images', fd);
    },
    async convertImage(assetId: string, options: Record<string, unknown>) {
      const task = await req<Task<{ width: number; height: number; cells: string[]; projectId?: string }>>('POST', `/images/${assetId}/convert`, options);
      return waitTask(task);
    },
    listProjects: () => req<unknown[]>('GET', '/projects'),
    getProject: (id: string) => req<ServerProject>('GET', `/projects/${id}`),
    createProject: (p: { name: string; itemType: ItemType; creationMode: 'image' | 'ai'; width: number; height: number; cells: string[]; strand?: Strand; description?: string }) =>
      req<ServerProject>('POST', '/projects', p),
    createFromIdea: (ideaId: string, variantId?: string, name?: string) => req<ServerProject>('POST', '/projects/from-idea', { ideaId, variantId, name }),
    deleteProject: (id: string) => req<void>('DELETE', `/projects/${id}`),
    // strand 不传时后端保留原串链，传 null 删除串链
    savePattern: (id: string, width: number, height: number, cells: string[], baseRevision?: number, strand?: Strand | null) =>
      req<ServerPattern>('PUT', `/projects/${id}/pattern`, { width, height, cells, baseRevision, strand }),
    localEdit: (id: string, rect: { x: number; y: number; w: number; h: number }, instruction: string) =>
      req<{ summary: string; pattern: ServerPattern }>('POST', `/projects/${id}/pattern/local-edit`, { rect, instruction }),
    saveVersion: (id: string, note: string) => req<unknown>('POST', `/projects/${id}/versions`, { note }),
    restoreVersion: (id: string, version: number) => req<ServerPattern>('POST', `/projects/${id}/versions/${version}/restore`),
    materials: (id: string, wastage?: number) => req<unknown>('GET', `/projects/${id}/materials${wastage === undefined ? '' : `?wastage=${wastage}`}`),
    toggleShopping: (id: string, kind: 'bought' | 'outOfStock' | 'confirmed', itemId: string, value: boolean) =>
      req<unknown>('PATCH', `/projects/${id}/shopping-list`, { toggle: { kind, itemId, value } }),
    exportUrl: (id: string, fmt: 'png' | 'svg' | 'pdf' | 'csv' | 'xlsx' | 'json') => `${root}/projects/${id}/export/${fmt}`,
  };
}

export type TsumiiClient = ReturnType<typeof createClient>;
