# Implementation status — 9 September 2026

This is the first development increment. The original four-milestone plan is **not complete**, and public-release gates have not passed.

## Implemented

- pnpm TypeScript workspace, React/Vite frontend, Fastify API, Drizzle schema, PostgreSQL migrations and development-only embedded PostgreSQL.
- Better Auth email registration, verification, sign-in and recovery; cookie sessions; configurable Google/Apple provider wiring.
- Account-owned workspace, records, revisions, documents and exports. Origin checks protect API writes. Identifier changes do not grant access to another account's records.
- Explicit phase activation/completion; phase creation, copying, archiving, reordering and item editing.
- Shared daily, weekday, calendar-interval, elapsed-hour and as-needed scheduling; unequal time-slot amounts; mass/volume conversion; package consumption estimates.
- Today agenda, administration entry/backdating, skip/retract/edit, immutable saved snapshots and chronological history.
- Health entry, lab PDFs, notes, configurable marker rows, original units/ranges and basic trends. Latest health-editing changes need browser regression checks.
- Worker-based relative Plotter, independent scenarios, complete recorded-dose loading, planned/combined modes, event carryover, comparison, visible references, dose markers and numerical metrics. Saved scenarios and CSV/JSON/PNG/print exports.
- Versioned formulation coverage records. Three testosterone formulations currently expose limited-evidence relative models. Other audited-priority formulations remain tracking-only pending parameter review.
- A 65-row spreadsheet candidate, checksum and change report. Ten Europe PMC query records. Raw full-text research downloads remain local and untracked.
- Independent SciPy ODE verification script and recorded numerical results.
- IndexedDB pending-write queue, foreground retries and service-worker shell/push handlers. Full offline correctness is not yet verified.
- Initial reminder worker and Web Push subscription routes. These have not been delivery-tested.
- Preview-first import UI, duplicate-source tracking and explicit legacy administration mapping. Import coverage is incomplete.
- Docker configurations, CI definition and synthetic browser tests.
- Promotional copy and decorative login content removed; the minimal product-copy rule is recorded in AGENTS.md.

## Verification actually observed

| Check | Result | Scope / limitation |
| --- | --- | --- |
| TypeScript | Passed | Final publication check |
| Production web build | Passed | Includes health/import changes and smaller chart imports; chart chunk still exceeds the 500 kB warning threshold |
| Domain/API/import tests | 20 passed | Final publication check; five scheduling tests are also registered through a fixture import and should be deduplicated |
| SciPy reference | Passed, four synthetic cases | 3,040 samples per case; maximum absolute error below 9e-12 mg/L; numerical correctness only |
| Desktop Chromium | Passed | Registration, verification, onboarding, custom item, activation, logging, reload, two plot scenarios and overflow check |
| Firefox | Passed | Same workflow |
| WebKit | Final run failed | Workflow reached the chart, but the page-error assertion caught a sync access-control error. Earlier run passed; investigate this intermittent failure before release. Not a real iPhone test |
| Mobile Chromium | Passed | Final run, Pixel 7 emulation; not a real Android device test |
| Docker engine | Unavailable | Compose services have not started locally |
| Embedded database persistence | Passed | Synthetic data survived close/reopen; a second open was rejected by the process lock. Earlier interrupted synthetic database files remain retained |

The existing `.local/postgres` directory contains retained interrupted test data. For further tests use a new `LOCAL_DATABASE_PATH` under `.local`, then run the persistence check before reusing the database. Do not delete the retained files or point multiple API processes at one embedded database.

## Next development tasks, in order

1. **Complete foundation verification.** Diagnose the intermittent WebKit sync access-control error observed during the final run. Extend persistence checks to startup failure paths and separate processes. Ensure failure paths release process locks. Expand browser coverage beyond the basic workflow. Replace duplicate test registration with a standalone fixture module.
2. **Verify offline behavior.** Test the production service worker, reload/restart while offline, ordered create/edit/undo, duplicate completions, two tabs/devices, conflicts and account switching. Fix deferred logout/session revocation and stale optimistic state. Provide explicit conflict resolution and pending-change export.
3. **Complete migration.** Map the original export's actual `created_at` and nested `data` fields; preserve symptom values, BP, notes, lab panels and protocol settings. Handle multiple source profiles without source-ID collisions. Make phase-import retries idempotent. Verify record counts, timestamps and attachments against synthetic legacy fixtures. Do not convert checklist-only entries to known doses.
4. **Finish planning workflows.** Add weekly navigation and print layout, planned-phase previews, readable recurrence labels, dose-basis conveniences, pill/package controls, injection-site rotation, quick-action ordering and durable drafts across navigation/restarts. Verify treatment of earlier schedule versions after active-plan edits.
5. **Finish health and history.** Add server-side date/type/search filters, paginated health data, irregular-time-aware trends, panel comparison, explicit unit presentation, attachment cleanup/replacement and edit-history UI. A 100-record cache is not complete historical coverage.
6. **Finish Plotter interactions.** Add arbitrary event editing, multi-time/weekday schedule editing, phase markers, compatible analyte grouping, measured lab overlays, sensitivity analysis, defined steady-state/washout metrics and robust CSV quoting. Ensure changing formulation cannot silently reuse incompatible parameters. Keep unknown past adherence separate from explicit reconstructions.
7. **Complete the scientific audit.** Finish formulation-specific extractions for nandrolone, hCG, anastrozole, exemestane, oxandrolone, stanozolol and oxymetholone. Record populations, routes, doses, units, parameter uncertainty and reuse terms. Independently reproduce supported source models and compare against held-out/published observations. Enable absolute predictions or calibration only when justified.
8. **Finish reminders.** Implement and test snooze/skip/taken actions, schedule-edit/time-zone reconciliation and durable dispatch/retry behavior. Test browser support on real devices. Keep reminder names private by default.
9. **Harden accounts and operations.** Verify OAuth setup, secure linking, recovery, revocation, account deletion including files, session expiry and rate limits. Add optional passkeys. Review logs, storage encryption, retention, support contact and documented deletion behavior.
10. **Validate deployment.** Pin container/runtime versions, run Compose, exercise PostgreSQL migration upgrades, add automated encrypted backup/restore and test restoration. Verify HTTPS, cookies, CSP and push. Measure cached Today and large-history/scenario performance on documented devices.

Optional inventory ledgers, scoped MCP access, sharing, OCR, native apps and monetization remain outside this increment.
