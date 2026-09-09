import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { healthSchema, type HealthRecord } from '../../../packages/domain/src/index.js';
import { Field } from './ui.js';
import { api } from './api.js';
type Marker = { name: string; value: string; unit: string; low: string; high: string };
export function HealthEditor({ initial, save }: { initial?: HealthRecord; save(data: HealthRecord): Promise<void> }) {
  const [kind, setKind] = useState<HealthRecord['kind']>(initial?.kind ?? 'measurement');
  const [markers, setMarkers] = useState<Marker[]>(initial?.values.map(v => ({ name: v.name, value: String(v.value), unit: v.unit, low: v.low == null ? '' : String(v.low), high: v.high == null ? '' : String(v.high) })) ?? []);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const date = new Date(initial?.at ?? Date.now());
  const add = (name = '', unit = '') => setMarkers(old => [...old, { name, unit, value: '', low: '', high: '' }]);
  const change = (i: number, field: keyof Marker, value: string) => setMarkers(old => old.map((m, n) => n === i ? { ...m, [field]: value } : m));
  return <form onSubmit={async event => { event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget); try {
    let documentId = initial?.documentId; const file = form.get('pdf') as File;
    const data = healthSchema.parse({ kind, title: form.get('title'), at: new Date(form.get('at') as string).toISOString(), note: form.get('note'), samplingTimeKnown: !form.get('unknownTime'), documentId, values: markers.map(m => { if (m.value === '') throw new Error('Enter a value for each marker or remove its row'); return { name: m.name, value: Number(m.value), unit: m.unit, ...(m.low !== '' ? { low: Number(m.low) } : {}), ...(m.high !== '' ? { high: Number(m.high) } : {}) }; }) });
    if (file?.size) { const upload = new FormData(); upload.set('file', file); data.documentId = (await api('/documents', { method: 'POST', body: upload })).id; }
    await save(data);
  } catch (err: any) { setError(err.issues?.map((x: any) => x.message).join('; ') ?? err.message); } finally { setBusy(false); } }}>
    <Field label="Type"><select value={kind} onChange={e => setKind(e.target.value as any)}><option value="measurement">Measurement</option><option value="symptom">Symptom</option><option value="note">Note</option><option value="lab">Lab panel</option></select></Field>
    <Field label="Title"><input name="title" defaultValue={initial?.title} required placeholder="e.g. Blood pressure"/></Field>
    <Field label="Date & time (device local)"><input name="at" type="datetime-local" required defaultValue={new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}/></Field>
    {kind === 'lab' && <label className="checkbox"><input type="checkbox" name="unknownTime" defaultChecked={initial?.samplingTimeKnown === false}/> Sampling time unknown</label>}
    {kind !== 'note' && <><div className="row spread"><h3>{kind === 'lab' ? 'Lab results' : 'Values'}</h3>{!markers.length && kind === 'measurement' && <button type="button" className="text-button" onClick={() => setMarkers(['Systolic', 'Diastolic', 'Pulse'].map((name, i) => ({ name, unit: i === 2 ? 'bpm' : 'mmHg', value: '', low: '', high: '' })))}>Blood pressure & pulse</button>}</div>
    {markers.map((marker, i) => <div className="marker-editor" key={i}><div className="row"><Field label="Marker"><input value={marker.name} onChange={e => change(i, 'name', e.target.value)} required placeholder={kind === 'symptom' ? 'Severity' : 'Marker name'}/></Field><button type="button" className="icon-button" aria-label="Remove marker" onClick={() => setMarkers(old => old.filter((_, n) => n !== i))}><Trash2 size={16}/></button></div><div className="grid two"><Field label="Value"><input type="number" step="any" value={marker.value} onChange={e => change(i, 'value', e.target.value)} required/></Field><Field label="Unit"><input value={marker.unit} onChange={e => change(i, 'unit', e.target.value)} placeholder="e.g. nmol/L"/></Field></div>{kind === 'lab' && <div className="grid two"><Field label="Lab lower limit"><input type="number" step="any" value={marker.low} onChange={e => change(i, 'low', e.target.value)}/></Field><Field label="Lab upper limit"><input type="number" step="any" value={marker.high} onChange={e => change(i, 'high', e.target.value)}/></Field></div>}</div>)}
    <button className="text-button" type="button" onClick={() => add()}><Plus size={16}/> Add value</button></>}
    <Field label="Notes"><textarea name="note" defaultValue={initial?.note}/></Field>
    {kind === 'lab' && <Field label="Original report (PDF)"><input name="pdf" type="file" accept="application/pdf"/><small>{initial?.documentId ? 'A report is attached. Choose a file to replace it.' : 'Attach the report; enter its results above.'}</small></Field>}
    {error && <p className="error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy ? 'Saving…' : 'Save observation'}</button>
  </form>;
}
