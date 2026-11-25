# ACCOUNTS-002: Finance Reporting — Expenses, Revenue and Reports

**Plan ID:** ACCOUNTS-002  
**Created:** 2026-11-25  
**Last Updated:** 2026-11-25  
**Priority:** HIGH  
**Owner:** Accounts + Platform Team (approvers: Finance head, Accounting owner, Engineering owner)  
**Status:** Proposed. Audit and implementation-readiness verification complete (static plus isolated runtime). Implementation not started (NS); awaiting explicit user approval.  
**Platform:** webversion  
**Category:** accounts  
**Routes touched (if approved):** `/reports`, `/accounts`, `/busy`, `/payroll`  
**Modules:** `reports`, `accounts`, `busy`, `payroll`  
**Depends on:** ACCOUNTS-001 (`/accounts`, RApp/JApp vouchers); BUSY-001 (`/busy` Busy export); IMPORT-001 (PSF Revenue DMS import)  
**Related (do not merge):** ACCOUNTS-001, BUSY-001, BODYSHOP-SETTLEMENT-001, BODYSHOP-RECOVERY-001, RBAC-001, SUPABASE-001  
**Audit baseline:** `main` @ `e7877341d40bacbc72f4314c2b66797da0519ea1` (= remote `main` at audit time). Schema authority: `supabase/backups/full_metadata.sql` (sha256 `0e036266…` at `e7877341`; a newer 2026-11-25 refresh, sha256 `7809bd2a…`, existed uncommitted during the audit and was committed afterwards as `98016773`; cited snapshot line numbers are for the `e7877341` blob and are 20 higher in the current tree). Deployed-commit parity unknown.  
**Classification:** state = implementation, scope = web, intent = active

---

## Executive Summary

Service already holds DMS invoice revenue, exports sales and receipt vouchers to Busy, and finalizes payroll monthly, but it has **no workshop expense capability**, reports revenue with a flat 18% divisor and a silent 5,000-row cap, leaves revenue source tables open to any signed-in user, and issues its own voucher series (`RApp`/`JApp`/`PV-S`/`EV-S` `26-27`) with a hard-coded financial year. This plan fixes the verified gaps with the smallest changes, reuses what exists, builds nothing speculative, and keeps Busy as the book of record (assumption until Finance decides OD-01).

Three layers stay distinct: **operational records** (DMS invoices, JCs, receipts, payroll), **management reporting** (`/reports` and proposed read-only views), **formal accounting** (Busy). Service posts nothing to a ledger.

**Fit-gap totals (21 handoff requirements):** REUSE 2 · CONFIGURE 0 · EXTEND 10 · BUILD 1 · DEFER 8.  
**Risk Level:** MEDIUM (access hardening and revenue arithmetic change visible behaviour)  
**Estimated Duration:** about 6–9 working days of engineering after decisions, in 5 phases; Phase 4 has a hard date (before 2027-04-01)  
**Rollback Strategy:** per phase (section "Rollout and recovery"); every phase ships separately and is reversible without data loss.

---

## Objectives

1. Make existing revenue and cost figures correct, complete or visibly incomplete, and traceable to a stated source and date basis.
2. Restrict revenue source data to authorised modules without breaking importers, triggers, payroll or mobile import.
3. Add only read-only reporting, a Busy export log, and reconciliation; no second source of truth.
4. Prepare the voucher series and financial-year rollover and resolve cross-system reference ownership with Finance.
5. Record every unresolved Finance decision with an approver, and show what can proceed without it.

---

## Status at a Glance

| Track | State | Evidence |
|---|---|---|
| **Audit and readiness verification (completed work)** | Done (static, then isolated runtime) | [baseline and current state](../evidence/ACCOUNTS-002_AUDIT_BASELINE_AND_CURRENT_STATE_2026-11-25.md), [fit-gap](../evidence/ACCOUNTS-002_FIT_GAP_2026-11-25.csv), [source mapping](../evidence/ACCOUNTS-002_SOURCE_TO_TARGET_MAPPING_2026-11-25.csv), [lineage](../evidence/ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv), [reports catalogue](../evidence/ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv), [test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md), [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md), [evidence index](../evidence/ACCOUNTS-002_EVIDENCE_INDEX_2026-11-25.csv) |
| **Implementation (pending)** | Not started; waits for approval and Finance decisions | Activity Tracker below |
| Runtime verification | Isolated runtime done on synthetic data (second pass); production and hosted Auth settings BLOCKED | [Test matrix §3](../evidence/ACCOUNTS-002_TEST_MATRIX.md) |
| Schema evidence limits | Committed and local snapshots agree on every cited `public` definition; neither proves production | [Audit baseline §3.2](../evidence/ACCOUNTS-002_AUDIT_BASELINE_AND_CURRENT_STATE_2026-11-25.md) |

---

## Completed Audit Work (verified statically at `e7877341`)

Key results; details and citations are in the evidence files above.

