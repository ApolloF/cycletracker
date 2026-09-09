import { createDatabase } from './db.js';
import { buildApp } from './app.js';
const db = await createDatabase(process.env.DATABASE_URL);
const app = await buildApp(db);
try { await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3100) }); }
catch (e) { await db.close(); throw e; }
console.log(`CycleTracker API listening on ${process.env.PORT ?? 3100}; ${process.env.DATABASE_URL ? 'PostgreSQL' : 'local embedded PostgreSQL (development only)'}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); await db.close(); process.exit(0); });
