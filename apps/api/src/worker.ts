import webpush from 'web-push';
import { createDatabase } from './db.js';
import { occurrences, protocolSchema, preferencesSchema } from '../../../packages/domain/src/index.js';
const db = await createDatabase(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) throw new Error('The reminder worker requires PostgreSQL; do not share an embedded development database across processes');
const enabled = !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && !!process.env.VAPID_SUBJECT;
if (enabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
let running = false;
async function tick() {
  if (running || !enabled) return; running = true;
  try {
    const workspaces = (await db.query('SELECT * FROM workspaces WHERE preferences->>\'remindersEnabled\'=\'true\'')).rows;
    for (const ws of workspaces) {
      const protocol = protocolSchema.parse(ws.protocol); const prefs = preferencesSchema.parse(ws.preferences); const phase = protocol.phases.find(p => p.id === protocol.activePhaseId); if (!phase) continue;
      const activation = protocol.activations.at(-1);
      const now = Date.now(); const list = occurrences(phase, new Date(now - 5 * 60000).toISOString(), new Date(now + 24 * 36e5).toISOString()).filter(o => !activation || Date.parse(o.at) >= Date.parse(activation.at));
      for (const o of list) {
        const id = `${ws.owner_id}:${o.id}`;
        await db.query('INSERT INTO reminder_jobs(id,owner_id,occurrence_id,due_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, ws.owner_id, o.id, o.at]);
        if (Date.parse(o.at) > now) continue;
        const job = (await db.query('SELECT * FROM reminder_jobs WHERE id=$1', [id])).rows[0];
        if (job.sent_at || (job.snoozed_until && new Date(job.snoozed_until).getTime() > now)) continue;
        if ((await db.query('SELECT id FROM records WHERE owner_id=$1 AND kind=\'administration\' AND data->>\'occurrenceId\'=$2 AND data->>\'status\'<>\'retracted\'', [ws.owner_id, o.id])).rows.length) continue;
        const subs = (await db.query('SELECT * FROM push_subscriptions WHERE owner_id=$1', [ws.owner_id])).rows;
        if (!subs.length) continue;
        // Claim before delivery. Notifications are best effort; clinical alarms are not promised.
        const claimed = (await db.query('UPDATE reminder_jobs SET sent_at=now() WHERE id=$1 AND sent_at IS NULL RETURNING id', [id])).rows.length;
        if (!claimed) continue;
        for (const sub of subs) {
          try { await webpush.sendNotification(sub.subscription, JSON.stringify({ title: prefs.reminderNames ? `${o.entry.name} is due` : 'A routine item is due', body: 'Open CycleTracker to record, skip or review it.', tag: o.id }), { TTL: 300 }); }
          catch (e: any) { if ([404, 410].includes(e.statusCode)) await db.query('DELETE FROM push_subscriptions WHERE id=$1', [sub.id]); else console.error('Push delivery failed', { status: e.statusCode ?? 'network' }); }
        }
      }
    }
  } catch { console.error('Reminder reconciliation failed; retrying next tick'); }
  finally { running = false; }
}
const interval = setInterval(() => void tick(), 30000); await tick(); console.log(enabled ? 'Reminder worker ready' : 'Reminders disabled: configure VAPID keys and subject');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { clearInterval(interval); await db.close(); process.exit(0); });