| ID | Finding | Evidence |
|---|---|---|
| G-01 | Revenue "ex-GST" is `round(gross/1.18)` per row; with the synthetic fixture the coded method yields 21,339 against a correct 22,000 | EV-020, lineage `LIN-R1` |
| G-02 | Reports stop silently at 5,000 rows | EV-019 |
| G-03 | `psf_revenue_dms`, `job_card_closed_data`, `service_invoice_data`, `warranty_*` allow select/insert/update/delete to any authenticated user | EV-015, 017, 018, 025 |
| G-04/05 | One `reports` module gates all reports; advisor names are excluded by hard-coded text | EV-006, EV-022 |
| G-06 | 10 Performance reports (incl. `jc-invoice-reconciliation`) are implemented but unregistered | EV-035 |
| G-07 | Voucher series and FY `26-27` are hard-coded in code, DB function and sequences | EV-008, 012, 013 |
| G-08 | No Busy export history; a period can be exported and imported twice | EV-007 |
| G-09 | Accounts swallows payment-line load errors | EV-036 |
| G-10 | Three branch label systems; unknown employee codes fall back to Sitapura | EV-009, 038 |
| G-11/12 | No expense capability; rate settings are not effective-dated | EV-034, 041 |
| G-13 | Runtime: a signed-in user with no module can read, change and delete rows of `psf_revenue_dms` and `job_card_closed_data` (and read/change `service_invoice_data` and `warranty_*`) | EV-044 |
| G-14 | Runtime: employee bank fields in `employee_master` are readable without any module; the payroll loader reads them directly | EV-049 |
| G-15 | Runtime: no public policy references branch; a Tonk user read other branches' revenue rows | EV-048 |
| G-16 | Runtime: two invoices for one job card and date overwrite each other across import batches (and fail within one batch) | EV-046 |
| G-17 | Runtime: a 2027-05-01 receipt still gets `RApp/26-27`; the voucher CHECK constraints and the complaint-ticket function also pin the year | EV-045 |
| OK | Verified at runtime on synthetic data: Accounts list RPCs and payroll finalize enforce module rights; `payroll_entries` is protected; `anon` reads no revenue rows; list RPCs cause no writes; payroll formula observed 28,250.25 / 20,000 | EV-044, 047 |
| OK (static) | Payroll month finalization, settlement corrections append-only | EV-023, 024 |

Test results after the second pass (27 tests, see [test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md) §3.1): PASS 5 · FAIL 7 · STATIC_ONLY 6 · NOT_RUN 6 · BLOCKED 3. The 7 FAIL rows are verified gaps in current behaviour that this plan addresses (ST-04, ST-07, ST-09, ST-15, ST-23, ST-24, ST-25).

---

## Context and Existing Owners (checked before creating this plan)

| Area | Existing owner | Boundary |
|---|---|---|
| `/accounts` receipts, `RApp`/`JApp` vouchers, gate pass | ACCOUNTS-001 | Not changed here. FY/series config and the Accounts load-error visibility are tracked here as tasks 4.7 and 5.x and executed with ACCOUNTS-001 sign-off |
| `/busy` Party and Invoice export | BUSY-001 | Not changed here. The export-run log (task 4.4) is executed under BUSY-001 and tracked here |
| Bodyshop settlement and recovery ledgers | BODYSHOP-SETTLEMENT-001, BODYSHOP-RECOVERY-001 | Reused as the model for append-only corrections; untouched |
| Revenue DMS import | IMPORT-001 | Importer behaviour unchanged; only table access (task 3.x) is regression-tested against it |
| Module rights and RLS | RBAC-001, SUPABASE-001 | Policy rewrite follows their conventions and DB protocol |
| Revenue reports, report access, finance cross-module view | none | New owner: ACCOUNTS-002 |

Handoff recommendations from Sales that do not fit Service are recorded with reasons in the [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md) section C.

---

## Proposal Detail

Assumptions are marked (A). Items trace to fit-gap rows (CAP-nnn) and evidence IDs.

### 1. What already exists (reuse, do not rebuild)
| Capability | Evidence | Use in this plan |
|---|---|---|
| DMS invoice revenue in `psf_revenue_dms` (invoice grain, status, cancellation, unique key, idempotent import RPC) | EV-015, EV-027 | Proposed finance revenue basis (CAP-009) |
| JC-grain `job_card_closed_data` mirror and report loaders | EV-017, EV-021 | Stays the operational basis for the 38 registered reports |
| Busy sales-voucher/party export with GST 5%/18% slabs, paise rounding, cancelled-invoice exclusion | EV-007, EV-008, EV-010 | Existing posting arrangement; unchanged |
| Accounts receipts, RApp/JApp vouchers with immutable numbers and a unique index; delete audited | EV-012, EV-013, EV-014, EV-037 | Unchanged; series inventory input to CAP-021 |
| Bodyshop settlement lines: append-only, reversal and write-off RPCs | EV-024 | Model for corrections (negative entries) |
| Payroll monthly finalize/unlock with security grant, snapshots | EV-023 | The one existing expense-side figure; source for CAP-008 |
| Page-load behaviour: list RPCs are STABLE and write-free | EV-032 | CAP-004 REUSE; standing rule |
| Row-level drilldown reports (Job Card Details; not-invoiced reports) | EV-035 | CAP-014 REUSE |
| `audit_logs`, module rights (`has_module_view/modify`) | EV-026, EV-006 | Governance building blocks |

