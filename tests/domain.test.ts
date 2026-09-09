import { describe, it, expect } from 'vitest';
import { convert, entrySchema, occurrences, phaseSchema, supplies } from '../packages/domain/src/index.js';
export const entry = (overrides: Record<string, unknown> = {}) => entrySchema.parse({ id: 'e', version: 1, compoundId: 'test', formulationId: 'test', name: 'Synthetic item', route: 'Oral', amount: { value: 10, unit: 'mg' }, schedule: { kind: 'daily', timeZone: 'Europe/Amsterdam', startDate: '2026-03-01', slots: [{ id: 's', time: '02:30', amount: { value: 10, unit: 'mg' } }] }, ...overrides });
const phase = (e = entry()) => phaseSchema.parse({ id: 'p', name: 'Routine', entries: [e] });
describe('scheduling and units', () => {
  it('shifts DST gaps and selects repeated times once', () => {
    const spring = occurrences(phase(), '2026-03-29T00:00:00Z', '2026-03-30T00:00:00Z');
    expect(spring).toHaveLength(1); expect(spring[0].at).toBe('2026-03-29T01:30:00Z'); expect(spring[0].adjusted).toBe(true);
    const autumn = occurrences(phase(), '2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z');
    expect(autumn).toHaveLength(1); expect(autumn[0].at).toBe('2026-10-25T00:30:00Z');
  });
  it('preserves interval anchors across visible windows', () => {
    const e = entry(); e.schedule.kind = 'interval'; e.schedule.intervalDays = 2;
    const a = occurrences(phase(e), '2026-03-01T00:00:00Z', '2026-03-15T00:00:00Z');
    const b = occurrences(phase(e), '2026-03-08T00:00:00Z', '2026-03-15T00:00:00Z');
    expect(b).toEqual(a.filter(x => x.at >= '2026-03-08T00:00:00Z'));
  });
  it('keeps unequal slot amounts and excludes as needed from supplies', () => {
    const e = entry(); e.schedule.slots.push({ id: 's2', time: '20:00', amount: { value: 5, unit: 'mg' } }); e.packageAmount = { value: 100, unit: 'mg' };
    expect(supplies(phase(e), '2026-03-02T00:00:00Z', '2026-03-03T00:00:00Z')[0].quantity).toBe(15);
    e.schedule.kind = 'prn'; expect(occurrences(phase(e), '2026-03-02T00:00:00Z', '2026-03-03T00:00:00Z')).toEqual([]);
  });
  it('rejects incompatible units and keeps medication IU separate from volume', () => {
    expect(convert({ value: 500, unit: 'mcg' }, 'mg')).toBe(.5);
    expect(convert({ value: 25, unit: 'mg' }, 'mL', { value: 100, unit: 'mg' })).toBe(.25);
    expect(() => convert({ value: 1, unit: 'IU' }, 'mg')).toThrow();
    expect(() => convert({ value: 1, unit: 'mg' }, 'mL')).toThrow();
  });
  it('elapsed intervals retain elapsed hours across DST', () => {
    const e = entry(); e.schedule.kind = 'elapsed'; e.schedule.anchorInstant = '2026-03-28T01:30:00Z'; e.schedule.intervalHours = 24;
    const events = occurrences(phase(e), '2026-03-28T00:00:00Z', '2026-03-31T00:00:00Z');
    expect(events.map(x => x.at)).toEqual(['2026-03-28T01:30:00Z', '2026-03-29T01:30:00Z', '2026-03-30T01:30:00Z']);
  });
});
