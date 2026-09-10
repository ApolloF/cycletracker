import Dexie, { type Table } from 'dexie';
import type { Operation, Protocol, Preferences } from '../../../packages/domain/src/index.js';
export type SavedRecord = { id: string; kind: Operation['kind']; data: any; version: number; eventAt: string; pending?: boolean };
export type Workspace = { protocol: Protocol; preferences: Preferences; version: number };
export type Queue = { operationId: string; owner: string; operation: Operation; queuedAt: number; error?: string };
class OfflineStore extends Dexie {
  cache!: Table<{ key: string; owner: string; value: any }, string>;
  queue!: Table<Queue, string>;
  constructor() {
    super('cycletracker-private-v1');
    this.version(1).stores({ cache: 'key,owner', queue: 'operationId,owner' });
    this.version(2).stores({ cache: 'key,owner', queue: 'operationId,owner' }).upgrade(async tx => {
      // Old queues had no creation order. Recover revision order per record.
      const rows = await tx.table('queue').toArray();
      rows.sort((a, b) => a.operation.id.localeCompare(b.operation.id) || a.operation.expectedVersion - b.operation.expectedVersion);
      for (const [index, row] of rows.entries()) await tx.table('queue').put({ ...row, queuedAt: index });
    });
  }
}
export const local = new OfflineStore();
export function cachedUser(): { id: string; name: string; email: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem('cycletracker-active-user') ?? 'null');
    return value && ['id', 'name', 'email'].every(key => typeof value[key] === 'string') ? value : null;
  } catch { return null; }
}
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = path.startsWith('/api/') ? path : `/api/v1${path}`;
  const owner = cachedUser()?.id;
  const response = await fetch(url, { ...init, credentials: 'same-origin', headers: { ...(!(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(url.startsWith('/api/v1/') && owner ? { 'X-Workspace-Owner': owner } : {}), ...init.headers } });
  const text = await response.text();
  let data: any; try { data = text ? JSON.parse(text) : null; } catch { throw new Error('The server returned an invalid response. Try again.'); }
  if (!response.ok) throw new Error(data?.error?.message ?? data?.error ?? data?.message ?? `Server unavailable (${response.status}). Try again.`); return data;
}
export const post = <T = any>(path: string, data: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(data) });
export async function readCached<T>(owner: string, key: string, request: () => Promise<T>): Promise<T> {
  if (cachedUser()?.id !== owner) throw new Error('Account changed. Reload before continuing.');
  if (!navigator.onLine) {
    const cached = await local.cache.get(`${owner}:${key}`);
    if (cached) return cached.value;
    throw new Error('No saved copy on this device. Connect to load it.');
  }
  try { const value = await request(); if (cachedUser()?.id !== owner) throw new Error('Account changed. Reload before continuing.'); await local.cache.put({ key: `${owner}:${key}`, owner, value }); return value; }
  catch (error) { if (navigator.onLine || cachedUser()?.id !== owner) throw error; const cached = await local.cache.get(`${owner}:${key}`); if (cached) return cached.value; throw error; }
}
export async function enqueue(owner: string, operation: Operation) {
  await local.transaction('rw', local.queue, async () => {
    const existing = await local.queue.get(operation.operationId);
    if (existing) {
      if (existing.owner !== owner || JSON.stringify(existing.operation) !== JSON.stringify(operation)) throw new Error('Pending operation ID already used');
      return;
    }
    const rows = await local.queue.where('owner').equals(owner).toArray();
    const queuedAt = Math.max(Date.now(), ...rows.map(row => row.queuedAt + 1));
    await local.queue.add({ operationId: operation.operationId, owner, operation, queuedAt });
  });
}
export async function pendingChanges(owner: string) {
  return (await local.queue.where('owner').equals(owner).toArray()).sort((a, b) => a.queuedAt - b.queuedAt);
}
export async function discardRecordDraft(owner: string, operationId: string) {
  const discard = () => local.transaction('rw', local.queue, async () => {
    const selected = await local.queue.get(operationId);
    if (!selected || selected.owner !== owner || !selected.error) throw new Error('Refresh pending changes before discarding this draft');
    const rows = await local.queue.where('owner').equals(owner).toArray();
    await local.queue.bulkDelete(rows.filter(row => row.operation.id === selected.operation.id).map(row => row.operationId));
  });
  if (navigator.locks) await navigator.locks.request(`cycletracker-sync:${owner}`, discard);
  else await discard();
}
const syncing = new Map<string, Promise<void>>();
export function synchronize(owner: string): Promise<void> {
  const active = syncing.get(owner);
  if (active) return active.then(() => synchronize(owner));
  const drain = async () => {
    while (navigator.onLine) {
      const item = (await pendingChanges(owner))[0];
      if (!item) return;
      const session = await api('/api/auth/get-session');
      if (session?.user?.id !== owner) throw new Error('Sign in to the account that owns these pending changes');
      const response = await post('/sync', { owner, operations: [item.operation] }); const result = response.results[0];
      if (!result.ok) { await local.queue.update(item.operationId, { error: result.error }); throw new Error(result.error); }
      await local.queue.delete(item.operationId);
    }
  };
  const run = (async () => { if (navigator.locks) await navigator.locks.request(`cycletracker-sync:${owner}`, drain); else await drain(); })()
    .finally(() => { syncing.delete(owner); });
  syncing.set(owner, run);
  return run;
}
export function download(name: string, value: unknown, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