**There is no workshop expense capability and no manual revenue register in Service (EV-034). The plan does not add either.**

### 2. What needs to change (EXTEND)
| Phase | Item | Change (smallest) | Fit-gap | Evidence |
|---|---|---|---|---|
| Phase 2 | Truncation and failure visibility | Shared loaders return `{rows, truncated, failedSources}`; reports show a banner and withhold totals when truncated (Accounts page part: task 4.7 under ACCOUNTS-001) | CAP-015 | EV-019, EV-036 |
| Phase 2 | Revenue arithmetic | Replace flat `÷1.18` per row with slab-aware/tax-field net amounts and invoice-level rounding; show old figure side by side for one release | CAP-009 | EV-020, LIN-R1 |
| Phase 2 | Status/cancellation rule | Apply the Busy rule (exclude "cancel") to revenue figures and show cancelled separately, after Finance confirms PD-14 | CAP-009 | EV-007, EV-021 |
| Phase 2 | Name-based exclusion | Replace `BLOCKED_SERVICE_ADVISOR_VALUES` with an inactive/flagged flag in `employee_master` or a settings row | CAP-016 | EV-022 |
| Phase 3 | Table access | Replace `USING (true)` policies on `psf_revenue_dms`, `job_card_closed_data`, `service_invoice_data`, `warranty_*` with module-based select; writes only via import RPCs/modules; split `reports` right into finance vs operational | CAP-016 | EV-015, 017, 018, 025 |
| Phase 4 | Branch/department map | One shared map for reports and Busy; "unmapped" bucket instead of silent Sitapura fallback | CAP-005 | EV-009, EV-038 |
| Phase 4 | Payroll cost view | Read-only monthly payroll cost (finalized vs provisional) by branch snapshot | CAP-008 | EV-023 |
| Phase 4 | Catalogue metadata | `ReportDefinition` gets owner/sources/dateBasis/status; register or retire the 10 Performance reports (`jc-invoice-reconciliation` first) | CAP-012, CAP-020 | EV-035 |
| Phase 4 | Busy export log | Table `busy_export_runs` (period, type, rows, content hash, actor, time) written only on explicit download; duplicate-period warning; revenue import batches logged | CAP-019, CAP-017 | EV-007, EV-026 |
| Phase 4 | Reconciliation (read-only) | JC grain vs invoice grain vs Busy export totals by month/branch; Busy ledger control stays PENDING | CAP-020 | EV-015, EV-017 |
| Phase 1 (decision), Phase 5 | References and FY | Inventory series; then single config for FY and prefixes; create FY 27-28 sequences before 2027-04-01 | CAP-021 | EV-008, 012, 013 |

### 3. What needs to be built (BUILD)
| Item | What | Fit-gap |
|---|---|---|
| Lineage records | Documentation only: lineage for priority lines, placed per `docs/STRUCTURE_GUIDE.md`; starts from [lineage](../evidence/ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv) | CAP-013 |

Conditional, only if Finance answers PD-13/PD-07: a minimal register for items Busy cannot hold. **Not planned** (DEFER: CAP-001/002/003/006/007/010/011/018).

### 4. Architecture
- Revenue read path: `psf_revenue_dms` (+ `busy_parts` slabs) → finance revenue view (read-only, `security_invoker`, module-gated) → reports; `job_card_closed_data` stays for JC analytics. Both labelled with source and date basis in the catalogue.
- No new write path from reports. Only explicit actions write: import RPCs (existing), Busy export log insert (new, on download).
- Booked truth stays in Busy; Service exports files. Control totals come from Busy extracts supplied by Finance.
- Second-source guard: no table duplicates revenue or expense values; new views derive from owners; old figures labelled until retired.

### 5. Affected components and data objects
- **Web:** `src/lib/reportQueries.ts`, `src/hooks/useReportData.ts`, `src/pages/ReportsPage.tsx`, `src/pages/reports/**` (index/types/registry), `src/pages/AccountsPage.tsx`, `src/lib/api/accounts.ts`, `src/lib/busy/**`, `src/pages/BusyAccountingPage.tsx`, `src/App.tsx` (module map), `src/lib/branches.ts`.
- **DB:** policies on `psf_revenue_dms`, `job_card_closed_data`, `service_invoice_data`, `warranty_*`; new `busy_export_runs` (+ policies, audit); new read-only finance views; FY sequences and `accounts_mechanical_next_voucher_no`; `modules`/`user_module_permissions` (new report rights).
- **Callers to protect:** DMS import (web, and mobile `import.tsx`), triggers `trg_psf_revenue_dms_assign_mechanical_vouchers` and `trg_refresh_job_card_closed_dms_revenue`, payroll variable earnings, Busy export, Accounts, bodyshop recovery.
- **Mobile:** per `CONTRIBUTING.md`, each web logic PR carries a Web-Mobile Parity section; a mobile Accounts/Busy/Reports counterpart was not located (only incidental text matches in `mobile/src`); confirm in Phase 2 (A).

