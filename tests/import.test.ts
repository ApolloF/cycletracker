import { it, expect } from 'vitest';
import { previewImport } from '../packages/domain/src/import.js';
it('does not convert checklist-only completions to dose records', () => {
  const preview = previewImport({ checklist: [{ id: 'check', done: true }], logs: [{ id: 4, ts: '2026-01-01T00:00:00Z', type: 'unknown' }] });
  expect(preview.records).toEqual([]); expect(preview.unresolved).toHaveLength(2);
});
it('marks duplicate source identities and imports phases only as drafts', () => {
  const data = { kind: 'note', title: 'Note', at: '2026-01-01T00:00:00Z', note: 'Synthetic note' };
  const preview = previewImport({ format: 'cycletracker-1', records: [{ id: 'source', kind: 'health', data }], workspace: { protocol: { phases: [{ id: 'p', name: 'Phase', entries: [] }], activePhaseId: 'p', activations: [{ phaseId: 'p', at: '2026-01-01T00:00:00Z' }] } } }, ['cycletracker-1:source']);
  expect(preview.records[0].duplicate).toBe(true); expect(preview.protocol?.activePhaseId).toBe(null); expect(preview.protocol?.activations).toEqual([]);
});
