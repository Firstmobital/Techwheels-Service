# ACCOUNTS-002: Finance Reporting — Expenses, Revenue and Reports

**Plan ID:** ACCOUNTS-002  
**Created:** 2026-11-25  
**Last Updated:** 2026-11-26  
**Priority:** HIGH  
**Owner:** Accounts + Platform Team (approvers: Finance head, Accounting owner, Engineering owner)  
**Status:** In Progress (`IP`). The user approved conditional phased implementation on 2026-11-25. Approved application work is on `main` (consolidation merge `31fd5b0a`; web publication `779fb2f4`). That is not plan completion, signed-in production verification, or database execution. Database migrations DBL-0101 and DBL-0102 remain PROPOSED and unapplied. Activities owned by ACCOUNTS-001 and BUSY-001, financial-year implementation and any invoice-key redesign remain pending or unapproved. The temporary `integration/accounts-002` branch is integrated; it is not required for ongoing development.  
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

**Implementation status (2026-11-26):** conditional phased implementation approved; application source published on `main` with production-schema fallbacks; database change sets not applied; signed-in workflows not verified (see Consolidation and release status and Implementation Record).  
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
| **Implementation** | In progress on `main`. Approved security, accuracy and reporting activities implemented; isolated-database verification done; web source published; migrations PROPOSED; release prerequisites, owner-plan activities and unapproved items pending | Consolidation and release status; Implementation Record |
| Runtime verification | Isolated runtime done on synthetic data (second pass); read-only production API probes recorded 2026-11-26; signed-in page workflows and hosted Auth settings not verified | [Test matrix §3](../evidence/ACCOUNTS-002_TEST_MATRIX.md) |
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

## Approved Decisions and Implementation Record (2026-11-25 IST)

**Approval.** On 2026-11-25 the user gave explicit conditional approval for phased implementation of ACCOUNTS-002, with the decisions below. Approval does not cover financial-year implementation, a material invoice-key redesign, voucher-series changes, activities owned by ACCOUNTS-001 or BUSY-001, expense or manual revenue registers, production changes, publication or deployment. Status vocabulary: Implemented-local (code or migration in the repository, checked on an isolated database or by unit-level execution), Pending, Blocked, Owned elsewhere, Not approved.

### Approved decisions
| Decision | Approved | Implemented as |
|---|---|---|
| PD-14 revenue | Invoice-level revenue with the GST actually charged; cancelled apart; no guessing | `src/lib/revenue/invoiceRevenue.ts`, report "Invoice Revenue (Finance basis)" |
| PD-15 access | Dedicated Finance access, controlled write paths | Migration `20261125140000` (DBL-0101, PROPOSED) |
| PD-17 branch | Assigned branches plus explicit all-branch right | Same migration: dealer-code scope and module `finance_all_branches` |
| PD-18 invoice identity | Inspect DMS evidence; prevent silent overwrite | Evidence below; migration `20261125141000` (DBL-0102, PROPOSED); key redesign not done |
| PD-19 bank fields | Protect bank name, account number, IFSC | Same migration plus `employeeBank.ts` and three callers |
| PD-20 financial year | Evaluate automatic handling; design only | Design section below; nothing implemented |
| Payroll reporting | Gross, deductions, net payable and employer cost kept apart | "Cost Summary" tab; employer cost shown as not available |
| Busy | Busy stays the accounting authority; get reconciliation evidence | No Busy extract available; blocked |