### 6. Migration and backfill
- No data backfill for Phase 2. Phase 3: policy-only migration, no row changes. Phase 4: new table and views empty at creation; export log starts empty (history is not reconstructed). Phase 5: new sequences start at 0 for the new FY; existing numbers untouched (immutable by trigger).
- Repo-native handling: migrations in `supabase/migrations/` with `supabase/sql_checks/` companions; entries in `docs/shared/reference/DB_CHANGE_LEDGER.md` and `docs/db-changes.md`; refresh `supabase/backups/full_metadata.sql` and its manifest after apply (`npm run db:backup:metadata`) per `DATABASE_TRUTH.md`; run `docs:validate`; update `docs/DOCS_IMPACT_MATRIX.md` per `docs/shared/reference/SYNC_PROTOCOL.md`. This plan is registered in the web `INDEX.md` and `IMPLEMENTATION_TRACKER.md`. Admin operations, if any, use Edge Functions (`CONTRIBUTING.md`).

### 7. Regression checks
Before/after report snapshot on fixture F1 (ST-17); import/trigger/payroll/mobile-import run (ST-10); Busy workbook byte-compare for the same period before and after code changes (voucher rows unchanged); Accounts totals and receipt export unchanged; `npm run build`, `lint`, `mobile:typecheck`.

### 8. Rollout and recovery
- Ship Phase 2 behind a visible "new method" label with the old figure alongside for one month; revert by code rollback.
- Phase 3 in a staging project first; apply policy migration with a prepared rollback migration that restores prior policies; run ST-09/ST-10 before and after; keep a window where Finance can re-run reports.
- Phase 4 table/view additions are additive; rollback = drop objects (no data owned elsewhere).
- Phase 5: dry-run on disposable DB; never rewrite issued numbers; keep old sequences.
- Each phase is a separate deploy; no combined migrations. Production runs only after approval and staging pass.

### 9. Acceptance criteria (traceability)
| Change | Fit-gap | Tests |
|---|---|---|
| Visible truncation and failures | CAP-015 | ST-02, ST-03 |
| Revenue arithmetic and status | CAP-009 | ST-04, ST-05, ST-06, ST-17 |
| Name-based exclusion removed | CAP-016 | ST-17, ST-10 |
| Access hardening | CAP-016 | ST-09, ST-10 |
| Branch map | CAP-005 | ST-11, ST-12 |
| Payroll cost view | CAP-008 | ST-13, ST-14 |
| Catalogue metadata and dormant reports | CAP-012, CAP-020 | ST-15, ST-08 |
| Export log and import log | CAP-019, CAP-017 | ST-07, ST-18 |
| Reconciliation | CAP-020 | ST-08, ST-21 |
| Lineage records | CAP-013 | ST-16 |
| Series/FY | CAP-021 | ST-22, ST-23 |
| No page-load writes (standing rule) | CAP-004 | ST-01 |
| No second source (guard) | CAP-001/002/006/007/010 | ST-20 |
| Drilldown | CAP-014 | ST-06 |
Viewing never writes (ST-01), duplicates and retries (ST-07), branch/period (ST-11, ST-12), corrections and reconciliation (ST-08, ST-19, ST-21), existing callers (ST-10, ST-17).

### 10. Dependencies on Busy and Sales accounting
Busy remains the book of record (A). Control totals, tolerances and sign-off role come from Finance (PD-11). Sales series, GSTIN holder and any shared vendors/parts masters are needed from the Sales accounting work (PD-03, PD-04, PD-16). Until then: Service numbering is unchanged and ST-21/ST-22 stay BLOCKED. Shared costs are out of Service reports (PD-05).

---

## Implementation-Readiness Verification (second pass, 2026-11-25 IST)

**Method.** The committed schema snapshot was restored into a scratch PostgreSQL on loopback with synthetic users, modules and revenue/payroll rows, and the repository's own revenue and payroll functions were executed in Node on synthetic inputs (EV-043, 047). Nothing touched production. Limits: production permission assignments, hosted Auth settings (signup, confirmation, API exposure; EV-050), real data volumes and the real Busy import are not verified.

