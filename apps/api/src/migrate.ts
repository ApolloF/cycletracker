import { createDatabase } from './db.js';
const db = await createDatabase(process.env.DATABASE_URL); await db.close(); console.log('Database schema ready');
