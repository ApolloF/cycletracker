import type { Model } from '../../simulation/src/index.js';
export type CatalogEntry = { id: string; compoundId: string; name: string; route: string; analyte: string; capability: 'limited-evidence-relative' | 'tracking-only'; model?: Model; sources: { url: string; locator: string; inspected: string }[]; limitations: string; reviewedAt: string };
export const CATALOG_VERSION = '2026-09-09.1';
const reviewedAt = '2026-09-09';
const relative = (ka: number, ke: number, source: string): Model => ({ ka, ke, fraction: 1, scale: { kind: 'relative', referenceDose: 1 }, parameterVersion: CATALOG_VERSION, source });
export const catalog: CatalogEntry[] = [
  { id: 'testosterone-cypionate-im', compoundId: 'testosterone', name: 'Testosterone cypionate', route: 'Intramuscular oil', analyte: 'testosterone', capability: 'limited-evidence-relative', model: relative(1.22 / 24, (2.6 / 14.4) / 24, 'PMID 29436172, Table 2'), sources: [{ url: 'https://doi.org/10.1002/psp4.12287', locator: 'Table 2', inspected: 'Full-text XML via Europe PMC; ka=1.22/day, CL/F=2.6 kL/day, V/F=14.4 kL' }], limitations: 'Shape extracted from a fitted population model in 31 healthy men. Baseline, feedback and covariates omitted. Relative exogenous scenario only; not total serum testosterone or externally validated predictions.', reviewedAt },
  ...(['sc', 'im'] as const).map(route => ({ id: `testosterone-enanthate-${route}`, compoundId: 'testosterone', name: `Testosterone enanthate (${route.toUpperCase()})`, route: route === 'sc' ? 'Subcutaneous' : 'Intramuscular oil', analyte: 'testosterone', capability: 'limited-evidence-relative' as const, model: relative(route === 'sc' ? .09 : .08, route === 'sc' ? 60.8 / 23800 : 50.6 / 13800, 'PMC10174206, Table 1'), sources: [{ url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10174206/', locator: 'Table 1', inspected: 'Full-text XML via Europe PMC; route-specific fitted ka, volume and clearance' }, { url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4721027/', locator: 'Tables 1 and 2', inspected: 'Full-text XML; original adult study arms and total-testosterone PK summaries' }], limitations: 'Reduced shape of a fitted adult model; source also investigates adolescent extrapolation, which is not implemented. No endogenous baseline or covariates. IM absorption uncertainty includes a nonphysical lower confidence bound; do not use it as a rate.', reviewedAt })),
  ...[
    ['nandrolone-decanoate-im', 'nandrolone', 'Nandrolone decanoate', 'Intramuscular oil', '9103484', '3865478'],
    ['nandrolone-phenylpropionate-im', 'nandrolone', 'Nandrolone phenylpropionate', 'Intramuscular oil', '9103484'],
    ['hcg-urinary-sc', 'hcg', 'hCG (urinary, SC)', 'Subcutaneous', '8908528', '9688371'],
    ['hcg-urinary-im', 'hcg', 'hCG (urinary, IM)', 'Intramuscular', '8908528', '9688371'],
    ['hcg-recombinant-sc', 'hcg', 'hCG (recombinant, SC)', 'Subcutaneous', '12470572'],
    ['anastrozole-oral', 'anastrozole', 'Anastrozole', 'Oral', '12228897'],
    ['exemestane-oral', 'exemestane', 'Exemestane', 'Oral', '14671195', '15752382'],
    ['oxandrolone-oral', 'oxandrolone', 'Oxandrolone', 'Oral', '4729902', '26017381'],
    ['stanozolol-oral', 'stanozolol', 'Stanozolol (oral)', 'Oral', '2325376'],
    ['stanozolol-im', 'stanozolol', 'Stanozolol (injectable)', 'Intramuscular aqueous', '17348894'],
    ['oxymetholone-oral', 'oxymetholone', 'Oxymetholone', 'Oral', '12101054'],
  ].map(([id, compoundId, name, route, ...pmids]) => ({ id, compoundId, name, route, analyte: compoundId, capability: 'tracking-only' as const, sources: pmids.map(pmid => ({ url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`, locator: 'Indexed record', inspected: 'Search/abstract screening; complete parameter extraction pending' })), limitations: id === 'stanozolol-im' ? 'The cited injectable study is in horses; it is not a human model.' : id === 'stanozolol-oral' ? 'Urinary detection data do not establish a plasma concentration model.' : 'A complete formulation-specific parameterization and applicable validation have not been established. Tracking is available; no default curve.', reviewedAt })),
];
