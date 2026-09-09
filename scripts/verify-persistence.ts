import { createDatabase } from '../apps/api/src/db.js';
process.env.LOCAL_DATABASE_PATH = `.local/persistence-check-${Date.now()}`;
const db = await createDatabase();
await db.query('CREATE TABLE persistence_check (value text)');
await db.query('INSERT INTO persistence_check(value) VALUES($1)', ['synthetic-persistence-fixture']);
let locked = false;
try { await createDatabase(); } catch (e: any) { locked = e.message.includes('already open'); }
if (!locked) throw new Error('Second connection was not blocked');
await db.close();
const reopened = await createDatabase();
const result = (await reopened.query('SELECT value FROM persistence_check')).rows[0];
if (result.value !== 'synthetic-persistence-fixture') throw new Error('Persistence check failed');
await reopened.close();
console.log('Development database reopens with data intact; concurrent process lock verified.');