### Activity status
| ID | Owning plan | Status | Evidence |
|---|---|---|---|
| 1.1, 1.2 | ACCOUNTS-002 | Implemented-local (approval and decisions recorded here and in the decision log) | Decision log §F |
| 1.3 | ACCOUNTS-002 | Partly done: DMS evidence from the local full-database dump (aggregates only). Busy extract and Sales series list unavailable: Blocked | EV-054 |
| 1.4, 1.5 | ACCOUNTS-002 | Implemented-local: scratch database from the committed snapshot; baseline findings from the second pass reused, not re-run before the change. A maintained disposable environment is still pending | EV-043 |
| 2.1 | ACCOUNTS-002 (Accounts page part: ACCOUNTS-001) | Implemented-local: report loaders raise a visible notice at the 5,000-row cap; new loaders read to completion or fail | Test matrix §4 |
| 2.2, 2.3, 2.6 | ACCOUNTS-002 | Implemented-local: invoice-level net, GST, cancelled apart, flagged invoices, headline equals detail | EV-053 |
| 2.4 | ACCOUNTS-002 | Blocked: no business authority identifies the hard-coded advisor names; left unchanged (PD-23) | — |
| 2.5 | ACCOUNTS-002 | Done: web-mobile assessment below | — |
| 2.7 | ACCOUNTS-002 | Implemented-local: replaced invoices preserved by trigger; key redesign Not approved | EV-052 |
| 3.1 | ACCOUNTS-002 | Implemented-local: caller inventory in the audit baseline §4 | Baseline §4 |
| 3.2, 3.4 | ACCOUNTS-002 | Implemented-local, verified on the isolated database; not applied anywhere else | EV-052 |
| 3.3 | ACCOUNTS-002 | Partly done: separation at the database layer (reading modules, explicit all-branch right). No new report-module split in the UI until roles are mapped (PD-21) | — |
| 3.5 | ACCOUNTS-002 | Implemented-local (migration, RPCs, three callers) | EV-052 |
| 3.6 | ACCOUNTS-002 | Implemented-local (same migration) | EV-052 |
| 4.1 | ACCOUNTS-002 | Implemented-local: `canonicalReportBranch` with an explicit Unmapped bucket, used by the new report and payroll cost. Existing reports unchanged | EV-053, EV-056 |
| 4.2 | ACCOUNTS-002 | Implemented-local: read-only Cost Summary tab | EV-056 |
| 4.3 | ACCOUNTS-002 | Done (app): 49 registered reports (39 + 10 Performance, PD-26 2026-11-26); catalogue defaults in `reportCatalogue.ts`; harness PASS | EV-062, EV-063 |
| 4.4 | BUSY-001 | Owned elsewhere: no separate authorization found; pending | — |
| 4.5 | ACCOUNTS-002 | Partly done: internal invoice-grain versus job-card-grain comparison in the new report. Comparison to Busy: Blocked (no extract, tolerance or sign-off) | EV-053 |
| 4.6 | ACCOUNTS-002 | Implemented-local: lineage and source mapping updated | Lineage CSV |
| 4.7 | ACCOUNTS-001 | Owned elsewhere: pending | — |
| 5.1 | ACCOUNTS-002 | Implemented-local: financial-year inventory below | — |
| 5.2, 5.3 | ACCOUNTS-002 | Design only. Implementation Not approved; Accounting sign-off pending | EV-055 |
| 6.1 | — | Excluded | — |

### Implementation by commit
| Commit | Content | Files | Activities | Checks run |
|---|---|---|---|---|
| `b52c1e83` | Two PROPOSED migrations, paired read-only checks, ledger rows DBL-0101 and DBL-0102 | `supabase/migrations/20261125140000_finance_data_access_hardening.sql`, `supabase/migrations/20261125141000_psf_invoice_overwrite_audit.sql`, `supabase/sql_checks/20261125140000_finance_data_access_hardening_checks.sql`, `supabase/sql_checks/20261125141000_psf_invoice_overwrite_audit_checks.sql`, `docs/shared/reference/DB_CHANGE_LEDGER.md` | 3.2, 3.4, 3.5, 3.6, 2.7 | Applied to a disposable scratch PostgreSQL only; paired checks and access matrix run there (test matrix §4) |
| `f573fae4` | Bank-field callers moved to the gated RPCs | `src/lib/api/employeeBank.ts`, `src/lib/api/payroll.ts`, `src/pages/SettingsPage.tsx`, `src/pages/SATrackerPage.tsx` | 3.5 | `tsc` and ESLint on changed files; not run against a database with the RPCs (page level NOT RUN) |
| `b1034ea9` | Invoice-level revenue and report, row-cap notice, branch helper, payroll Cost Summary, harnesses | `src/lib/revenue/invoiceRevenue.ts`, `src/lib/revenue/invoiceRevenueSource.ts`, `src/pages/reports/revenue/InvoiceRevenueFinanceReport.tsx`, `src/pages/reports/revenue/index.ts`, `src/pages/reports/types.ts`, `src/lib/reportQueries.ts`, `src/pages/ReportsPage.tsx`, `src/lib/branches.ts`, `src/lib/payroll/costSummary.ts`, `src/pages/payroll/PayrollCostTab.tsx`, `src/pages/PayrollPage.tsx`, `scripts/invoice-revenue.harness.ts`, `scripts/payroll-cost-summary.harness.ts`, `package.json` | 2.1, 2.2, 2.3, 2.6, 4.1, 4.2, 4.3 (partial), 4.5 (internal) | Function-level harness runs through the TypeScript compiler (named npm commands not executed); `tsc` and ESLint on changed files |
| `e8a97700`, `321ed3fb` | Plan, decision log, test matrix, evidence CSVs, tracker, index, change log, caller inventory | ACCOUNTS-002 plan and evidence files, web tracker and index, `docs/shared/active/CHANGE_LOG.md` | 1.1, 1.2, 3.1, 4.6, 5.1 to 5.3 | `docs:validate`, `docs:validate:health` |

