import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase, type Database } from '../apps/api/src/db.js';
import { buildApp } from '../apps/api/src/app.js';
import { entry } from './domain.test.js';
import type { FastifyInstance } from 'fastify';
let db: Database, app: FastifyInstance;
const origin = 'http://localhost:5173';
const headers = (user = 'alice') => ({ 'x-test-user': user, origin });
const administration = () => ({ occurrenceId: 'occurrence-test', phaseId: null, entryId: 'e', at: '2026-09-09T08:00:00Z', status: 'taken', snapshot: entry(), amount: { value: 10, unit: 'mg' } });
beforeAll(async () => {
  db = await createDatabase(undefined, true);
  for (const name of ['alice', 'bob']) await db.query('INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())', [name, `${name}@example.test`]);
  app = await buildApp(db, { testSession: async h => typeof h['x-test-user'] === 'string' ? h['x-test-user'] : null });
  await app.ready();
});
afterAll(async () => { await app?.close(); await db?.close(); });
describe('tenant isolation and transactional writes', () => {
  it('rejects unauthenticated reads and wrong-origin writes', async () => {
    expect((await app.inject('/api/v1/records')).statusCode).toBe(401);
    for (const url of ['/api/v1/workspace', '/api/v1/records', '/api/v1/export']) {
      expect((await app.inject({ url, headers: { ...headers('bob'), 'x-workspace-owner': 'alice' } })).statusCode).toBe(409);
    }
    expect((await app.inject({ method: 'PUT', url: '/api/v1/workspace', headers: { 'x-test-user': 'alice', origin: 'https://evil.example' }, payload: {} })).statusCode).toBe(403);
    const op = { id: randomUUID(), operationId: randomUUID(), kind: 'health', expectedVersion: 0, data: { kind: 'note', title: 'Draft', at: new Date().toISOString() } };
    expect((await app.inject({ method: 'POST', url: '/api/v1/sync', headers: headers('bob'), payload: { owner: 'alice', operations: [op] } })).statusCode).toBe(409);
  });
  it('isolates records, prevents duplicated retries and rejects idempotency-key reuse', async () => {
    const op = { id: randomUUID(), operationId: randomUUID(), kind: 'administration', expectedVersion: 0, data: administration() };
    const save = (o: any, user = 'alice') => app.inject({ method: 'POST', url: '/api/v1/sync', headers: headers(user), payload: { operations: [o] } });
    const first = (await save(op)).json(); expect(first.results[0].ok).toBe(true);
    const repeat = (await save(op)).json(); expect(repeat).toEqual(first);
    const changed = (await save({ ...op, data: { ...op.data, amount: { value: 20, unit: 'mg' } } })).json(); expect(changed.results[0].status).toBe(409);
    const alice = (await app.inject({ url: '/api/v1/records', headers: headers() })).json(); expect(alice.items).toHaveLength(1);
    const bob = (await app.inject({ url: '/api/v1/records', headers: headers('bob') })).json(); expect(bob.items).toHaveLength(0);
    const hostile = (await save({ ...op, operationId: randomUUID(), expectedVersion: 1 }, 'bob')).json(); expect(hostile.results[0].ok).toBe(false);
    const duplicate = (await save({ ...op, operationId: randomUUID(), id: randomUUID() })).json(); expect(duplicate.results[0].status).toBe(409);
    const edited = (await save({ ...op, operationId: randomUUID(), expectedVersion: 1, data: { ...op.data, amount: { value: 15, unit: 'mg' } } })).json(); expect(edited.results[0].record.version).toBe(2);
    const revision = (await app.inject({ url: `/api/v1/records/${op.id}/revisions`, headers: headers() })).json(); expect(revision.items[0].data.amount.value).toBe(10);
    expect((await app.inject({ url: `/api/v1/records/${op.id}/revisions`, headers: headers('bob') })).json().items).toEqual([]);
    const undo = (await save({ ...op, operationId: randomUUID(), expectedVersion: 2, data: { ...op.data, status: 'retracted' } })).json(); expect(undo.results[0].ok).toBe(true);
    const replacement = (await save({ ...op, operationId: randomUUID(), id: randomUUID() })).json(); expect(replacement.results[0].ok).toBe(true);
  });
  it('uses explicit activation and rejects concurrent plan saves', async () => {
    const initial = (await app.inject({ url: '/api/v1/workspace', headers: headers() })).json();
    const protocol = { phases: [{ id: 'p', name: 'Routine', entries: [entry()] }], activePhaseId: null, activations: [] };
    const write = await app.inject({ method: 'PUT', url: '/api/v1/workspace', headers: headers(), payload: { protocol, expectedVersion: initial.version } }); expect(write.statusCode).toBe(200);
    expect(write.json().protocol.activePhaseId).toBe(null);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/workspace', headers: headers(), payload: { protocol, expectedVersion: initial.version } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/workspace', headers: headers(), payload: { protocol: { ...protocol, activePhaseId: 'p' }, expectedVersion: write.json().version } })).statusCode).toBe(422);
    const activated = await app.inject({ method: 'POST', url: '/api/v1/activate', headers: headers(), payload: { phaseId: 'p', expectedVersion: write.json().version, at: '2026-03-01T00:00:00Z' } }); expect(activated.json().protocol.activePhaseId).toBe('p');
  });
  it('denies foreign documents, exports and deletions', async () => {
    const id = randomUUID(); await db.query('INSERT INTO documents(id,owner_id,name,path,bytes) VALUES($1,$2,$3,$4,$5)', [id, 'alice', 'test.pdf', '/nonexistent-fixture', 1]);
    expect((await app.inject({ url: `/api/v1/documents/${id}`, headers: headers('bob') })).statusCode).toBe(404);
    const exp = (await app.inject({ url: '/api/v1/export?owner=alice', headers: headers('bob') })).json(); expect(exp.records).toEqual([]); expect(exp.documents).toEqual([]);
    const op = { id: randomUUID(), operationId: randomUUID(), kind: 'health', expectedVersion: 0, data: { kind: 'lab', title: 'Lab', at: new Date().toISOString(), documentId: id } };
    const attach = (await app.inject({ method: 'POST', url: '/api/v1/sync', headers: headers('bob'), payload: { operations: [op] } })).json(); expect(attach.results[0].status).toBe(404);
  });
});
