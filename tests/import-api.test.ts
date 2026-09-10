import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, type Database } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import type { FastifyInstance } from 'fastify';
let db: Database, app: FastifyInstance;
const headers = (owner = 'alice') => ({ 'x-test-user': owner, origin: 'http://localhost:5173' });
beforeAll(async () => {
  db = await createDatabase(undefined, true);
  for (const name of ['alice', 'bob']) await db.query('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())', [name, `${name}@example.test`]);
  app = await buildApp(db, { testSession: async h => typeof h['x-test-user'] === 'string' ? h['x-test-user'] : null });
});
afterAll(async () => { await app?.close(); await db?.close(); });
const record = (id: string) => ({ sourceId: id, kind: 'health', data: { kind: 'note', title: 'Synthetic import', at: '2026-01-01T12:00:00Z', importSource: { sourceId: id, format: 'cycle-dashboard', raw: { notes: 'Original synthetic note' } } } });
it('replays a lost import response without duplicating phases, with account-scoped keys', async () => {
  const payload = { operationId: randomUUID(), confirmed: true, expectedVersion: 0, records: [record('source-1')], protocol: { phases: [{ id: 'phase', name: 'Imported phase', entries: [] }], activePhaseId: 'phase', activations: [] } };
  const send = (body = payload, owner = 'alice') => app.inject({ method: 'POST', url: '/api/v1/import/apply', headers: headers(owner), payload: body });
  const first = await send(); expect(first.statusCode).toBe(200);
  expect((await send()).json()).toEqual(first.json());
  expect((await send({ ...payload, expectedVersion: 1 })).statusCode).toBe(409);
  const ws = (await app.inject({ url: '/api/v1/workspace', headers: headers() })).json();
  expect(ws.protocol.phases).toHaveLength(1); expect(ws.protocol.activePhaseId).toBe(null);
  expect((await send(payload, 'bob')).statusCode).toBe(200);
  const exported = (await app.inject({ url: '/api/v1/export', headers: headers() })).json();
  expect(exported.records).toHaveLength(1);
  expect(exported.records[0].data.importSource.raw.notes).toBe('Original synthetic note');
  const edited = await app.inject({ method: 'POST', url: '/api/v1/sync', headers: headers(), payload: { operations: [{ id: exported.records[0].id, operationId: randomUUID(), expectedVersion: 1, kind: 'health', data: { kind: 'note', title: 'Edited title', at: '2026-01-01T12:00:00Z' } }] } });
  expect(edited.json().results[0].record.data.importSource.raw.notes).toBe('Original synthetic note');
});
it('rolls back the whole import when any record is invalid', async () => {
  const payload = { operationId: randomUUID(), confirmed: true, expectedVersion: 1, records: [record('rollback-source'), { sourceId: 'invalid', kind: 'health', data: {} }] };
  expect((await app.inject({ method: 'POST', url: '/api/v1/import/apply', headers: headers(), payload })).statusCode).toBe(422);
  expect((await db.query('SELECT * FROM import_keys WHERE source_id=$1', ['rollback-source'])).rows).toEqual([]);
  expect((await db.query('SELECT * FROM import_batches WHERE id=$1', [payload.operationId])).rows).toEqual([]);
});