### Approved decisions compared with the achieved implementation
| Decision | Achieved locally (isolated verification only) | Not achieved or exception | Open record |
|---|---|---|---|
| PD-14 revenue | Invoice-level net with actual GST, cancelled apart, flagged invoices, headline equals detail, comparison with the existing method (function level) | Page render not run; not reconciled to Busy; same-day invoices that an import replaced are not counted (PD-24); existing reports still use the flat 18% | PD-11, PD-24 |
| PD-15 finance access | Database-level read and write control on revenue, invoice and warranty tables; module-gated RPCs | No UI-level separation of finance and operational report rights; production role mapping not done; not applied anywhere governed | PD-21 |
| PD-17 branch isolation | Assigned-branch and explicit all-branch scope in the policies | **Not fully satisfied.** The platform-wide administrator bypass remains and every administrator automatically receives every active module, including `finance_all_branches`. All-branch finance access is therefore not explicit for administrators. Behaviour not changed in this work | PD-22 |
| PD-18 invoice identity | Evidence gathered; replaced invoices preserved by trigger (no irreversible loss); identical re-import and amendment log nothing | Replacement is still not blocked; both same-day invoices are not counted in totals; identity not resolved | PD-24 (DEFERRED by user 2026-11-25) |
| PD-19 bank fields | Bank columns unreadable to app users; RPC read and write paths; callers changed | Settings and SA Tracker read paths and service-role edge functions were not individually approved; page level not run; must be deployed together with the migration | PD-25, PD-21 |
| PD-20 financial year | Inventory and feasibility only | Neither option implemented or authorized | PD-20 |
| Payroll reporting | Read-only Cost Summary; employer cost shown as not available | UI not run; employer cost data does not exist | none |
| Busy | No ledger, no new posting path | Reconciliation to Busy blocked; real Busy import unverified | PD-11 |

### Invoice identity: what is and is not achieved
- Preservation of replaced invoice records: achieved (DBL-0102 trigger writes the replaced row; verified on the isolated database only).
- Prevention of silent overwrite: partly. The overwrite still happens, but it is no longer silent: the replaced row is kept and the Finance report states how many invoices were replaced in the period.
- Inclusion of every legitimate invoice in revenue totals: not achieved. Totals use the current row only.
- Complete invoice-identity resolution: not achieved; a key redesign is PD-24 and needs separate approval.
- Evidence: in the parts uploads of a private local full-database dump (2026-10-02), 27 of 2,649 job-card and invoice-date groups had more than one distinct invoice number, and 55 of 2,619 job cards had more than one invoice overall. Method: a local script read the dump and counted groups; no identifiers, amounts or customer data were printed or stored. Limits: it covers parts uploads, not the revenue table (an overwritten revenue row cannot be seen there); it is a point-in-time dump; it cannot be reproduced from the repository.

### Employee bank fields: authorized read paths
| Path | Who | Supported by approved scope and existing authority | Status |
|---|---|---|---|
| Payroll loader | `payroll` view | Yes: payroll workflows are approved | Supported |
| Settings employee list and export | `employees` view | Existing module right, preserved; not named in the approval | Unresolved (PD-25) |
| SA Tracker payout export | `sa_tracker` view | Existing behaviour, preserved; not named in the approval | Unresolved (PD-25) |
| Administrator | `is_admin()` | Existing platform authority; the designated account `admin@firstmobital.com` holding the Admin role has an approved unrestricted exception (verified EV-061); other administrators deferred, unchanged | PD-22 |
| Earnings-report edge functions | service role | Unchanged; recipients and content not audited | Unresolved (PD-25) |

