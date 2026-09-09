import { z } from 'zod';
export const ENGINE_VERSION = 'bateman-1.0.0';
const positive = z.number().finite().positive();
export const modelSchema = z.object({
  ka: positive, ke: positive, fraction: positive.max(1).default(1),
  scale: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('relative'), referenceDose: positive }),
    z.object({ kind: z.literal('absolute'), volumeL: positive, bioavailability: positive.max(1), apparentVolume: z.boolean().default(false) }),
  ]),
  parameterVersion: z.string().min(1), source: z.string().min(1),
});
export type Model = z.infer<typeof modelSchema>;
export const scenarioSchema = z.object({
  name: z.string().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  formulationId: z.string(), analyte: z.string(), model: modelSchema,
  events: z.array(z.object({ at: z.string().datetime({ offset: true }), doseMg: positive, origin: z.enum(['recorded', 'planned', 'assumed']) })).max(100000),
  catalogVersion: z.string(), mode: z.enum(['recorded', 'planned', 'combined']),
  calibration: z.object({ scale: positive, observationIds: z.array(z.string()), limitations: z.string() }).optional(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export function bateman(t: number, ka: number, ke: number): number {
  if (t <= 0) return 0;
  const delta = ka - ke;
  // expm1 avoids cancellation; use the smaller exponential to avoid overflow in flip-flop kinetics.
  if (Math.abs(delta * t) < 1e-7) return ka * t * Math.exp(-ke * t) * (1 - delta * t / 2 + (delta * t) ** 2 / 6);
  return delta > 0 ? ka * Math.exp(-ke * t) * -Math.expm1(-delta * t) / delta
    : ka * Math.exp(-ka * t) * Math.expm1(delta * t) / delta;
}
export function tmax(ka: number, ke: number): number {
  return Math.abs(ka - ke) < Math.max(ka, ke) * 1e-8 ? 1 / ke : Math.log(ka / ke) / (ka - ke);
}
export function levelAt(scenario: Scenario, instant: number, calibrated = true): number {
  const m = scenario.model;
  const doseScale = m.scale.kind === 'absolute'
    ? (m.scale.apparentVolume ? 1 : m.scale.bioavailability) / m.scale.volumeL
    : 100 / (m.scale.referenceDose * bateman(tmax(m.ka, m.ke), m.ka, m.ke));
  return scenario.events.reduce((v, e) => v + e.doseMg * m.fraction * doseScale * bateman((instant - Date.parse(e.at)) / 36e5, m.ka, m.ke), 0) * (calibrated ? scenario.calibration?.scale ?? 1 : 1);
}
export type Simulation = { points: [number, number][]; metrics: { peak: number; trough: number; average: number; auc: number; fluctuation: number | null }; unit: string; engineVersion: string; scenario: Scenario; from: string; to: string };
export function simulate(raw: Scenario, from: string, to: string, resolution = 1200): Simulation {
  const scenario = scenarioSchema.parse(raw), start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 5 * 366 * 864e5) throw new Error('Invalid simulation range');
  resolution = Math.min(10000, Math.max(100, Math.floor(resolution)));
  if (scenario.events.length * resolution > 25e6) throw new Error('Scenario too large; reduce range or number of doses');
  const grid = new Set<number>();
  for (let i = 0; i <= resolution; i++) grid.add(start + (end - start) * i / resolution);
  // Preserve narrow absorption peaks and event boundaries even for long visible windows.
  const peakHours = tmax(scenario.model.ka, scenario.model.ke);
  for (const e of scenario.events) for (const fraction of [0, .1, .25, .5, .75, 1, 1.25, 1.5, 2, 3]) {
    const x = Date.parse(e.at) + peakHours * fraction * 36e5;
    if (x >= start && x <= end) grid.add(x);
  }
  const points: [number, number][] = [...grid].sort((a, b) => a - b).map(x => [x, levelAt(scenario, x)]);
  let auc = 0, peak = 0, trough = Infinity;
  for (let i = 0; i < points.length; i++) {
    peak = Math.max(peak, points[i][1]); trough = Math.min(trough, points[i][1]);
    if (i) auc += (points[i][0] - points[i - 1][0]) / 36e5 * (points[i][1] + points[i - 1][1]) / 2;
  }
  const average = auc / ((end - start) / 36e5);
  return { points, metrics: { peak, trough, average, auc, fluctuation: average ? (peak - trough) / average : null }, unit: scenario.model.scale.kind === 'absolute' ? 'mg/L' : '% reference-dose peak', engineVersion: ENGINE_VERSION, scenario, from, to };
}
export function fitScale(s: Scenario, observations: { id: string; at: string; concentrationMgL: number }[]) {
  if (s.model.scale.kind !== 'absolute' || observations.length < 2) throw new Error('Scale fitting requires an absolute model and at least two timestamped exogenous-analyte observations');
  const pairs = observations.map(o => ({ ...o, predicted: levelAt(s, Date.parse(o.at), false) }));
  if (pairs.some(p => !Number.isFinite(p.concentrationMgL) || p.concentrationMgL < 0 || !(p.predicted > 0))) throw new Error('Invalid observations or no modeled exposure');
  const scale = pairs.reduce((v, p) => v + p.predicted * p.concentrationMgL, 0) / pairs.reduce((v, p) => v + p.predicted ** 2, 0);
  if (!(scale > 0)) throw new Error('Positive scale cannot be identified');
  return { scale, observationIds: observations.map(o => o.id), limitations: 'Scale-only least-squares fit; fixed kinetics; in-sample fit does not establish predictive validity. Total endogenous hormone measurements are ineligible.' };
}
