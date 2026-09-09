import Dexie, { type Table } from 'dexie';
import type { Operation, Protocol, Preferences } from '../../../packages/domain/src/index.js';
export type SavedRecord = { id: string; kind: Operation['kind']; data: any; version: number; eventAt: string; pending?: boolean };
export type Workspace = { protocol: Protocol; preferences: Preferences; version: number };
type Queue = { operationId: string; owner: string; operation: Operation; error?: string };
class OfflineStore extends Dexie {
  cache!: Table<{ key: string; owner: string; value: any }, string>;
  queue!: Table<Queue, string>;
  constructor() { super('cycletracker-private-v1'); this.version(1).stores({ cache: 'key,owner', queue: 'operationId,owner' }); }
}
export const local = new OfflineStore();
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path.startsWith('/api/') ? path : `/api/v1${path}`, { ...init, credentials: 'same-origin', headers: { ...(!(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const text = await response.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { throw new Error('The server returned an invalid response. Try again.'); }
  if (!response.ok) throw new Error(data?.error?.message ?? data?.error ?? data?.message ?? `Server unavailable (${response.status}). Try again.`); return data;
}
export const post = <T = any>(path: string, data: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(data) });
export async function readCached<T>(owner: string, key: string, request: () => Promise<T>): Promise<T> {
  try { const value = await request(); await local.cache.put({ key: `${owner}:${key}`, owner, value }); return value; }
  catch (error) { if (navigator.onLine) throw error; const cached = await local.cache.get(`${owner}:${key}`); if (cached) return cached.value; throw error; }
}
export async function enqueue(owner: string, operation: Operation) {
  await local.queue.put({ operationId: operation.operationId, owner, operation });
}
let syncing: Promise<void> | null = null;
export function synchronize(owner: string): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!navigator.onLine) return;
    const session = await api('/api/auth/get-session');
    if (session?.user?.id !== owner) throw new Error('Sign in to the account that owns these pending changes');
    const queue = await local.queue.where('owner').equals(owner).toArray();
    // Preserve ordering and stop at conflicts so later revisions cannot skip a failed edit.
    for (const item of queue) {
      const response = await post('/sync', { operations: [item.operation] }); const result = response.results[0];
      if (!result.ok) { await local.queue.update(item.operationId, { error: result.error }); throw new Error(result.error); }
      await local.queue.delete(item.operationId);
    }
  })().finally(() => { syncing = null; });
  return syncing;
}
export function download(name: string, value: unknown, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