### Finance capability map (reuse, extend, build)
| Area | Existing capability (reuse) | Verified gap | Disposition | Owner plan |
|---|---|---|---|---|
| Revenue source | `psf_revenue_dms` invoice grain; `job_card_closed_data` JC grain | Formula 21,339 vs 22,000; same-JC/date overwrite; no status filter shown | EXTEND (CAP-009) | ACCOUNTS-002 |
| Revenue access | Module routes, Accounts and payroll RPC checks | Table policies open to every signed-in user | EXTEND (CAP-016) | ACCOUNTS-002 |
| Warranty | Eight warranty reports over `warranty_*` import tables | No finance-specific right; tables open to any signed-in user; amounts are read from imported row data (typed as strings in the report code) | EXTEND (CAP-016); value rules DEFER | ACCOUNTS-002 |
| Expenses | None (no register); payroll cost via finalized `payroll_entries` | No management payroll cost view; bank fields exposed | EXTEND (CAP-008, CAP-016); register DEFER | ACCOUNTS-002 |
| Busy export | `/busy` workbooks; parts invoice-key skip | No export log; real Busy import unverified | EXTEND (CAP-019) | BUSY-001 executes |
| Receipts | `/accounts` RApp/JApp vouchers | FY pinned; load-error swallowed | EXTEND (CAP-021, CAP-015) | ACCOUNTS-001 executes |
| Reports | 38 registered reports; drilldown | 5,000-row silent cap; no catalogue metadata; 10 unregistered; no reconciliation | EXTEND (CAP-012, 015, 020) | ACCOUNTS-002 |
| Lineage | none | Documentation | BUILD (CAP-013) | ACCOUNTS-002 |

### Scope
- **In scope:** CAP-004, 005, 008, 009, 012, 013, 014, 015, 016, 017, 019, 020, 021 as listed in the tasks below.
- **Out of scope:** an expense-entry register, a manual revenue register, shared-cost allocation, capitalisation, period-lock for non-payroll data, an in-app ledger or posting queue, any change to Sales systems.
- **Deferred pending Finance:** CAP-001, 002, 003, 006, 007, 010, 011, 018 (PD-13, PD-07, PD-05, PD-08, PD-06, PD-10).
- **Already established:** Busy is the book of record (assumption until PD-01), Service posts nothing to a ledger, existing voucher numbers are immutable, payroll lock stays as is.

### Readiness matrix
| Gate | Evidence and verification | Result | Remaining gap and dependency | Approval or access needed | Can proceed? |
|---|---|---|---|---|---|
| G1 Revenue permissions | Snapshot policies; isolated runtime matrix (EV-044) | ACTION REQUIRED | Replace open policies; caller inventory first (task 3.1) | PD-15 | Yes after PD-15 |
| G2 Warranty permissions | Same matrix; no warranty module exists | ACTION REQUIRED | Needs a finance or warranty right | PD-15 | Yes after PD-15 |
| G3 Revenue accuracy (formula) | Repository function executed: 21,339 vs 22,000 (EV-047) | ACTION REQUIRED | Slab-aware net and cancelled rule | PD-14 | Yes after PD-14 (build behind a label) |
| G4 Revenue completeness | Isolated import test (EV-046): retry idempotent PASS; same-JC/date overwrite FAIL | ACTION REQUIRED | Whether the DMS issues such pairs is UNVERIFIED | PD-18; DMS export files | Task 2.7 waits for data |
| G5 Report completeness | Catalogue (48 reports; 38 registered) | ACTION REQUIRED | Registry metadata; register or retire 10; reconciliation report | none beyond plan | Yes |
| G6 Expense and payroll | Payroll formula observed correct (EV-047); finalize enforced (EV-044); no register by design | PASS for calculation; ACTION REQUIRED for bank-field exposure | Task 3.5 | PD-19 | Yes after PD-19 |
| G7 Busy export controls | Static: invoice-key skip, series from DMS prefix; no export log; BUSY-001 task 3.2 shows no real import | ACTION REQUIRED; real import BLOCKED | Export log (4.4); Busy extract for reconciliation | PD-01, PD-11, Busy extract | Log yes; reconciliation blocked |
| G8 Financial-year rollover | Runtime: 2027-05-01 gets 26-27; CHECK constraints pin it (EV-045) | ACTION REQUIRED (dated 2027-03-31) | Single change set per year | PD-20, PD-02/03 | Design yes; apply after decisions |
| G9 Branch isolation | 0 branch policies; cross-branch read (EV-048) | ACTION REQUIRED (decision) | Choose scope model | PD-17 | After PD-15 |
| G10 Database and RLS evidence | Committed snapshot restored and exercised (EV-043) | PASS (captured structure) | Not production | Read-only production check if wanted | n/a |
| G11 Runtime verification | Isolated runtime done; page-level and production not run | PARTIAL; production BLOCKED (EV-050) | Hosted Auth settings, real roles | Read access to hosted settings | Planning yes |
| G12 Viewing causes no writes | List RPCs, isolated runtime | PASS (RPC level) | Page-level run in staging | none | Yes |
| G13 Module-gated RPCs | Isolated runtime | PASS | none | none | n/a |
| G14 Finance decisions | Decision package in the decision log | ACTION REQUIRED | PD-14, PD-15 are start blockers | Finance head | Waits |

