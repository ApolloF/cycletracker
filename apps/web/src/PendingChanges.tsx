import { useEffect, useState } from 'react';
import { pendingChanges, discardRecordDraft, download, type Queue } from './api.js';

export function PendingChanges({ owner, sync }: { owner: string; sync(): Promise<void> }) {
  const [rows, setRows] = useState<Queue[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => pendingChanges(owner).then(setRows).catch(e => setError(e.message));
  useEffect(() => { void refresh(); }, [owner]);
  return <section>
    <div className="row wrap">
      <button disabled={busy} onClick={async () => { setBusy(true); try { await sync(); await refresh(); } finally { setBusy(false); } }}>Retry sync</button>
      <button onClick={async () => { try { download('cycletracker-pending.json', { format: 'cycletracker-pending-v1', operations: (await pendingChanges(owner)).map(row => row.operation) }); } catch (e: any) { setError(e.message); } }}>Export pending changes</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {rows.length === 0 && <p>No pending changes.</p>}
    {rows.map(row => <article key={row.operationId}>
      <h3>{(row.operation.data as any).title ?? (row.operation.data as any).snapshot?.name ?? row.operation.kind}</h3>
      <p>Revision {row.operation.expectedVersion + 1} · {(row.operation.data as any).status ?? row.operation.kind}</p>
      {row.error && <p className="error">{row.error}</p>}
      {row.error && <button disabled={busy} onClick={async () => {
        if (!confirm('Discard all pending edits to this record on this device? The server record will stay unchanged. Export first if you need a copy.')) return;
        setBusy(true);
        try { await discardRecordDraft(owner, row.operationId); await sync(); await refresh(); }
        catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
      }}>Discard local edits to this record</button>}
      <details><summary>View draft</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(row.operation.data, null, 2)}</pre></details>
    </article>)}
  </section>;
}
