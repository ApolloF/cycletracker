import { mkdir, writeFile } from 'node:fs/promises';
import { simulate, type Scenario } from '../packages/simulation/src/index.js';
const runs = [];
for (const [ka, ke] of [[.2, .02], [.1, .1], [.10000000001, .1], [.001, .2]]) {
  const scenario: Scenario = { name: 'Synthetic independent reference', formulationId: 'synthetic', analyte: 'synthetic', color: '#008577', mode: 'planned', catalogVersion: 'test', model: { ka, ke, fraction: .7, scale: { kind: 'absolute', volumeL: 10, bioavailability: .5, apparentVolume: false }, source: 'Synthetic fixture', parameterVersion: 'test' }, events: [0, 17, 49.5, 103].map(h => ({ at: new Date(Date.UTC(2026, 0, 1) + h * 36e5).toISOString(), doseMg: 20, origin: 'planned' })) };
  runs.push(simulate(scenario, '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z', 3000));
}
await mkdir('.local', { recursive: true }); await writeFile('.local/reference-fixtures.json', JSON.stringify(runs));