Classification of other items: TECHNICAL DEBT: `validate_migrations_ci.mjs` ordering check cannot fail because it sorts first; unregistered Performance reports; hard-coded advisor exclusion. TRACKED WORK: BUSY-001 task 3.2 (real Busy import), ACCOUNTS-001 open ledger items. ARCHITECTURE CANDIDATE: in-app ledger, generic cost allocation (not proposed). OBSERVATION: the DMS import function disables and re-enables a trigger with DDL on every batch.

### Implementation-readiness recommendation
**Ready for approval of Phases 1–3 and the non-blocked parts of Phase 4**, subject to PD-14 and PD-15 (essential) and PD-19 (security, should not wait long). Phase 5 (FY and series) can be designed now and applied after PD-02, PD-03, PD-20; it has a hard date of 2027-03-15 (A) for completion. Reconciliation to Busy (ST-21) is blocked until Finance supplies an approved extract. No implementation has started and none is authorized by this document.

## Implementation Tasks (pending)

Status key: ⏳ pending, 🔄 in progress, ✅ done, ❌ blocked. Every row traces to a fit-gap item ([fit-gap](../evidence/ACCOUNTS-002_FIT_GAP_2026-11-25.csv)) and a test ID ([test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md)). Phases 1–5 run in order unless noted; no task starts before plan approval.

### Phase 1 — Decisions and baseline (no code)
- **1.1** Approve this plan. Gate for everything below.
- **1.2** Finance decisions PD-01..PD-20 (see Decisions; start blockers PD-14 and PD-15). Items: CAP-001/002/003/006/007/010/011/018 (DEFER rows).
- **1.3** Obtain Sales voucher series list, company GSTIN holder, and an approved Busy control extract (PD-16, PD-11).
- **1.4** Provision a disposable database restored from the schema snapshot with synthetic fixtures F1–F4; integrations disabled.
- **1.5** Run and record baseline tests ST-01..ST-07, ST-17 (before any code change). CAP-004.

### Phase 2 — Safety fixes (no schema)
- **2.1** Loaders return `{rows, truncated, failedSources}`; reports show a banner and withhold totals when truncated (CAP-015; ST-02, ST-03).
- **2.2** Slab-aware, invoice-level ex-GST arithmetic, old figure shown beside new for one release (CAP-009; ST-04, ST-17).
- **2.3** Cancelled-invoice rule aligned with the Busy transform, cancelled shown separately (CAP-009; ST-05). Needs PD-14.
- **2.4** Replace hard-coded advisor exclusion with a flag or setting (CAP-016; ST-17).
- **2.5** Web–Mobile Parity declaration in the PR; confirm no mobile counterpart (CONTRIBUTING.md).
- **2.6** Drilldown equals headline (CAP-014; ST-06).
- **2.7** After PD-18: confirm from DMS exports whether one job card can have two invoices on one date; if so, add the smallest fix (flag at import, or widen the key with the invoice number) with a regression test on the Busy and voucher triggers (CAP-009; ST-07).

### Phase 3 — Access hardening (migration)
- **3.1** Inventory every direct caller of the revenue tables (web, mobile import, edge functions, triggers). CAP-016.
- **3.2** Migration + paired `supabase/sql_checks` replacing `USING (true)` policies; DB ledger row; metadata refresh; staged first.
- **3.3** Split `reports` right into finance vs operational (parts/warranty) (PD-15).
- **3.4** Regression ST-09, ST-10, ST-26, ST-27 on the disposable database and staging.
- **3.5** After PD-19: restrict `employee_master` bank fields to payroll users (payroll-gated RPC or column privileges) and update the payroll loader in the same change (CAP-016; ST-24).
- **3.6** After PD-17: apply the chosen branch-scope model to the finance tables and test with a branch user (CAP-016; ST-25).

### Phase 4 — Reporting controls
- **4.1** Shared branch/department map with an "unmapped" bucket (CAP-005; ST-11, ST-12).
- **4.2** Read-only payroll cost view from finalized months, provisional months flagged (CAP-008; ST-13, ST-14).
- **4.3** Report metadata fields; register or retire the 10 Performance reports (CAP-012, CAP-020; ST-15).
- **4.4** `busy_export_runs` log written only on explicit download; duplicate-period warning; import batch log (CAP-017, CAP-019; ST-07, ST-18). Executed under BUSY-001.
- **4.5** Read-only reconciliation: JC grain vs invoice grain vs Busy export totals (CAP-020; ST-08; ST-21 stays blocked until controls exist).
- **4.6** Lineage records for priority lines under `docs/` per STRUCTURE_GUIDE (CAP-013; ST-16).
- **4.7** Accounts page: visible warning instead of silent `[]` on payment-line load failure (CAP-015; ST-03). Executed under ACCOUNTS-001.

### Phase 5 — References and financial-year rollover
- **5.1** Series inventory across Busy, Sales and Service; decision PD-02/PD-03 (CAP-021; ST-22).
- **5.2** One yearly change set: FY 27-28 sequences, the voucher function, the payment-line and settlement-line CHECK constraints, code constants (`accounts.ts`, `eligibility.ts`) and, with its owner, the complaint-ticket function; created before 2027-04-01 (A: target 2027-03-15); issued numbers untouched (ST-23; PD-20).
- **5.3** Dry-run in the disposable database and sign-off by the Accounting owner.

