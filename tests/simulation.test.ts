import { describe, it, expect } from 'vitest';
import { bateman, levelAt, simulate, tmax, type Scenario } from '../packages/simulation/src/index.js';
export const scenario: Scenario = { name: 'Synthetic numerical fixture', color: '#008577', formulationId: 'synthetic', analyte: 'synthetic', catalogVersion: 'test', mode: 'planned', model: { ka: .2, ke: .02, fraction: 1, scale: { kind: 'absolute', volumeL: 10, bioavailability: .5, apparentVolume: false }, parameterVersion: 'test', source: 'Synthetic fixture; not a drug model' }, events: [{ at: '2026-01-01T00:00:00Z', doseMg: 20, origin: 'planned' }] };
describe('deterministic simulation', () => {
  it('has zero pre-dose contribution and continuous equal-rate limit', () => {
    expect(bateman(-1, .1, .1)).toBe(0);
    expect(bateman(5, .1, .1)).toBeCloseTo(.5 * Math.exp(-.5), 12);
    expect(bateman(5, .1 + 1e-12, .1)).toBeCloseTo(bateman(5, .1, .1), 10);
    expect(Number.isFinite(bateman(1e6, .001, .1))).toBe(true);
  });
  it('matches analytical peak and infinite-horizon AUC', () => {
    const s = simulate(scenario, '2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', 10000);
    expect(s.metrics.peak).toBeCloseTo(bateman(tmax(.2, .02), .2, .02), 8);
    expect(s.metrics.auc).toBeCloseTo(50, 2);
  });
  it('preserves dose proportionality and window invariance', () => {
    const instant = Date.parse('2026-01-02T00:00:00Z');
    expect(levelAt({ ...scenario, events: [{ ...scenario.events[0], doseMg: 40 }] }, instant)).toBeCloseTo(2 * levelAt(scenario, instant), 12);
    const a = simulate(scenario, '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z');
    const b = simulate(scenario, '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z');
    expect(a.points.find(x => x[0] === instant)?.[1]).toBe(b.points[0][1]);
  });
  it('does not apply bioavailability twice with apparent volume', () => {
    const s = structuredClone(scenario); if (s.model.scale.kind === 'absolute') s.model.scale.apparentVolume = true;
    expect(levelAt(s, Date.parse('2026-01-02T00:00:00Z'))).toBeCloseTo(2 * levelAt(scenario, Date.parse('2026-01-02T00:00:00Z')), 12);
  });
});