### Completion levels
| Item | Authored | Committed | Isolated verification | Governed deployment | Production verification | Release complete |
|---|---|---|---|---|---|---|
| DBL-0101 access hardening | yes | yes (`b52c1e83`) | yes (access matrix, checks, re-run) | no | no | no |
| DBL-0102 invoice preservation | yes | yes (`b52c1e83`) | yes | no | no | no |
| Bank-field callers | yes | yes (`f573fae4`) | type-check and lint only | web source on `main` (`779fb2f4`); RPC fallback on current DB | signed-in pages not run | no |
| Invoice revenue and report | yes | yes (`b1034ea9`) | function level; page not run | web source on `main` | signed-in workflows not run | no |
| Payroll Cost Summary | yes | yes (`b1034ea9`) | function level; page not run | web source on `main` | signed-in workflows not run | no |
| Row-cap notice | yes | yes (`b1034ea9`) | logic level; page not run | web source on `main` | signed-in workflows not run | no |
| Financial-year change | design only | design recorded | feasibility on scratch only | not authorized | no | no |

### Release prerequisites (before any migration is applied to a governed environment)
1. Every legitimate user needs active `user_employee_links` with a dealer code for their branches. Without them, users with a reading module see no rows.
2. Head-office, Finance and payroll operators need the module `finance_all_branches`. Payroll earnings read `job_card_closed_data`; an operator without it would compute variable earnings from no rows.
3. Importers need matching scope or the all-branch right. Imports from other branches are denied.
4. Take a read-only list of current role assignments and grant the above before apply. Production assignments are not invented here.
5. Deploy the bank-field migration and the application callers (`employeeBank.ts`, payroll loader, Settings, SA Tracker) together: the old application breaks once the bank columns are restricted, and the new application breaks until the RPCs exist. Run the paired SQL checks and the access matrix on staging; refresh the metadata snapshot after apply; update ledger statuses with actual evidence.
6. Before applying DBL-0101 on a governed database: resolve the tracked findings in **Consolidation and release status** (dealer-code mapping, banking-path decisions, role mapping, staging verification). Publication of application source used risk-based approval on 2026-11-26 (`user_approved` in the disposition; not independent human review).
7. The pre-consolidation `npm run build` failure from a missing `isBillingRecordedForWaiver` export was fixed on the governance branch before merge (`bodyshopSettlement.ts` re-export).

### Publication blockers (historical snapshot, 2026-11-25 pre-consolidation)
Superseded for source publication by main-centered, risk-based governance (2026-11-26 consolidation; see **Consolidation and release status** and `docs/shared/evidence/publication_readiness_disposition.json`). Retained as audit evidence only.

Plain `npm run docs:impact` on a clean working tree analyses no files, and `publish:ready` then prints READY without looking at the unpushed commits; that is not a readiness proof. Measured on 2026-11-25 against the 12-commit local stack on `integration/accounts-002`: NOT READY.

| Blocker | Origin | Authority and action |
|---|---|---|
| Independent review required for application code, automation script, database truth, repository authority (`.instructions.md`), validation script, unmapped files and the two committed metadata refreshes | Repository rule applied to this change set | `repo_change_impact.mjs` and the disposition `reviews` (all pending); not performed; a self-check is not independent review |
| Ledger rows DBL-0101 and DBL-0102 are PROPOSED, not VERIFIED, so the four migration and check files block | Introduced here, correctly | Ledger rules 3 and 7; they stay PROPOSED until governed deployment and recorded check output |
| Disposition entry did not match the change set | Existing mechanism | `docs/shared/evidence/publication_readiness_disposition.json` updated; the mismatch blocker cleared when measured; reviews remain pending; refresh after remote integration |
| Three harness files reported unmapped (two new, plus a remote-only one that appears because of the unpushed-diff comparison) | Pre-existing classifier gap: the four existing `scripts/*.harness.ts` files are also unmapped because the classifier maps only `.mjs`, `.sh`, `.js`, `.py` under `scripts/` | Placement is correct per `docs/STRUCTURE_GUIDE.md` ("JS/TS test helpers and tooling -> scripts/"). Remaining action: extend the classifier pattern in `scripts/repo_change_impact.mjs` (not done: validator change out of scope) |
| `npm run build` fails | Pre-existing on 2026-11-25 `origin/main`: missing `isBillingRecordedForWaiver` export | Fixed before consolidation merge on the governance branch |
| Repo-wide lint reports 1,590 errors | Pre-existing; none in files changed here (changed files linted separately) | Unrelated |
| Remote divergence: local 12 ahead, 1 behind | Remote commit `91deea70` (Bodyshop floor, unrelated); a trial merge was clean | Resolved by consolidation merge `31fd5b0a` and subsequent `publish:safe` on `main` |
| Production role mapping, dealer-code links, administrator bypass (PD-21, PD-22), staging verification, coordinated database and application rollout, rollback plan | Release prerequisites above | Still open before DBL-0101 apply; see decision log §G |
| Publication authorization | User | Given 2026-11-26 for consolidated `main` publication (approval, not review) |