### Phase 6 — Conditional (not planned)
- **6.1** Any expense or manual revenue register. Only after PD-13 or PD-07 shows a need Busy cannot meet; requires a separate amendment to this plan.

---

## Activity Tracker

> Update this section as work progresses. Audit work is shown separately from implementation.

### A. Completed audit work
```
✅ A.1 | Baseline: repo, snapshot, worktree, parity | Eng | 2026-11-25 | 2026-11-25 | Evidence: audit baseline §1
✅ A.2 | Current-state audit: routes, APIs, tables, policies, reports | Eng | 2026-11-25 | 2026-11-25 | Audit baseline §2
✅ A.3 | Fit-gap (21) + source mapping (11) | Eng | 2026-11-25 | 2026-11-25 | EXTEND 10 / REUSE 2 / BUILD 1 / DEFER 8
✅ A.4 | Lineage: LIN-R1 revenue, LIN-E1 payroll | Eng | 2026-11-25 | 2026-11-25 | Synthetic values, calculated only
✅ A.5 | Acceptance tests ST-01..ST-23 and static results | Eng | 2026-11-25 | 2026-11-25 | Test matrix
✅ A.6 | Decision log and Sales-fit review | Eng | 2026-11-25 | 2026-11-25 | Decision log
✅ A.7 | Promotion to governed docs, index and tracker | Eng | 2026-11-25 | 2026-11-25 | This plan
✅ A.8 | Readiness verification: isolated runtime (access matrix, voucher FY, import, formulas) | Eng | 2026-11-25 | 2026-11-25 | Test matrix §3
✅ A.9 | Finance decision package and readiness matrix | Eng | 2026-11-25 | 2026-11-25 | Decision log §E; this plan
```

### B. Pending implementation
```
⏳ 1.1 | Plan approval | Owner | - | - | Gate
⏳ 1.2 | Finance decisions | Finance head / Accounting owner | - | - | PD-01..PD-20 (start blockers: PD-14, PD-15)
❌ 1.3 | Sales series list, Busy control extract | Accounting owner | - | - | Blocks ST-21, ST-22
⏳ 1.4 | Disposable DB + fixtures F1-F4 | Eng | - | - | Blocks all runtime tests
⏳ 1.5 | Baseline run ST-01..07, 17 | Eng | - | - | After 1.4
⏳ 2.1 | Truncation/failure visibility | Eng | - | - | CAP-015
⏳ 2.2 | Revenue arithmetic | Eng | - | - | CAP-009
⏳ 2.3 | Cancelled-invoice rule | Eng | - | - | Needs PD-14
⏳ 2.4 | Remove name-based exclusion | Eng | - | - | CAP-016
⏳ 2.5 | Parity declaration | Eng | - | - | CONTRIBUTING.md
⏳ 2.6 | Drilldown = headline | Eng | - | - | CAP-014
⏳ 2.7 | Same JC/date multi-invoice handling | Eng + Import owner | - | - | Needs PD-18 and DMS export evidence
⏳ 3.1 | Caller inventory | Eng | - | - | CAP-016
⏳ 3.2 | Policy migration + sql_checks + ledger | Eng | - | - | Staging first
⏳ 3.3 | Reports rights split | Eng + Finance head | - | - | PD-15
⏳ 3.4 | Access regression | Eng | - | - | ST-09, ST-10, ST-26, ST-27
⏳ 3.5 | Restrict employee bank fields | Eng + HR owner | - | - | PD-19, ST-24
⏳ 3.6 | Branch scope model | Eng + Finance head | - | - | PD-17, ST-25
⏳ 4.1 | Branch/department map | Eng | - | - | CAP-005
⏳ 4.2 | Payroll cost view | Eng | - | - | CAP-008
⏳ 4.3 | Report metadata + dormant reports | Eng | - | - | CAP-012/020
⏳ 4.4 | busy_export_runs | Eng (BUSY-001) | - | - | CAP-017/019
⏳ 4.5 | Reconciliation report | Eng | - | - | CAP-020
⏳ 4.6 | Lineage docs | Eng + Finance head | - | - | CAP-013
⏳ 4.7 | Accounts load-error warning | Eng (ACCOUNTS-001) | - | - | CAP-015
⏳ 5.1 | Series inventory + decision | Accounting owner | - | - | PD-02/03
⏳ 5.2 | FY/series config + FY27-28 | Eng | - | - | Before 2027-04-01
⏳ 5.3 | Dry-run and sign-off | Eng + Accounting owner | - | - | ST-22, ST-23
⏳ 6.1 | Conditional expense / manual revenue register (not planned) | Finance head | - | - | Only if PD-07/PD-13 show a need; needs plan amendment
```

---

## Decisions Requiring Approval

