import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';

export const unitSchema = z.enum(['mg', 'mcg', 'g', 'IU', 'mL']);
export type Unit = z.infer<typeof unitSchema>;
const positive = z.number().finite().positive();
const date = z.string().refine(v => { try { Temporal.PlainDate.from(v); return true; } catch { return false; } }, 'Use a valid date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const amountSchema = z.object({ value: positive, unit: unitSchema });
export type Amount = z.infer<typeof amountSchema>;
export const scheduleSchema = z.object({
  kind: z.enum(['daily', 'weekdays', 'interval', 'elapsed', 'prn']),
  timeZone: z.string().refine(v => { try { Temporal.Now.zonedDateTimeISO(v); return true; } catch { return false; } }, 'Invalid time zone'),
  startDate: date, endDate: date.optional(),
  slots: z.array(z.object({ id: z.string().min(1), time, amount: amountSchema })).max(24),
  weekdays: z.array(z.number().int().min(1).max(7)).default([]),
  intervalDays: z.number().int().min(1).max(3650).default(2),
  intervalHours: positive.max(87600).default(48),
  anchorInstant: z.string().datetime({ offset: true }).optional(),
}).superRefine((s, ctx) => {
  if (s.kind !== 'prn' && !s.slots.length) ctx.addIssue({ code: 'custom', message: 'Add an administration time' });
  if (s.endDate && s.endDate < s.startDate) ctx.addIssue({ code: 'custom', message: 'End date precedes start date' });
  if (s.kind === 'weekdays' && !s.weekdays.length) ctx.addIssue({ code: 'custom', message: 'Choose at least one weekday' });
  if (new Set(s.slots.map(x => x.id)).size !== s.slots.length || new Set(s.slots.map(x => x.time)).size !== s.slots.length) ctx.addIssue({ code: 'custom', message: 'Administration times and IDs must be unique' });
  if (s.kind === 'elapsed' && (!s.anchorInstant || s.slots.length !== 1)) ctx.addIssue({ code: 'custom', message: 'Elapsed intervals require one amount and an exact anchor timestamp' });
});
export type Schedule = z.infer<typeof scheduleSchema>;
export const entrySchema = z.object({
  id: z.string().min(1), version: z.number().int().positive(), compoundId: z.string().min(1),
  formulationId: z.string().min(1), name: z.string().trim().min(1).max(150), route: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true), amount: amountSchema, schedule: scheduleSchema,
  concentration: z.object({ value: positive, unit: z.enum(['mg', 'mcg', 'g', 'IU']) }).optional(),
  pillStrength: amountSchema.optional(), packageAmount: amountSchema.optional(), notes: z.string().max(4000).default(''),
});
export type Entry = z.infer<typeof entrySchema>;
export const phaseSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(1).max(150), category: z.string().max(80).default('Ongoing'),
  notes: z.string().max(4000).default(''), archived: z.boolean().default(false), entries: z.array(entrySchema).max(100),
  plannedStart: date.optional(), plannedEnd: date.optional(),
});
export type Phase = z.infer<typeof phaseSchema>;
export const protocolSchema = z.object({
  phases: z.array(phaseSchema).max(200), activePhaseId: z.string().nullable().default(null),
  activations: z.array(z.object({ phaseId: z.string(), at: z.string().datetime({ offset: true }), endedAt: z.string().datetime({ offset: true }).optional() })).default([]),
}).superRefine((p, ctx) => {
  const ids = p.phases.map(x => x.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Phase IDs must be unique' });
  const entries = p.phases.flatMap(x => x.entries.map(e => e.id));
  if (new Set(entries).size !== entries.length) ctx.addIssue({ code: 'custom', message: 'Entry IDs must be unique across phases' });
  if (p.activePhaseId && !p.phases.some(x => x.id === p.activePhaseId && !x.archived)) ctx.addIssue({ code: 'custom', message: 'Active phase must exist and cannot be archived' });
});
export type Protocol = z.infer<typeof protocolSchema>;
export const emptyProtocol = (): Protocol => ({ phases: [], activePhaseId: null, activations: [] });
export const preferencesSchema = z.object({
  timeZone: z.string().default('Europe/Amsterdam'), locale: z.string().default('en-GB'),
  theme: z.enum(['light', 'dark', 'system']).default('system'), onboardingComplete: z.boolean().default(false),
  healthEnabled: z.boolean().default(true), reminderNames: z.boolean().default(false), remindersEnabled: z.boolean().default(false),
  units: z.enum(['SI', 'US']).default('SI'),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export type Occurrence = { id: string; entryId: string; phaseId: string; at: string; localTime: string; adjusted: boolean; amount: Amount; entry: Entry };
export function occurrences(phase: Phase, from: string, to: string): Occurrence[] {
  const startMs = Date.parse(from), endMs = Date.parse(to);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs || endMs - startMs > 366 * 864e5 * 5) throw new Error('Choose a valid range of at most five years');
  const result: Occurrence[] = [];
  for (const entry of phase.entries) {
    const s = scheduleSchema.parse(entry.schedule);
    if (!entry.enabled || s.kind === 'prn') continue;
    const add = (at: Temporal.ZonedDateTime, slot: Schedule['slots'][number], adjusted: boolean) => {
      if (at.epochMilliseconds < startMs || at.epochMilliseconds >= endMs) return;
      const day = at.toPlainDate().toString();
      if (day < s.startDate || (s.endDate && day > s.endDate)) return;
      const iso = at.toInstant().toString();
      result.push({ id: `${entry.id}:${entry.version}:${slot.id}:${iso}`, entryId: entry.id, phaseId: phase.id, at: iso, localTime: at.toPlainDateTime().toString(), adjusted, amount: { ...slot.amount }, entry });
    };
    if (s.kind === 'elapsed') {
      const anchor = Date.parse(s.anchorInstant!); const interval = s.intervalHours * 36e5;
      const first = Math.max(0, Math.ceil((startMs - anchor) / interval));
      for (let ms = anchor + first * interval; ms < endMs; ms += interval) add(Temporal.Instant.fromEpochMilliseconds(Math.round(ms)).toZonedDateTimeISO(s.timeZone), s.slots[0], false);
    } else {
      let day = Temporal.Instant.fromEpochMilliseconds(startMs).toZonedDateTimeISO(s.timeZone).toPlainDate();
      const last = Temporal.Instant.fromEpochMilliseconds(endMs).toZonedDateTimeISO(s.timeZone).toPlainDate();
      const anchor = Temporal.PlainDate.from(s.startDate);
      while (Temporal.PlainDate.compare(day, last) <= 0) {
        const distance = anchor.until(day).days;
        if (distance >= 0 && (s.kind !== 'weekdays' || s.weekdays.includes(day.dayOfWeek)) && (s.kind !== 'interval' || distance % s.intervalDays === 0)) {
          for (const slot of s.slots) {
            const local = day.toPlainDateTime(slot.time);
            const zoned = local.toZonedDateTime(s.timeZone, { disambiguation: 'compatible' });
            add(zoned, slot, !local.equals(zoned.toPlainDateTime()));
          }
        }
        day = day.add({ days: 1 });
      }
    }
    if (result.length > 100000) throw new Error('Too many occurrences; shorten the range');
  }
  return result.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
const mass: Partial<Record<Unit, number>> = { mg: 1, mcg: .001, g: 1000 };
export function convert(amount: Amount, to: Unit, concentration?: Entry['concentration']): number {
  amountSchema.parse(amount);
  if (amount.unit === to) return amount.value;
  if (mass[amount.unit] && mass[to]) return amount.value * mass[amount.unit]! / mass[to]!;
  if (concentration && concentration.value > 0 && (amount.unit === 'mL' || to === 'mL')) {
    if (amount.unit === 'mL') return convert({ value: amount.value * concentration.value, unit: concentration.unit }, to);
    return convert(amount, concentration.unit) / concentration.value;
  }
  throw new Error(`Cannot convert ${amount.unit} to ${to} without compatible formulation information`);
}
export function supplies(phase: Phase, from: string, to: string) {
  const events = occurrences(phase, from, to);
  return phase.entries.filter(e => e.enabled).map(e => {
    const doses = events.filter(x => x.entryId === e.id);
    const unit = e.packageAmount?.unit ?? e.amount.unit;
    const quantity = doses.reduce((sum, d) => sum + convert(d.amount, unit, e.concentration), 0);
    return { entry: e, count: doses.length, quantity, unit, packages: e.packageAmount ? Math.ceil(quantity / e.packageAmount.value) : null, uncertain: e.schedule.kind === 'prn' };
  });
}
const importSourceSchema = z.object({ sourceId: z.string(), format: z.string(), raw: z.unknown() });
export const administrationSchema = z.object({
  importSource: importSourceSchema.optional(),
  occurrenceId: z.string().nullable().default(null), phaseId: z.string().nullable().default(null),
  entryId: z.string().nullable().default(null), at: z.string().datetime({ offset: true }),
  status: z.enum(['taken', 'skipped', 'retracted']), snapshot: entrySchema,
  amount: amountSchema, site: z.string().max(100).default(''), note: z.string().max(4000).default(''),
});
export type Administration = z.infer<typeof administrationSchema>;
export const healthSchema = z.object({
  importSource: importSourceSchema.optional(),
  kind: z.enum(['measurement', 'symptom', 'note', 'lab']), at: z.string().datetime({ offset: true }),
  title: z.string().trim().min(1).max(150), note: z.string().max(10000).default(''),
  values: z.array(z.object({ name: z.string().min(1), value: z.number().finite(), unit: z.string().max(40), low: z.number().optional(), high: z.number().optional() })).max(100).default([]),
  samplingTimeKnown: z.boolean().default(true), documentId: z.string().optional(), deleted: z.boolean().default(false),
});
export type HealthRecord = z.infer<typeof healthSchema>;
export const operationSchema = z.object({
  operationId: z.string().uuid(), id: z.string().uuid(), kind: z.enum(['administration', 'health', 'scenario', 'compound']),
  expectedVersion: z.number().int().min(0), data: z.unknown(),
});
export type Operation = z.infer<typeof operationSchema>;