### Cross-plan dependencies
| Item | Owner | Existing owning record | State |
|---|---|---|---|
| Busy export-run log and duplicate-period warning (task 4.4) | BUSY-001 | BUSY-001 has no such task today; its open item is task 3.2 (real Busy import). Adding the log needs an amendment to BUSY-001 | Pending; not implemented here |
| Accounts payment-line load failure warning (task 4.7) | ACCOUNTS-001 | ACCOUNTS-001 has no such task today | Pending; not implemented here |
| Financial-year numbering and vouchers | ACCOUNTS-001 (DBL-0057, 0058, 0059, 0074 voucher objects) and BUSY-001 (`eligibility.ts` series) | Both plans keep ownership; ACCOUNTS-002 holds the design only | Not approved |
| Real Busy import verification | BUSY-001 task 3.2 | Open in BUSY-001 | Blocked; PD-11 |

### Web–mobile parity (task 2.5)
Impact: new web report ID and a visible notice at the report row cap. The mobile app keeps its own `reportQueries.ts` and report list. Mobile status: tracked separately; no mobile Finance report is required for this change. Owner: Engineering owner. Follow-up: decide whether the mobile report list should show the row-cap notice. Reason not done in the same change: no figure changes and no mobile counterpart screen for the new report. **Assessment 2026-11-25:** the mobile `reportQueries.ts` has the same 5,000-row cap without a notice (gap recorded, not changed); mobile has no invoice-revenue or payroll-cost report; mobile does not read employee bank columns (only service-role edge functions do); mobile DMS import writes `psf_revenue_dms` under the same import policy.

