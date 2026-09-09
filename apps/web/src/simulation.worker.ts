import { simulate, type Scenario } from '../../../packages/simulation/src/index.js';
self.onmessage = (event: MessageEvent<{ scenarios: Scenario[]; from: string; to: string }>) => {
  try { const started = performance.now(); const results = event.data.scenarios.map(s => simulate(s, event.data.from, event.data.to)); self.postMessage({ results, duration: performance.now() - started }); }
  catch (error: any) { self.postMessage({ error: error.message }); }
};
