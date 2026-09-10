# Implementation status — 10 September 2026

This is the first development increment. The original four-milestone plan is **not complete**, and public-release gates have not passed.

## 10 September: production offline startup

- Cached workspace/history queries run while offline, with an explicit missing-cache message. Invalid local identity data no longer breaks startup; an online signed-out response removes the cached account selector.
- The build generates a content-versioned service worker with every emitted app asset, including lazy Plotter and simulation worker files. API responses and private documents are excluded from shell caching. Activation deletes only CycleTracker shell caches, and the worker does not force a new version onto an open page.
- Cached reads and API requests check account identity, including a response arriving after the account selector changed. A missed reconnect event is recovered by a connectivity-state check, without recurring network requests while connectivity is unchanged.
- Production Chromium and mobile Chromium: offline tab close/reopen, reload, draft restoration and reconnect passed. Production Firefox: offline reload and reconnect passed after fixing missed connectivity events. Firefox offline tab reopening is still unverified with the final fix.
- Windows WebKit: offline navigation reports an internal error. This remains an explicit expected failure in the production test; it is not counted as supported offline behavior. Other WebKit workflow tests remain separate.
- Validation for this increment: build/typecheck, 20 domain/API/import test executions and all 16 development-browser regressions passed. The production offline suite had three successful workflows plus the Windows WebKit expected failure.
- Full browser-process restart, storage eviction, service-worker upgrades across deployed versions, and real Android/iOS tests remain open. Local preview uses production frontend assets with a synthetic development API; this is not Docker or live deployment evidence.

## 10 September: pending changes

- Pending operations now have transactional insertion order, instead of UUID order. Existing queues are migrated by record revision because their original insertion times were not saved.
- Sync drains edits added while a request is in flight and serializes work per account, including across tabs where Web Locks are available. The API checks the queued owner against the current session before any write.
- Offline drafts remain visible. Pending changes can be inspected, exported or retried. A failed record's local edits can be explicitly discarded together; unrelated drafts and server records remain unchanged.
- Offline sign-out now requires reconnection so the server session can actually be revoked. A deferred offline logout flow remains future work.
- Build/typecheck and 20 domain/API/import test executions passed. Twelve browser checks passed across Chromium, Firefox, WebKit and mobile Chromium, covering revision ordering after reload, conflicts, in-flight additions, account isolation, selective discard, and offline logging/reconnection in the running app.
- WebKit's earlier sync error did not recur in two full runs. This does not establish production offline restart, multi-device correctness, or real-device Safari support.

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
| WebKit | Passed on 10 September | Workflow and queue regressions; earlier sync error did not recur in two full runs. Not a real iPhone test |
| Mobile Chromium | Passed | Final run, Pixel 7 emulation; not a real Android device test |
| Docker engine | Unavailable | Compose services have not started locally |
| Embedded database persistence | Passed | Synthetic data survived close/reopen; a second open was rejected by the process lock. Earlier interrupted synthetic database files remain retained |

The existing `.local/postgres` directory contains retained interrupted test data. For further tests use a new `LOCAL_DATABASE_PATH` under `.local`, then run the persistence check before reusing the database. Do not delete the retained files or point multiple API processes at one embedded database.

## Next development tasks, in order

1. **Complete foundation verification.** Continue WebKit regression coverage. Extend persistence checks to startup failure paths and separate processes. Ensure failure paths release process locks. Replace duplicate test registration with a standalone fixture module.
2. **Verify offline behavior.** Resolve Windows WebKit offline navigation and verify real-device support. Test full browser-process restart, storage eviction, worker upgrades, duplicate completions and concurrent tabs/devices. Add a deferred logout flow and field-by-field conflict comparison/reapplication. Cached startup, queue ordering, draft export and explicit discard are implemented; full offline release gates remain open.
3. **Complete migration.** Map the original export's actual `created_at` and nested `data` fields; preserve symptom values, BP, notes, lab panels and protocol settings. Handle multiple source profiles without source-ID collisions. Make phase-import retries idempotent. Verify record counts, timestamps and attachments against synthetic legacy fixtures. Do not convert checklist-only entries to known doses.
4. **Finish planning workflows.** Add weekly navigation and print layout, planned-phase previews, readable recurrence labels, dose-basis conveniences, pill/package controls, injection-site rotation, quick-action ordering and durable drafts across navigation/restarts. Verify treatment of earlier schedule versions after active-plan edits.
5. **Finish health and history.** Add server-side date/type/search filters, paginated health data, irregular-time-aware trends, panel comparison, explicit unit presentation, attachment cleanup/replacement and edit-history UI. A 100-record cache is not complete historical coverage.
6. **Finish Plotter interactions.** Add arbitrary event editing, multi-time/weekday schedule editing, phase markers, compatible analyte grouping, measured lab overlays, sensitivity analysis, defined steady-state/washout metrics and robust CSV quoting. Ensure changing formulation cannot silently reuse incompatible parameters. Keep unknown past adherence separate from explicit reconstructions.
7. **Complete the scientific audit.** Finish formulation-specific extractions for nandrolone, hCG, anastrozole, exemestane, oxandrolone, stanozolol and oxymetholone. Record populations, routes, doses, units, parameter uncertainty and reuse terms. Independently reproduce supported source models and compare against held-out/published observations. Enable absolute predictions or calibration only when justified.
8. **Finish reminders.** Implement and test snooze/skip/taken actions, schedule-edit/time-zone reconciliation and durable dispatch/retry behavior. Test browser support on real devices. Keep reminder names private by default.
9. **Harden accounts and operations.** Verify OAuth setup, secure linking, recovery, revocation, account deletion including files, session expiry and rate limits. Add optional passkeys. Review logs, storage encryption, retention, support contact and documented deletion behavior.
10. **Validate deployment.** Pin container/runtime versions, run Compose, exercise PostgreSQL migration upgrades, add automated encrypted backup/restore and test restoration. Verify HTTPS, cookies, CSP and push. Measure cached Today and large-history/scenario performance on documented devices.

Optional inventory ledgers, scoped MCP access, sharing, OCR, native apps and monetization remain outside this increment.