Full table with options and impacts: [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md) section B (PD-01..PD-20); the evidence-based decision package with options, consequences and recommendations is section E. Decisions on tax, legal, posting policy and period close belong to the Finance head or Accounting owner; none is made by this plan.

| Decision | Approver | Blocks |
|---|---|---|
| Approve this plan and phases | Owner of Service | Phase 1 |
| PD-14 revenue basis and GST-slab rule; cancelled treatment | Finance head | Phase 2 labels (task 2.3) |
| PD-15 access split | Finance head + Engineering owner | Phase 3 (task 3.3); also needed before Phase 2 start |
| PD-17 branch isolation | Finance head + Engineering owner | Task 3.6 |
| PD-18 same-JC/date invoices | Finance head + Import owner | Task 2.7 |
| PD-19 employee bank fields | Finance head + HR owner | Task 3.5 |
| PD-20 FY rollover mechanics | Accounting owner + Engineering owner | Phase 5 |
| PD-01/02/03/16 Busy role, series, FY | Finance head / CA, Accounting owner | Phase 5 |
| PD-11 reconciliation controls and sign-off | Finance head | ST-21 |
| PD-13/07 need for any expense or manual revenue register | Finance head | Phase 6 |
| PD-05, PD-08, PD-10 | Finance head / Accounting owner | CAP-006/007/018 (deferred) |

What can proceed before decisions: Phases 1.4–1.5, 2.1, 2.2 (labelled), 2.4–2.6, 3.1, 4.1–4.3, 4.6. What waits: 2.3 (PD-14), 3.3 (PD-15), 4.5 control match and 5.x (PD-02/03/11/16), any Phase 6 (PD-07/13).

---

## Dependencies and Prerequisites

Plan approval; disposable database with synthetic fixtures; Finance decisions above; Sales series list and Busy control extract; staging Supabase project for Phase 3; DB change protocol (`docs/shared/reference/DB_CHANGE_PROTOCOL.md`) and ledger for any migration.

## Risk Assessment

Tightening RLS may break importers or mobile paths that rely on open writes (mitigated by ST-10 and staged rollout). Changing revenue arithmetic changes reported figures — communicate and run side by side. FY rollover has a hard date (2027-04-01). Deployed code and DB may differ from this snapshot (parity unknown).

## Success Criteria

1. Every change in this plan has its tests in the [test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md) passing on the disposable database and recorded.
2. No report shows a total that is silently incomplete.
3. Revenue source tables are not readable or writable by users without the relevant module; importers, triggers, payroll and mobile import behave as before (ST-10, ST-17).
4. FY 27-28 vouchers can be issued without touching existing numbers (ST-23).
5. No second source of truth added (ST-20).

## Latest Evidence (retention: latest two)

1. 2026-11-25 IST, static audit at `e7877341`: test matrix §2 (PASS 1, FAIL 1, STATIC_ONLY 11, NOT_RUN 7, BLOCKED 3).
2. 2026-11-25 IST, isolated runtime second pass: test matrix §3 (combined 27 tests: PASS 5, FAIL 7, STATIC_ONLY 6, NOT_RUN 6, BLOCKED 3). Comparison with evidence 1: of the four static "defect indicated" rows, ST-04 and ST-09 are now observed failures (ST-02 and ST-03 remain static); ST-07 and ST-23 also fail at runtime; five new runtime findings were added (G-13 to G-17); no earlier static concern was disproved.

Task 1.5 (baseline run on a maintained disposable environment) remains pending; the second pass used a throwaway scratch database.

## Next Actions

1. **Approval gate:** the owner approves, revises or rejects this plan (task 1.1). Implementation stays NS until then.
2. Finance head answers PD-14 and PD-15 (start blockers), then PD-19, PD-17, PD-18.
3. On approval: provision the maintained disposable database (task 1.4) and record baseline tests (task 1.5), then start Phase 2.

## Communication and Sign-Off

Approval: Owner of Service (explicit, required before any implementation task starts; publication and deployment need separate authorization per `.instructions.md` Section 11). Finance sign-off: Finance head / Accounting owner. Engineering sign-off: Engineering owner. Sign-offs are recorded here when given; none exists yet.

## Related Documentation

- [ACCOUNTS-001 plan](ACCOUNTS-001_MECHANICAL_BODYSHOP_ACCOUNTS_DESK_PLAN_2026-09-11.md)
- [BUSY-001 plan](../../operations/active/BUSY-001_BUSY_ACCOUNTING_EXPORT_PLAN_2026-09-10.md)
- [BUSY module truth](../../../../../web/modules/busy/README.md)
- [Database truth](../../../../../shared/reference/DATABASE_TRUTH.md)
- [Structure guide](../../../../../STRUCTURE_GUIDE.md)
- [Web plans index](../../../INDEX.md) and [web tracker](../../../IMPLEMENTATION_TRACKER.md)
- Evidence: [baseline and current state](../evidence/ACCOUNTS-002_AUDIT_BASELINE_AND_CURRENT_STATE_2026-11-25.md), [test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md), [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md)
