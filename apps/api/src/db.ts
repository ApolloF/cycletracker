import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleLite } from 'drizzle-orm/pglite';
import { readFile, mkdir, readdir, chmod, stat, open, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import * as schema from './schema.js';
try { process.loadEnvFile(); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
export interface SQL { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, any>[] }>; }
export interface Database extends SQL { orm: any; transaction<T>(fn: (db: SQL) => Promise<T>): Promise<T>; close(): Promise<void>; }
export async function createDatabase(url?: string, memory = false): Promise<Database> {
  const migration = await readFile(new URL('../migrations/0001.sql', import.meta.url), 'utf8');
  if (url) {
    const pool = new Pool({ connectionString: url });
    await pool.query(migration);
    return { orm: drizzlePg(pool, { schema }), query: (s, p) => pool.query(s, p), close: () => pool.end(), transaction: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
      catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } };
  }
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
  const localRoot = resolve('.local');
  const databasePath = resolve(process.env.LOCAL_DATABASE_PATH ?? '.local/postgres');
  if (!databasePath.startsWith(localRoot + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Embedded development databases must be inside .local');
  const lockPath = `${databasePath}.lock`;
  let release = async () => {};
  if (!memory) {
    await mkdir(dirname(databasePath), { recursive: true });
    try {
      const owner = Number(await readFile(lockPath, 'utf8'));
      if (!Number.isSafeInteger(owner) || owner < 1) throw new Error('Invalid development database lock; inspect it before restarting');
      try { process.kill(owner, 0); throw new Error(`Development database is already open by process ${owner}`); }
      catch (e: any) { if (e.code !== 'ESRCH') throw e; await unlink(lockPath); }
    } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    const lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); await lock.close();
    release = async () => { await unlink(lockPath).catch((e: any) => { if (e.code !== 'ENOENT') throw e; }); };
  }
  // Windows directory ReadOnly attributes are ignored by native writes but not by the WASM VFS.
  // Restrict normalization to this generated development database, never production storage.
  if (!memory && process.platform === 'win32') {
    const writableDirectories = async (path: string): Promise<void> => {
      try { const info = await stat(path); if (!(info.mode & 0o200)) await chmod(path, 0o700); }
      catch (e: any) { if (e.code === 'ENOENT') return; throw e; }
      for (const item of await readdir(path, { withFileTypes: true })) if (item.isDirectory()) await writableDirectories(join(path, item.name));
    };
    await writableDirectories(databasePath);
  }
  const lite = new PGlite(memory ? undefined : databasePath);
  try { await lite.exec(migration); } catch (e) { await release(); throw e; }
  return { orm: drizzleLite(lite, { schema }), query: (s, p) => lite.query(s, p), close: async () => { await lite.close(); await release(); }, transaction: fn => lite.transaction(tx => fn({ query: (s, p) => tx.query(s, p) })) };
}