### Financial-year design (tasks 5.1 to 5.3, for separate approval)
**Inventory.** The year `26-27` is fixed in: `ACCOUNTS_VOUCHER_FY` and the receipt-number pattern in `src/lib/api/accounts.ts`; the Busy series `PV-S 26-27` and `EV-S 26-27` in `src/lib/busy/eligibility.ts`; the function `accounts_mechanical_next_voucher_no` (cutoff 2026-09-02, sequences `accounts_mechanical_voucher_rapp_2627_seq` and `..._japp_2627_seq`); `accounts_mechanical_reconcile_japp_sequence`; the CHECK constraints `accounts_mechanical_payment_lines_voucher_check` and `bodyshop_settlement_lines_voucher_check`; and the complaint ticket function. Issued numbers are immutable by trigger and unique by index. The Sales series list is not available.
**Options.** (A) Annual controlled change set before 2027-04-01: new sequences, function, constraints and constants for 27-28. (B) Automatic: derive the year from the document date in IST, keep one counter row per series and year, and replace the pinned CHECK patterns with a generic pattern.
**Finalized automatic design (proposal for separate approval; nothing implemented).**
1. *Year rule:* financial year label = April–March of the **document date** in IST (`fy_label(date)`), e.g. 2027-03-31 → `26-27`, 2027-04-01 → `27-28`. A timestamp is converted to an IST date first (20:00 UTC on 2027-03-31 is 2027-04-01 IST → `27-28`; the UTC date would wrongly give `26-27`).
2. *Counters:* one row per (series, FY) in a counter table, advanced with `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the issuing transaction. Rolled-back transactions release their number (no gaps for committed numbers); sequences were rejected because they leave gaps on rollback.
3. *Number format:* `RApp/YY-YY/nnnn`, `JApp/YY-YY/nnnn` unchanged; the pinned CHECK patterns `^RApp/26-27/…` become `^(RApp|JApp)/[0-9]{2}-[0-9]{2}/[0-9]{4}$` (existing numbers stay valid, malformed ones stay rejected).
4. *Existing identifiers:* on introduction the counter for (series, `26-27`) is seeded from the current maximum issued number (or the sequence's last value), so numbering continues without reuse; issued numbers are never rewritten.
5. *Back-dated documents:* the year follows the document date, not the issue date, so a 2027-03-31 document keyed after rollover continues the `26-27` series while a 2027-04-01 document starts `27-28/0001`. Whether Finance accepts issuing into a closed year, or wants a period-lock block, is PD-10/PD-20 and part of the approval.
6. *Scope of the later change (if approved):* the voucher function, both pinned CHECKs, the reconcile function, `ACCOUNTS_VOUCHER_FY` and receipt pattern in `accounts.ts`, the Busy series helper (`PV-S`/`EV-S YY-YY`) in `eligibility.ts`, the hard-coded `2627` in the complaint-ticket function, and every reader of the two sequences. Busy series for each new year are still created by the accountant.
7. *Rollback of the change:* keep the old function and sequences until the first post-rollover issue is verified; the counter table is additive.

**Isolated feasibility (2026-11-25, scratch PostgreSQL 17, synthetic data, not committed; EV-060).** Boundaries: 2026-03-31 → 25-26, 2026-04-01 → 26-27, 2027-03-31 → 26-27, 2027-04-01 → 27-28, 2028-04-01 → 28-29; IST/UTC timestamp case as above. Compatibility: counters seeded at 123 and 7 continued as `RApp/26-27/0124` and `JApp/26-27/0008`. Rollover: `RApp/27-28/0001` and `0002` while a back-dated 2027-03-31 document took `RApp/26-27/0125`. Historical (25-26) and future (28-29) years start at 0001 independently. Counter isolation by series and year confirmed. Rollback: after a rolled-back issue the next number was the same one (no gap). Parallel: 8 sessions × 20 issues in one series and year gave 160 distinct numbers, `0001`–`0160`, none missing. Uniqueness: enforced by a primary key on the issued number. Not tested: the real function, the reconcile function, Busy import, production data.
**Considerations.** Busy needs the new series created by the accountant either way. Option B removes the yearly code change but touches the voucher function, both CHECK constraints, the reconcile function, the Busy series helper and every reader of the old sequences, and needs the series scheme (PD-02, PD-03, PD-16) settled first. Option A is smaller and is enough for 2027.
**Comparison with the annual alternative (option A).** A needs one controlled change set before 2027-04-01 each year (new sequences, function, CHECKs, constants, Busy series) and a person to remember it; a missed date mis-numbers or rejects receipts. B removes the yearly code change and the date risk, at the cost of a larger one-time change (touch list above), a counter table replacing sequences, and a decision on back-dated documents. Both need the Busy series created by the accountant and PD-02/03/16. The agent's earlier preference for A is withdrawn as a default: B is now the finalized design under review, A remains the fallback. **Neither is authorized or implemented.** Approval needed: Accounting owner and Engineering owner (PD-20).

## Consolidation and release status (2026-11-26)

At the user's instruction the ACCOUNTS-002 history was merged into `main` with the shared governance and Bodyshop work. ACCOUNTS-002 stays **IP**: being on `main` is not completion, production verification or database execution. Development is main-centered again (Transaction Framework).

- **Database:** DBL-0101 and DBL-0102 are **PROPOSED and not applied**. Publishing the files does not apply them (a migration deferred on `main` since 2026-11-16, DBL-0097, is still absent from the snapshot).
- **Compatibility with the current database (checked 2026-11-26):** employee bank reads and writes fall back to the direct columns when the RPC is missing; production returns `PGRST202` for `get_employee_bank_details` (read-only probe with the public key). The invoice replacement summary reports "not available" when its table is missing (production returns `PGRST205`). The invoice report's columns exist. Signed-in page workflows were not exercised in production.
- **Must be resolved before applying DBL-0101** (findings of an AI review; tracked, not defects of the current release): dealer-code mapping knows only three codes, so Tonk, Shahpura and other users would see no finance rows; bank columns stay directly writable where row policy allows (pre-existing); the invoice report would still say the source was read completely when row policy filters it; `finance_data_can_import` accepts view access; payroll employee loading fails if the bank RPC errors; apply order is application first.
- **Deferred decisions unchanged:** other administrators, banking-path restrictions, Finance UI permission separation, advisor exclusions, invoice identity redesign, report registration (PD-26), financial-year implementation (design only).

## Implementation Tasks

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

### B. Implementation (status as of 2026-11-26; on `main`, web source published; migrations not applied)
```
✅ 1.1 | Implementation approval recorded | Owner | 2026-11-25 | 2026-11-25 | Conditional approval; scope above
✅ 1.2 | Approved decisions recorded; unresolved listed | Eng | 2026-11-25 | 2026-11-25 | Decision log §F
🔄 1.3 | Collect inputs | Accounting owner | 2026-11-25 | - | DMS evidence done; Busy extract and Sales series list missing
✅ 1.4 | Isolated scratch database and fixtures | Eng | 2026-11-25 | 2026-11-25 | A maintained environment is still pending
✅ 1.5 | Baseline | Eng | 2026-11-25 | 2026-11-25 | Second-pass findings reused, not re-run
✅ 2.1 | Report completeness notice | Eng | 2026-11-25 | 2026-11-25 | Accounts part is 4.7 (ACCOUNTS-001)
✅ 2.2 | Invoice-level revenue with real GST | Eng | 2026-11-25 | 2026-11-25 | invoiceRevenue.ts; ST-04
✅ 2.3 | Cancelled invoices apart | Eng | 2026-11-25 | 2026-11-25 | ST-05
❌ 2.4 | Advisor exclusion | Business owner | - | - | No authority names these advisors (PD-23)
✅ 2.5 | Web-mobile parity assessment | Eng | 2026-11-25 | 2026-11-25 | Tracked separately
✅ 2.6 | Detail equals headline | Eng | 2026-11-25 | 2026-11-25 | ST-06
✅ 2.7 | Replaced invoices preserved | Eng | 2026-11-25 | 2026-11-25 | DBL-0102 PROPOSED; key redesign not approved
✅ 3.1 | Caller inventory | Eng | 2026-11-25 | 2026-11-25 | Baseline §4
✅ 3.2 | Access policies and checks | Eng | 2026-11-25 | 2026-11-25 | DBL-0101 PROPOSED; isolated only
🔄 3.3 | Finance versus operational separation | Eng + Finance head | 2026-11-25 | - | Database layer done; UI split waits for role mapping (PD-21)
✅ 3.4 | Access regression | Eng | 2026-11-25 | 2026-11-25 | Isolated; page-level not run
✅ 3.5 | Employee bank fields | Eng | 2026-11-25 | 2026-11-25 | Migration and three callers
✅ 3.6 | Branch scope model | Eng | 2026-11-25 | 2026-11-25 | Isolated; production mapping is a release prerequisite
✅ 4.1 | Branch attribution with Unmapped | Eng | 2026-11-25 | 2026-11-25 | New report and payroll cost
✅ 4.2 | Payroll cost summary | Eng | 2026-11-25 | 2026-11-25 | Employer cost not available
✅ 4.3 | Report catalogue fields | Eng | 2026-11-25 | 2026-11-26 | 49 registered reports (PD-26); Performance category wired
⏳ 4.4 | busy_export_runs | Eng (BUSY-001) | - | - | Owned by BUSY-001; no separate authorization
❌ 4.5 | Reconciliation to Busy | Finance head | - | - | Internal comparison done; Busy part blocked (PD-11)
✅ 4.6 | Lineage and mapping | Eng | 2026-11-25 | 2026-11-25 | Lineage CSV
⏳ 4.7 | Accounts load-error warning | Eng (ACCOUNTS-001) | - | - | Owned by ACCOUNTS-001
✅ 5.1 | Financial-year inventory | Eng | 2026-11-25 | 2026-11-25 | Design section
🔄 5.2 | Financial-year design | Eng + Accounting owner | 2026-11-25 | - | Design done; implementation not approved
🔄 5.3 | Feasibility and sign-off | Eng + Accounting owner | 2026-11-25 | - | Feasibility done; sign-off pending
➖ 6.1 | Expense / manual revenue register | - | - | - | Excluded
```

---

## Decisions Requiring Approval

**Decided by the user on 2026-11-25** (recorded in the Implementation Record and decision log §F): PD-14, PD-15, PD-17, PD-18 (safeguard only), PD-19, payroll reporting, Busy as the accounting authority, and PD-20 as design-only. Do not ask again.

**Still open** (options and recommendations in the [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md) sections B, E and F):

| Decision | Approver | Affects |
|---|---|---|
| PD-20 financial-year option (A annual change set, B automatic) and approval to implement | Accounting owner + Engineering owner | Tasks 5.2, 5.3; ACCOUNTS-001 and BUSY-001 numbering |
| PD-02, PD-03, PD-16 voucher series and Sales series list | Finance head / CA, Accounting owner | Financial year; collision check |
| PD-11 Busy reconciliation extract, tolerance, sign-off role | Finance head | Task 4.5 (Busy part) |
| PD-21 role mapping: who holds `finance_all_branches`, report-module split | Finance head + Engineering owner | Release of DBL-0101; task 3.3 (DEFERRED by user 2026-11-25) |
| PD-22 (designated administrator approved; other administrators deferred) platform admin bypass and default module grants versus the "no automatic all-branch for administrators" rule (PD-17 is not fully satisfied until decided) | Finance head + Engineering owner | PD-17 compliance; release of DBL-0101 |
| PD-23 advisor names excluded in `ReportsPage` | Business owner | Task 2.4 (DEFERRED by user 2026-11-25) |
| PD-24 invoice key redesign (a material change) | Finance head + Import owner | Beyond DBL-0102 |
| PD-25 bank-field read paths for Settings, SA Tracker and edge functions | Finance head + HR owner | Task 3.5 exception (DEFERRED by user 2026-11-25) |
| PD-13/07 expense or manual revenue register | Finance head | Excluded (6.1) |
| Publication of application source | User (given 2026-11-26) | Does not authorize database apply or plan completion |
| Database deployment, independent review before DBL-0101 | User, Finance and repository review process | Migrations and governed rollout |

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

1. 2026-11-25 IST, isolated runtime second pass: test matrix §3 (27 tests: PASS 5, FAIL 7, STATIC_ONLY 6, NOT_RUN 6, BLOCKED 3).
2. 2026-11-25 IST, implementation verification: test matrix §4 (27 tests: PASS 15, FAILED 2, STATIC EVIDENCE ONLY 3, NOT RUN 4, BLOCKED 3). Comparison with evidence 1: the security failures (ST-09, ST-24, ST-25) now pass on the isolated database after DBL-0101; ST-04 passes at function level; ST-07 passes for the safeguard. Still failing: ST-15 (catalogue incomplete) and ST-23 (financial year, not approved). Signed-in production workflows were not verified.
3. 2026-11-26, consolidation: application source on `main` at `779fb2f4`; read-only production probes (missing bank RPC, missing conflicts table, invoice report columns present) recorded in **Consolidation and release status**.

## Next Actions

1. User: review the release prerequisites, then decide PD-21 to PD-24 and the financial-year option; supply the Busy extract and Sales series list.
2. Engineering: map production roles; run signed-in spot-checks (payroll banking, Settings employees, SA Tracker export, invoice revenue report, existing authorized workflows); run the paired SQL checks and access matrix on staging before applying DBL-0101 and DBL-0102.
3. Owners: BUSY-001 (4.4) and ACCOUNTS-001 (4.7) decide whether to take their activities.

## Communication and Sign-Off

Conditional implementation approval: recorded 2026-11-25 (decision log §F). Application source publication on `main`: user authorization 2026-11-26 (disposition `user_approved`; not independent human review). Database apply and Finance or Engineering sign-off for DBL-0101: not given. Finance sign-off: Finance head / Accounting owner. Engineering sign-off: Engineering owner.

## Related Documentation

- [ACCOUNTS-001 plan](ACCOUNTS-001_MECHANICAL_BODYSHOP_ACCOUNTS_DESK_PLAN_2026-09-11.md)
- [BUSY-001 plan](../../operations/active/BUSY-001_BUSY_ACCOUNTING_EXPORT_PLAN_2026-09-10.md)
- [BUSY module truth](../../../../../web/modules/busy/README.md)
- [Database truth](../../../../../shared/reference/DATABASE_TRUTH.md)
- [Structure guide](../../../../../STRUCTURE_GUIDE.md)
- [Web plans index](../../../INDEX.md) and [web tracker](../../../IMPLEMENTATION_TRACKER.md)
- Evidence: [baseline and current state](../evidence/ACCOUNTS-002_AUDIT_BASELINE_AND_CURRENT_STATE_2026-11-25.md), [test matrix](../evidence/ACCOUNTS-002_TEST_MATRIX.md), [decision log](../evidence/ACCOUNTS-002_DECISION_LOG_2026-11-25.md)
