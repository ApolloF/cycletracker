import { z } from 'zod';
import { administrationSchema, healthSchema, protocolSchema, type Operation, type Protocol } from './index.js';
export type ImportPreview = { source: string; records: { sourceId: string; kind: Operation['kind']; data: any; duplicate: boolean }[]; unresolved: { sourceId: string; reason: string; raw: unknown }[]; protocol: Protocol | null; documents: unknown[]; warnings: string[] };
// Preview never mutates state. Legacy values without an explicit amount/snapshot stay unresolved.
export function previewImport(input: unknown, existingSourceIds: string[] = []): ImportPreview {
  const raw = z.record(z.string(), z.unknown()).parse(input) as any;
  const output: ImportPreview = { source: raw.format === 'cycletracker-1' ? 'cycletracker-1' : 'cycle-dashboard', records: [], unresolved: [], protocol: null, documents: Array.isArray(raw.documents) ? raw.documents : [], warnings: ['Review all mappings before importing. Attachments require separate upload.', 'Imported phases remain drafts; no phase is automatically activated.'] };
  const existing = new Set(existingSourceIds);
  if (raw.format === 'cycletracker-1' && Array.isArray(raw.records)) {
    for (const record of raw.records) {
      const sourceId = `${output.source}:${record.id}`;
      const parsed = record.kind === 'administration' ? administrationSchema.safeParse(record.data) : record.kind === 'health' ? healthSchema.safeParse(record.data) : null;
      if (parsed?.success) {
        const data: any = { ...parsed.data }; delete data.documentId;
        if (record.kind === 'administration') { data.occurrenceId = null; data.phaseId = null; data.entryId = null; }
        output.records.push({ sourceId, kind: record.kind, data, duplicate: existing.has(sourceId) });
      } else output.unresolved.push({ sourceId, reason: 'Unsupported or invalid record; keep the source for manual review', raw: record });
    }
    const protocol = protocolSchema.safeParse(raw.workspace?.protocol);
    if (protocol.success) output.protocol = { ...protocol.data, activePhaseId: null, activations: [] };
  } else {
    const logs = Array.isArray(raw.logs) ? raw.logs : [];
    for (const [i, record] of logs.entries()) {
      const sourceId = `cycle-dashboard:log:${record.id ?? i}`;
      const parsed = administrationSchema.safeParse({ ...record, snapshot: record.snapshot, at: record.at ?? record.ts, occurrenceId: null, phaseId: null, entryId: null });
      if (parsed.success) output.records.push({ sourceId, kind: 'administration', data: parsed.data, duplicate: existing.has(sourceId) });
      else output.unresolved.push({ sourceId, reason: 'Legacy dose requires an explicit formulation, unit and amount mapping', raw: record });
    }
    for (const [i, record] of (Array.isArray(raw.symptoms) ? raw.symptoms : []).entries()) {
      const sourceId = `cycle-dashboard:symptom:${record.id ?? i}`; const at = record.at ?? record.ts ?? record.timestamp;
      const parsed = healthSchema.safeParse({ kind: 'symptom', title: 'Imported symptom record', at, note: record.notes ?? record.note ?? '', values: [] });
      if (parsed.success) output.records.push({ sourceId, kind: 'health', data: parsed.data, duplicate: existing.has(sourceId) });
      else output.unresolved.push({ sourceId, reason: 'Legacy symptom timestamp requires review', raw: record });
    }
    for (const [i, record] of (Array.isArray(raw.checklist) ? raw.checklist : []).entries()) output.unresolved.push({ sourceId: `cycle-dashboard:checklist:${record.id ?? i}`, reason: 'Checklist completion has no verified administered amount', raw: record });
    if (!logs.length && !output.records.length && !output.unresolved.length) output.warnings.push('This export has no recognized records. Retain it for a source-specific mapping.');
  }
  return output;
}
