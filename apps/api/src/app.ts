import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { fromNodeHeaders } from 'better-auth/node';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Database, SQL } from './db.js';
import { createAuth } from './auth.js';
import { administrationSchema, emptyProtocol, entrySchema, healthSchema, operationSchema, preferencesSchema, protocolSchema, occurrences, type Operation } from '../../../packages/domain/src/index.js';
import { catalog, CATALOG_VERSION } from '../../../packages/domain/src/catalog.js';
import { scenarioSchema } from '../../../packages/simulation/src/index.js';
import { previewImport } from '../../../packages/domain/src/import.js';

class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const fail = (code: number, message: string): never => { throw new HttpError(code, message); };
const uuid = z.string().uuid();
export async function buildApp(db: Database, options: { testSession?: (headers: Record<string, unknown>) => Promise<string | null> } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });
  const auth = createAuth(db);
  const origin = process.env.APP_URL ?? 'http://localhost:5173';
  const documentRoot = resolve(process.env.DOCUMENT_DIR ?? '.local/documents');
  await mkdir(documentRoot, { recursive: true });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(swagger, { openapi: { info: { title: 'CycleTracker API', version: '1.0.0' } } });
  app.setErrorHandler((error: any, _req, reply) => {
    if (error instanceof z.ZodError) return reply.code(422).send({ error: error.issues.map(x => x.message).join('; ') });
    if (error.code === '23505') return reply.code(409).send({ error: 'This occurrence or operation already exists. Refresh before retrying.' });
    const status = error.statusCode ?? 500;
    return reply.code(status).send({ error: status < 500 ? error.message : 'The operation could not be saved. Your draft is retained.' });
  });
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/config', async () => ({ google: !!process.env.GOOGLE_CLIENT_ID, apple: !!process.env.APPLE_CLIENT_ID, push: !!process.env.VAPID_PUBLIC_KEY, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null, supportEmail: process.env.SUPPORT_EMAIL ?? null, developmentMail: process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST }));
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', handler: async (request, reply) => {
    const headers = fromNodeHeaders(request.headers);
    const response = await auth.handler(new Request(new URL(request.url, origin), { method: request.method, headers, ...(request.method !== 'GET' ? { body: JSON.stringify(request.body) } : {}) }));
    reply.status(response.status);
    response.headers.forEach((value, key) => { if (key !== 'set-cookie') reply.header(key, value); });
    const cookies = response.headers.getSetCookie(); if (cookies.length) reply.header('set-cookie', cookies);
    return reply.send(await response.text());
  } });
  app.decorateRequest('owner', '');
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/v1')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin !== origin) fail(403, 'Request origin is not allowed');
    const owner = options.testSession ? await options.testSession(req.headers) : (await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))?.user.id;
    if (!owner) fail(401, 'Sign in to continue');
    (req as any).owner = owner;
    await db.query('INSERT INTO workspaces(owner_id,protocol,preferences) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [owner, emptyProtocol(), preferencesSchema.parse({})]);
  });
  const ownerOf = (req: any) => req.owner as string;
  app.get('/api/v1/openapi', async () => app.swagger());
  app.get('/api/v1/catalog', async () => ({ version: CATALOG_VERSION, entries: catalog }));
  app.get('/api/v1/workspace', async req => (await db.query('SELECT protocol,preferences,version FROM workspaces WHERE owner_id=$1', [ownerOf(req)])).rows[0]);
  app.put('/api/v1/workspace', async req => {
    const body = z.object({ expectedVersion: z.number().int().min(0), protocol: protocolSchema.optional(), preferences: preferencesSchema.optional() }).parse(req.body);
    return db.transaction(async tx => {
      const old = (await tx.query('SELECT * FROM workspaces WHERE owner_id=$1 FOR UPDATE', [ownerOf(req)])).rows[0];
      if (old.version !== body.expectedVersion) fail(409, 'Your plan changed on another device. Reload the saved version or copy your draft before retrying.');
      if (body.protocol && (body.protocol.activePhaseId !== old.protocol.activePhaseId || JSON.stringify(body.protocol.activations) !== JSON.stringify(old.protocol.activations))) fail(422, 'Use explicit phase activation to change the active phase');
      if (body.protocol) for (const phase of body.protocol.phases) for (const e of phase.entries) {
        const previous = old.protocol.phases.flatMap((p: any) => p.entries).find((x: any) => x.id === e.id);
        e.version = previous ? (JSON.stringify({ ...e, version: 0 }) === JSON.stringify({ ...previous, version: 0 }) ? previous.version : previous.version + 1) : 1;
      }
      const value = (await tx.query('UPDATE workspaces SET protocol=$2,preferences=$3,version=version+1 WHERE owner_id=$1 RETURNING protocol,preferences,version', [ownerOf(req), body.protocol ?? old.protocol, body.preferences ?? old.preferences])).rows[0];
      await tx.query('DELETE FROM reminder_jobs WHERE owner_id=$1 AND sent_at IS NULL', [ownerOf(req)]);
      return value;
    });
  });
  app.post('/api/v1/activate', async req => {
    const body = z.object({ phaseId: z.string().nullable(), expectedVersion: z.number().int(), at: z.string().datetime({ offset: true }) }).parse(req.body);
    if (Date.parse(body.at) > Date.now() + 60000) fail(422, 'Activation cannot be in the future');
    return db.transaction(async tx => {
      const row = (await tx.query('SELECT * FROM workspaces WHERE owner_id=$1 FOR UPDATE', [ownerOf(req)])).rows[0];
      if (row.version !== body.expectedVersion) fail(409, 'Plan changed; reload before activation');
      const p = protocolSchema.parse(row.protocol);
      if (body.phaseId && !p.phases.some(x => x.id === body.phaseId && !x.archived)) fail(422, 'Choose an available phase');
      const active = p.activations.at(-1);
      if (active && Date.parse(body.at) < Date.parse(active.at)) fail(422, 'Activation precedes the latest transition');
      if (active && !active.endedAt) active.endedAt = body.at;
      if (body.phaseId) p.activations.push({ phaseId: body.phaseId, at: body.at });
      p.activePhaseId = body.phaseId;
      await tx.query('DELETE FROM reminder_jobs WHERE owner_id=$1 AND sent_at IS NULL', [ownerOf(req)]);
      return (await tx.query('UPDATE workspaces SET protocol=$2,version=version+1 WHERE owner_id=$1 RETURNING protocol,preferences,version', [ownerOf(req), p])).rows[0];
    });
  });
  app.get('/api/v1/occurrences', async req => {
    const q = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).parse(req.query);
    const row = (await db.query('SELECT protocol FROM workspaces WHERE owner_id=$1', [ownerOf(req)])).rows[0];
    const phase = row.protocol.phases.find((x: any) => x.id === row.protocol.activePhaseId);
    const activation = row.protocol.activations.at(-1);
    return { items: phase ? occurrences(phase, q.from, q.to).filter(x => !activation || Date.parse(x.at) >= Date.parse(activation.at)) : [] };
  });
  async function saveOperation(tx: SQL, owner: string, op: Operation) {
    await tx.query('SELECT owner_id FROM workspaces WHERE owner_id=$1 FOR UPDATE', [owner]);
    const hash = createHash('sha256').update(JSON.stringify(op)).digest('hex');
    const existing = (await tx.query('SELECT hash,result FROM operations WHERE owner_id=$1 AND id=$2', [owner, op.operationId])).rows[0];
    if (existing) { if (existing.hash !== hash) fail(409, 'Operation ID was reused for different data'); return existing.result; }
    const old = (await tx.query('SELECT * FROM records WHERE id=$1 AND owner_id=$2 FOR UPDATE', [op.id, owner])).rows[0];
    if ((old?.version ?? 0) !== op.expectedVersion) fail(409, 'This record changed on another device. Your local edit is retained.');
    if (old && old.kind !== op.kind) fail(422, 'Record type cannot change');
    let data: any;
    if (op.kind === 'administration') data = administrationSchema.parse(op.data);
    else if (op.kind === 'health') {
      data = healthSchema.parse(op.data);
      if (data.documentId && !(await tx.query('SELECT id FROM documents WHERE id=$1 AND owner_id=$2', [data.documentId, owner])).rows.length) fail(404, 'Document not found');
    } else if (op.kind === 'scenario') {
      data = scenarioSchema.parse(op.data);
      if (data.model.scale.kind === 'absolute') fail(422, 'Absolute catalog models have not passed the release validation gate');
    } else data = z.object({ name: z.string().trim().min(1).max(150), route: z.string().min(1), notes: z.string().max(4000).default('') }).parse(op.data);
    const now = new Date().toISOString();
    const eventAt = data.at ?? now;
    if (old) await tx.query('INSERT INTO revisions(record_id,owner_id,version,data) VALUES ($1,$2,$3,$4)', [op.id, owner, old.version, old.data]);
    const result = { id: op.id, ownerId: owner, kind: op.kind, data, version: op.expectedVersion + 1, eventAt, updatedAt: now };
    if (old) await tx.query('UPDATE records SET data=$3,version=$4,event_at=$5,updated_at=$6 WHERE id=$1 AND owner_id=$2', [op.id, owner, data, result.version, eventAt, now]);
    else await tx.query('INSERT INTO records(id,owner_id,kind,data,version,event_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)', [op.id, owner, op.kind, data, result.version, eventAt, now]);
    await tx.query('INSERT INTO operations(owner_id,id,hash,result) VALUES($1,$2,$3,$4)', [owner, op.operationId, hash, result]);
    return result;
  }
  app.post('/api/v1/sync', async req => {
    const body = z.object({ owner: z.string().optional(), operations: z.array(operationSchema).min(1).max(100) }).parse(req.body);
    if (body.owner && body.owner !== ownerOf(req)) fail(409, 'Account changed; pending changes were not saved');
    const results = [];
    for (const op of body.operations) {
      try { results.push({ operationId: op.operationId, ok: true, record: await db.transaction(tx => saveOperation(tx, ownerOf(req), op)) }); }
      catch (e: any) { results.push({ operationId: op.operationId, ok: false, status: e.code === '23505' ? 409 : e.statusCode ?? (e instanceof z.ZodError ? 422 : 500), error: e instanceof z.ZodError ? e.issues.map(x => x.message).join('; ') : e.statusCode ? e.message : e.code === '23505' ? 'Occurrence already recorded' : 'Save failed; edit retained' }); }
    }
    return { results };
  });
  app.get('/api/v1/records', async req => {
    const q = z.object({ kind: z.enum(['administration', 'health', 'scenario', 'compound']).optional(), cursor: z.string().optional(), from: z.string().optional(), to: z.string().optional(), search: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }).parse(req.query);
    const params: unknown[] = [ownerOf(req)]; const conditions = ['owner_id=$1'];
    const bind = (v: unknown) => { params.push(v); return `$${params.length}`; };
    if (q.kind) conditions.push(`kind=${bind(q.kind)}`);
    if (q.from) conditions.push(`event_at>=${bind(z.string().datetime({ offset: true }).parse(q.from))}`);
    if (q.to) conditions.push(`event_at<${bind(z.string().datetime({ offset: true }).parse(q.to))}`);
    if (q.search) conditions.push(`data::text ILIKE ${bind('%' + q.search.replaceAll('%', '\\%').replaceAll('_', '\\_') + '%')}`);
    if (q.cursor) { const c = z.object({ at: z.string().datetime(), id: z.string() }).parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString())); conditions.push(`(event_at,id)<(${bind(c.at)},${bind(c.id)})`); }
    const rows = (await db.query(`SELECT id,kind,data,version,event_at AS "eventAt",updated_at AS "updatedAt" FROM records WHERE ${conditions.join(' AND ')} ORDER BY event_at DESC,id DESC LIMIT ${bind(q.limit + 1)}`, params)).rows;
    const more = rows.length > q.limit; const items = rows.slice(0, q.limit); const last = items.at(-1);
    return { items, nextCursor: more && last ? Buffer.from(JSON.stringify({ at: new Date(last.eventAt).toISOString(), id: last.id })).toString('base64url') : null };
  });
  app.get('/api/v1/records/:id/revisions', async req => ({ items: (await db.query('SELECT version,data,created_at FROM revisions WHERE record_id=$1 AND owner_id=$2 ORDER BY version DESC', [uuid.parse((req.params as any).id), ownerOf(req)])).rows }));
  app.post('/api/v1/import/preview', async req => {
    const keys = (await db.query('SELECT source_id FROM import_keys WHERE owner_id=$1', [ownerOf(req)])).rows.map(r => r.source_id);
    return previewImport(req.body, keys);
  });
  app.post('/api/v1/import/apply', async req => {
    const body = z.object({ confirmed: z.literal(true), expectedVersion: z.number().int(), records: z.array(z.object({ sourceId: z.string().min(1).max(200), kind: z.enum(['administration', 'health']), data: z.unknown() })).max(1000), protocol: protocolSchema.nullable().optional() }).parse(req.body);
    return db.transaction(async tx => {
      const ws = (await tx.query('SELECT * FROM workspaces WHERE owner_id=$1 FOR UPDATE', [ownerOf(req)])).rows[0];
      if (ws.version !== body.expectedVersion) fail(409, 'Workspace changed. Preview the import again.');
      let imported = 0, duplicates = 0;
      for (const record of body.records) {
        if ((await tx.query('SELECT source_id FROM import_keys WHERE owner_id=$1 AND source_id=$2', [ownerOf(req), record.sourceId])).rows.length) { duplicates++; continue; }
        const id = randomUUID();
        await saveOperation(tx, ownerOf(req), { id, operationId: randomUUID(), kind: record.kind, expectedVersion: 0, data: record.data });
        await tx.query('INSERT INTO import_keys(owner_id,source_id,record_id) VALUES($1,$2,$3)', [ownerOf(req), record.sourceId, id]); imported++;
      }
      if (body.protocol) {
        const current = protocolSchema.parse(ws.protocol);
        const drafts = body.protocol.phases.map(p => ({ ...p, id: randomUUID(), entries: p.entries.map(e => ({ ...e, id: randomUUID(), version: 1 })) }));
        const merged = protocolSchema.parse({ ...current, phases: [...current.phases, ...drafts] });
        await tx.query('UPDATE workspaces SET protocol=$2,version=version+1 WHERE owner_id=$1', [ownerOf(req), merged]);
      }
      return { imported, duplicates, drafts: body.protocol?.phases.length ?? 0 };
    });
  });
  app.delete('/api/v1/records/:id', async req => {
    const id = uuid.parse((req.params as any).id); const b = z.object({ expectedVersion: z.number().int() }).parse(req.body);
    const row = (await db.query('SELECT * FROM records WHERE id=$1 AND owner_id=$2', [id, ownerOf(req)])).rows[0];
    if (!row) fail(404, 'Record not found');
    if (row.kind === 'administration') return db.transaction(tx => saveOperation(tx, ownerOf(req), { id, operationId: randomUUID(), expectedVersion: b.expectedVersion, kind: 'administration', data: { ...row.data, status: 'retracted' } }));
    if (row.version !== b.expectedVersion) fail(409, 'Record changed; reload first');
    await db.query('DELETE FROM records WHERE id=$1 AND owner_id=$2 AND version=$3', [id, ownerOf(req), b.expectedVersion]); return { deleted: true };
  });
  app.post('/api/v1/documents', async req => {
    const file = await req.file(); if (!file) throw new HttpError(422, 'Choose a PDF');
    const buffer = await file.toBuffer(); if (file.mimetype !== 'application/pdf' || buffer.subarray(0, 5).toString() !== '%PDF-') fail(422, 'Only PDF reports are accepted');
    const id = randomUUID(); const path = resolve(documentRoot, `${id}.pdf`);
    await writeFile(path, buffer, { flag: 'wx' });
    try { await db.query('INSERT INTO documents(id,owner_id,name,path,bytes) VALUES($1,$2,$3,$4,$5)', [id, ownerOf(req), file.filename.slice(0, 200), path, buffer.length]); }
    catch (e) { await unlink(path); throw e; }
    return { id, name: file.filename };
  });
  app.get('/api/v1/documents/:id', async (req, reply) => {
    const row = (await db.query('SELECT * FROM documents WHERE id=$1 AND owner_id=$2', [uuid.parse((req.params as any).id), ownerOf(req)])).rows[0];
    if (!row) fail(404, 'Document not found');
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="report.pdf"`).header('X-Content-Type-Options', 'nosniff');
    return readFile(row.path);
  });
  app.get('/api/v1/export', async req => ({ format: 'cycletracker-1', exportedAt: new Date().toISOString(), workspace: (await db.query('SELECT protocol,preferences,version FROM workspaces WHERE owner_id=$1', [ownerOf(req)])).rows[0], records: (await db.query('SELECT id,kind,data,version,event_at FROM records WHERE owner_id=$1 ORDER BY event_at,id', [ownerOf(req)])).rows, documents: (await db.query('SELECT id,name,bytes FROM documents WHERE owner_id=$1', [ownerOf(req)])).rows, attachmentNotice: 'PDF bytes are separate authenticated downloads. Preserve them alongside this export.' }));
  app.get('/api/v1/sessions', async req => auth.api.listSessions({ headers: fromNodeHeaders(req.headers) }));
  app.post('/api/v1/push', async req => {
    const b = z.object({ endpoint: z.string().url().startsWith('https://'), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
    // Restrict endpoints to known browser push services; never accept arbitrary server-side request targets.
    const host = new URL(b.endpoint).hostname;
    if (!['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].some(h => host === h || host.endsWith('.' + h))) fail(422, 'Unsupported push service');
    const id = createHash('sha256').update(ownerOf(req) + b.endpoint).digest('hex');
    await db.query('INSERT INTO push_subscriptions(id,owner_id,subscription) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET subscription=$3', [id, ownerOf(req), b]); return { saved: true };
  });
  app.delete('/api/v1/account', async req => {
    z.object({ confirmation: z.literal('DELETE') }).parse(req.body);
    const files = (await db.query('SELECT path FROM documents WHERE owner_id=$1', [ownerOf(req)])).rows;
    // Delete file bytes first so a storage failure cannot silently orphan private documents.
    for (const f of files) await unlink(f.path).catch((e: any) => { if (e.code !== 'ENOENT') throw e; });
    await db.query('DELETE FROM "user" WHERE id=$1', [ownerOf(req)]); return { deleted: true };
  });
  return app;
}
