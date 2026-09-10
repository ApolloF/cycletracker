import { z } from 'zod';
import { administrationSchema, healthSchema, protocolSchema, type Operation, type Protocol } from './index.js';
export type ImportPreview = { source: string; records: { sourceId: string; kind: Operation['kind']; data: any; duplicate: boolean }[]; unresolved: { sourceId: string; reason: string; raw: unknown; canMapAdministration?: boolean }[]; protocol: Protocol | null; documents: unknown[]; warnings: string[] };

export function previewImport(input: unknown, existingSourceIds: string[] = []): ImportPreview {
  const raw = z.record(z.string(), z.unknown()).parse(input) as any;
  const source = raw.format === 'cycletracker-1' ? 'cycletracker-1' : 'cycle-dashboard';
  const output: ImportPreview = { source, records: [], unresolved: [], protocol: null, documents: Array.isArray(raw.documents) ? raw.documents : [], warnings: ['Review all mappings before importing. Attachments require separate upload.', 'Imported phases remain drafts; no phase is automatically activated.'] };
  const existing = new Set(existingSourceIds);
  const scope = raw.sourceWorkspace ?? raw.user;
  if (!scope) output.warnings.push('No source profile identifier. Different unidentified exports may share record IDs.');
  const prefix = source + (scope ? `:${encodeURIComponent(String(scope))}` : '');
  const at = (record: any) => record.at ?? record.created_at ?? record.ts ?? record.timestamp;
  const provenance = (sourceId: string, record: unknown) => ({ sourceId, format: source, raw: record });
  const unresolved = (sourceId: string, record: unknown, reason: string, canMapAdministration = false) => output.unresolved.push({ sourceId, raw: record, reason, canMapAdministration });
  const addHealth = (sourceId: string, record: any, data: any) => {
    const parsed = healthSchema.safeParse({ ...data, importSource: provenance(sourceId, record) });
    if (parsed.success) output.records.push({ sourceId, kind: 'health', data: parsed.data, duplicate: existing.has(sourceId) });
    else unresolved(sourceId, record, 'Health fields or timestamp require review; original values retained');
  };
  if (source === 'cycletracker-1' && Array.isArray(raw.records)) {
    for (const [index, record] of raw.records.entries()) {
      const sourceId = `${prefix}:${record?.id ?? `missing-${index}`}`;
      if (!record?.id) { unresolved(sourceId, record, 'Missing stable source ID'); continue; }
      const parsed = record.kind === 'administration' ? administrationSchema.safeParse(record.data) : record.kind === 'health' ? healthSchema.safeParse(record.data) : null;
      if (parsed?.success) {
        const data: any = { ...parsed.data }; delete data.documentId;
        if (record.kind === 'administration') { data.occurrenceId = null; data.phaseId = null; data.entryId = null; }
        output.records.push({ sourceId, kind: record.kind, data, duplicate: existing.has(sourceId) });
      } else unresolved(sourceId, record, 'Unsupported or invalid record; keep the source for manual review');
    }
    const protocol = protocolSchema.safeParse(raw.workspace?.protocol);
    if (protocol.success) output.protocol = { ...protocol.data, activePhaseId: null, activations: [] };
  } else {
    for (const [index, record] of (Array.isArray(raw.logs) ? raw.logs : []).entries()) {
      const sourceId = `${prefix}:log:${record?.id ?? `missing-${index}`}`;
      if (record?.id == null) { unresolved(sourceId, record, 'Missing stable source ID'); continue; }
      const data = record.data ?? record;
      if (record.type === 'blood_pressure') {
        const values = [['sys', 'Systolic', 'mmHg'], ['dia', 'Diastolic', 'mmHg'], ['hr', 'Pulse', 'bpm']].filter(([key]) => data[key] != null).map(([key, name, unit]) => ({ name, value: data[key], unit }));
        if (!values.length) unresolved(sourceId, record, 'Blood pressure record has no measurements');
        else addHealth(sourceId, record, { kind: 'measurement', title: 'Blood pressure', at: at(record), note: data.notes ?? '', values });
      } else if (record.type === 'note') {
        addHealth(sourceId, record, { kind: 'note', title: 'Imported note', at: at(record), note: data.notes ?? data.note ?? data.text ?? '' });
      } else {
        const parsed = administrationSchema.safeParse({ ...data, snapshot: data.snapshot, at: at(record), occurrenceId: null, phaseId: null, entryId: null, importSource: provenance(sourceId, record) });
        if (parsed.success) output.records.push({ sourceId, kind: 'administration', data: parsed.data, duplicate: existing.has(sourceId) });
        else unresolved(sourceId, record, 'Confirm historical formulation, unit and amount; current routine values are not historical evidence', true);
      }
    }
    for (const [index, record] of (Array.isArray(raw.symptoms) ? raw.symptoms : []).entries()) {
      const sourceId = `${prefix}:symptom:${record?.id ?? `missing-${index}`}`;
      if (record?.id == null) { unresolved(sourceId, record, 'Missing stable source ID'); continue; }
      const values = ['mood_level', 'hair_shedding_level'].filter(key => record[key] != null).map(key => ({ name: key, value: record[key], unit: 'source scale' }));
      const labels = Array.isArray(record.symptoms) ? record.symptoms.filter((s: unknown) => typeof s === 'string') : [];
      const note = [record.notes ?? record.note ?? '', labels.length ? `Symptoms: ${labels.join(', ')}` : ''].filter(Boolean).join('\n');
      addHealth(sourceId, record, { kind: 'symptom', title: 'Imported symptoms', at: at(record), note, values });
      if (['aromasin_dose_mg', 'anastrozole_dose_mg', 'dbol_dose_mg'].some(key => record[key] != null)) output.warnings.push(`Symptom ${record.id}: drug amounts retained in source details; no administration inferred.`);
    }
    for (const [index, record] of (Array.isArray(raw.checklist) ? raw.checklist : []).entries()) unresolved(`${prefix}:checklist:${record?.id ?? index}`, record, 'Checklist completion has no verified administered amount');
    for (const [index, record] of (Array.isArray(raw.bloodwork) ? raw.bloodwork : []).entries()) {
      unresolved(`${prefix}:bloodwork:${record?.id ?? index}`, record, 'Lab panel needs sampling-time and source-unit review; date-only results are not assigned an invented time');
      if (record?.has_pdf) output.documents.push({ sourceId: `${prefix}:bloodwork:${record.id}`, name: record.pdf_filename });
    }
    if (raw.settings || raw.doses || raw.weekly_goals) output.warnings.push('Legacy settings, dose defaults and weekly goals remain in the source backup; no active routine is inferred.');
    if (!output.records.length && !output.unresolved.length) output.warnings.push('No recognized records. Retain the source for manual review.');
  }
  return output;
}
