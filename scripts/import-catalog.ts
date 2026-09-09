import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
const id = '1Hrbw5eXb8bw1YfZZmBHHS3IY_j95V5DJsc6-piO__Ns';
const target = 'data/catalog';
await mkdir(target, { recursive: true });
if (process.argv.includes('--accept')) {
  const candidate = JSON.parse(await readFile(`${target}/candidate.json`, 'utf8'));
  if (!candidate.rows.length || candidate.errors.length) throw new Error('Candidate has import errors');
  // Accepted raw snapshots are research inputs, never executable model parameters.
  await copyFile(`${target}/candidate.json`, `${target}/snapshot-${candidate.checksum}.json`);
  await writeFile(`${target}/accepted.json`, JSON.stringify({ checksum: candidate.checksum, acceptedAt: new Date().toISOString(), snapshot: `snapshot-${candidate.checksum}.json` }, null, 2));
  console.log('Accepted research snapshot. Model capabilities remain separately reviewed.');
} else {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`;
  const response = await fetch(url); if (!response.ok) throw new Error(`Import failed: HTTP ${response.status}; accepted catalog unchanged`);
  const raw = await response.text();
  const rows = parse(raw, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  if (!rows.length || !Object.keys(rows[0]).some(k => /compound/i.test(k))) throw new Error('Unrecognized spreadsheet columns');
  const numeric = (value: string) => { const s = value?.trim(); if (!s || /^(---?|n\/?a|unknown)$/i.test(s)) return null; return /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(s) ? Number(s.replaceAll(',', '')) : null; };
  const checksum = createHash('sha256').update(raw).digest('hex');
  let previous: unknown = null; try { previous = JSON.parse(await readFile(`${target}/accepted.json`, 'utf8')); } catch { /* first import */ }
  const candidate = { spreadsheetId: id, tab: '0', url, retrievedAt: new Date().toISOString(), checksum, previous, errors: [], rows: rows.map((fields, i) => ({ row: i + 2, raw: fields, numericFields: Object.fromEntries(Object.entries(fields).filter(([k]) => /half|cmax|tmax|bioavailability/i.test(k)).map(([k, v]) => [k, numeric(v)])), capability: 'tracking-only', unresolved: ['Reference dose, units, parameter meanings and reuse terms require review before modeling'] })) };
  await writeFile(`${target}/candidate.json`, JSON.stringify(candidate, null, 2));
  await writeFile(`${target}/change-report.md`, `# Research catalog import\n\nRetrieved ${candidate.retrievedAt}. ${rows.length} rows. SHA-256: ${checksum}.\n\nPrevious: ${JSON.stringify(previous)}\n\nReview candidate.json before running --accept. All rows remain tracking-only until independently reviewed.\n`);
  console.log(`Candidate written: ${rows.length} rows; accepted version unchanged`);
}
