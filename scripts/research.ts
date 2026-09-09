import { mkdir, writeFile } from 'node:fs/promises';
const compounds = ['testosterone cypionate', 'testosterone enanthate', 'nandrolone decanoate', 'nandrolone phenylpropionate', 'human chorionic gonadotropin', 'anastrozole', 'exemestane', 'oxandrolone', 'stanozolol', 'oxymetholone'];
await mkdir('data/research', { recursive: true });
const searches = [];
for (const compound of compounds) {
  const query = `${compound} AND pharmacokinetics AND (human OR volunteers)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=8`;
  try {
    const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    searches.push({ compound, query, database: 'Europe PMC', url, retrievedAt: new Date().toISOString(), hitCount: body.hitCount, results: body.resultList.result.map((r: Record<string, unknown>) => ({ id: r.id, source: r.source, title: r.title, doi: r.doi, pmcid: r.pmcid, year: r.pubYear, openAccess: r.isOpenAccess })) });
  } catch (error) { searches.push({ compound, query, database: 'Europe PMC', url, error: String(error) }); }
}
await writeFile('data/research/europe-pmc-search.json', JSON.stringify(searches, null, 2));
console.log(`Recorded ${searches.length} searches`);
