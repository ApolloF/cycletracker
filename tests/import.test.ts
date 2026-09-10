import { it, expect } from 'vitest';
import { previewImport } from '../packages/domain/src/import.js';
it('shows only new phases and keeps phase identities scoped to their source', () => {
  const source = { format: 'cycletracker-1', sourceWorkspace: 'one', records: [], workspace: { protocol: { phases: [{ id: 'p', name: 'Old', entries: [] }, { id: 'q', name: 'New', entries: [] }] } } };
  const preview = previewImport(source, [], [{ source: 'cycletracker-1:one', phaseId: 'p' }]);
  expect(preview.duplicatePhases).toBe(1); expect(preview.protocol?.phases.map(p => p.id)).toEqual(['q']);
  expect(previewImport({ ...source, sourceWorkspace: 'two' }, [], [{ source: 'cycletracker-1:one', phaseId: 'p' }]).duplicatePhases).toBe(0);
});
it('preserves nested health fields, profile identities and offset timestamps', () => {
  const source = { user: 'profile A', logs: [{ id: 7, type: 'blood_pressure', created_at: '2026-01-01T08:00:00+02:00', data: { sys: 120, dia: 80, hr: 62, notes: 'Synthetic BP' } }], symptoms: [{ id: 9, created_at: '2026-01-01T09:00:00Z', mood_level: 0, hair_shedding_level: 2, notes: 'Synthetic note', symptoms: ['headache'], aromasin_dose_mg: 5 }] };
  const preview = previewImport(source);
  expect(preview.records).toHaveLength(2);
  expect(preview.records[0].data.at).toBe(source.logs[0].created_at);
  expect(preview.records[0].data.values.map((v: any) => v.value)).toEqual([120, 80, 62]);
  expect(preview.records[1].data.values[0].value).toBe(0);
  expect(preview.records[1].data.note).toContain('headache');
  expect(preview.records[1].data.importSource.raw.aromasin_dose_mg).toBe(5);
  expect(preview.records.every(r => r.kind === 'health')).toBe(true);
  expect(previewImport({ ...source, user: 'profile B' }).records[0].sourceId).not.toBe(preview.records[0].sourceId);
  expect(previewImport(source, [preview.records[0].sourceId]).records[0].duplicate).toBe(true);
});
it('retains ambiguous labs and checklist records without offering dose conversion', () => {
  const preview = previewImport({ bloodwork: [{ id: 1, test_date: '2026-01-01', markers: [{ key: 'testosterone', value: 3 }], has_pdf: true, pdf_filename: 'synthetic.pdf' }], checklist: [{ done: true }] });
  expect(preview.records).toEqual([]);
  expect(preview.unresolved).toHaveLength(2);
  expect(preview.unresolved.every(row => row.canMapAdministration === false)).toBe(true);
  expect(preview.documents).toHaveLength(1);
});
it('does not invent timestamps or IDs for malformed health rows', () => {
  const preview = previewImport({ logs: [{ id: 2, type: 'note', created_at: '2026-01-01', data: { text: 'Keep source' } }, { type: 'note', created_at: '2026-01-01T00:00:00Z' }] });
  expect(preview.records).toEqual([]); expect(preview.unresolved).toHaveLength(2);
});
it('does not convert checklist-only completions to dose records', () => {
  const preview = previewImport({ checklist: [{ id: 'check', done: true }], logs: [{ id: 4, ts: '2026-01-01T00:00:00Z', type: 'unknown' }] });
  expect(preview.records).toEqual([]); expect(preview.unresolved).toHaveLength(2);
});
it('marks duplicate source identities and imports phases only as drafts', () => {
  const data = { kind: 'note', title: 'Note', at: '2026-01-01T00:00:00Z', note: 'Synthetic note' };
  const preview = previewImport({ format: 'cycletracker-1', records: [{ id: 'source', kind: 'health', data }], workspace: { protocol: { phases: [{ id: 'p', name: 'Phase', entries: [] }], activePhaseId: 'p', activations: [{ phaseId: 'p', at: '2026-01-01T00:00:00Z' }] } } }, ['cycletracker-1:source']);
  expect(preview.records[0].duplicate).toBe(true); expect(preview.protocol?.activePhaseId).toBe(null); expect(preview.protocol?.activations).toEqual([]);
});
