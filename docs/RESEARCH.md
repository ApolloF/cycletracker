# Research audit — 9 September 2026

The spreadsheet is an import/research index, not a set of approved model parameters. The current candidate contains 65 rows and is not accepted. See `data/catalog/change-report.md` for retrieval metadata and checksum.

## Inspected full-text evidence

- [Testosterone cypionate population PK/PD, PMID 29436172](https://doi.org/10.1002/psp4.12287): full-text XML retrieved from Europe PMC. Table 2 inspected: ka 1.22/day, CL/F 2.6 kL/day and V/F 14.4 kL, fitted in 31 healthy men. The reduced relative curve converts rates to hours and uses ke = CL/V. Endogenous and covariate components were not reproduced.
- [Testosterone enanthate model, PMC10174206](https://pmc.ncbi.nlm.nih.gov/articles/PMC10174206/): full-text XML and Table 1 inspected. SC ka 0.09/hour, V 23,800 L, CL 60.8 L/hour; IM ka 0.08/hour, V 13,800 L, CL 50.6 L/hour. These parameters support a provisional relative shape, not an independently validated concentration prediction. The reported IM absorption interval includes a nonphysical negative bound, which must not be used as a rate.
- [Original enanthate phase II study, PMC4721027](https://pmc.ncbi.nlm.nih.gov/articles/PMC4721027/): Tables 1 and 2 inspected for study population, formulation/route and total-testosterone summaries. The SC and IM arms have different dose/history contexts. These observations have not yet been used in an independent validation report.

Initial PMC web requests returned browser checks. Europe PMC's full-text XML endpoint subsequently worked for the three papers above. The XML request for PMC7134583 returned HTTP 404. Full articles are retained only in ignored local research files, not redistributed in this repository.

## Other screened leads

| Formulation | Primary-source leads | Current status |
| --- | --- | --- |
| Nandrolone decanoate / phenylpropionate | PMID 9103484, 3865478 | Indexed/abstract screening; complete extraction pending |
| Urinary hCG SC/IM | PMID 8908528, 9688371 | Formulation and population differences need review |
| Recombinant hCG | PMID 12470572 | Distinguish mass/IU bases and recombinant/urinary preparations |
| Anastrozole oral | PMID 12228897 | Human PK lead; complete reference-dose/model extraction pending |
| Exemestane oral | PMID 14671195, 15752382 | Food/formulation and population effects require review |
| Oxandrolone oral | PMID 4729902, 26017381 | Assay validation alone is not a population PK model |
| Stanozolol oral | PMID 2325376 | Urinary detection data are insufficient for plasma modeling |
| Stanozolol injectable | PMID 17348894 | Equine evidence is not a validated human model |
| Oxymetholone oral | PMID 12101054 | Human PK lead; full parameter extraction pending |

PubMed-indexed searches were performed for each priority group. Ten complementary Europe PMC queries, dates, result counts and source identifiers are stored in `data/research/europe-pmc-search.json`. These are discovery records, not a completed systematic review. Further work must screen relevant full texts rather than infer values from search snippets.

Reuse permissions, parameter-level uncertainty, model fit reproduction, independent validation and personalized accuracy remain unresolved. No formulation is currently labeled a quantitative population model in the app.
