# ACCOUNTS-002 Test Matrix

**Plan:** [ACCOUNTS-002](../active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md)  
**Created:** 2026-11-25 (IST)  
**Status:** Audit results recorded (static only). Implementation tests not run: no implementation has started.

## 1. Acceptance tests

All tests run only on a **disposable Supabase/Postgres instance restored from the schema snapshot with synthetic rows**, with WhatsApp, email, Drive upload and push edge functions disabled and no Busy connection. Expected values are hand-calculated literals (see `ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv`); they are expectations, not observed app results. Handoff test IDs (AT-nnn) are mapped for traceability.

### 1.1 Synthetic fixtures
- **F1 revenue (one branch, one month):** INV-A total 11,800.00 (labour net 10,000 @18%). INV-B total 5,250.00 (parts net 5,000 @5%). INV-C total 8,130.00 (labour 4,000 @18%, parts 1,000 @5%, parts 2,000 @18%). INV-D cancelled, total 2,360.00 (net 2,000). Plus INV-E dated the first day of the next month, total 1,180.00.
- **F2 payroll:** employees X, Y (finalized month) and Z (open month) as in `LIN-E1`.
- **F3 volume:** 5,200 JC rows, each total 1,180.00, one month, one branch.
- **F4 duplicates:** the F1 DMS file and the same F1 parts workbook loaded twice; the F1 period exported to Busy twice.
- **Users:** `viewer` (reports view only), `accounts` (accounts module), `outsider` (authenticated, no module), `admin`.

### 1.2 Tests
| ID | Maps to | Fit-gap | Steps | Expected | Role | Severity |
|---|---|---|---|---|---|---|
| ST-01 | AT-005 | CAP-004 | With row counts and `audit_logs`/sequence values recorded, open `/accounts`, `/busy`, `/reports/*`, `/bodyshop-recovery`, `/payroll` as `viewer` and `accounts`; wait for all loads; compare | Zero inserts/updates/deletes; sequences `accounts_mechanical_voucher_*_2627_seq` unchanged | viewer, accounts | High |
| ST-02 | AT-016 | CAP-015 | Load F3; open Daily Revenue and the dashboard KPI | Either full total 5,200,000 net, or a visible "truncated" banner and no total; never 5,000,000 as if complete | viewer | High |
| ST-03 | AT-016 | CAP-015 | Revoke select on one source (or force RPC error) then open Accounts and a revenue report | Visible warning naming the failed source; totals marked incomplete | accounts | High |
| ST-04 | AT-010 | CAP-009 | Load F1 (without D, E); read monthly revenue KPI | After fix: 22,000. Current code is expected to show 21,339 (record as observed) | viewer | High |
| ST-05 | AT-010 | CAP-009 | Add D and E; filter the F1 month | D excluded from revenue and listed as cancelled; E excluded from the month; month boundary uses IST dates | viewer | High |
| ST-06 | AT-015 | CAP-014 | Compare drilldown (Job Card Details) total with the headline for F1 | Equal | viewer | Medium |
| ST-07 | AT-004/AT-020 | CAP-019 | Load F4 twice; export Busy period twice | No duplicate rows; second DMS load reports 0 inserted/N updated; parts second load skips existing invoices; second Busy export warns "period already exported" with run id | admin | High |
| ST-08 | AT-021 | CAP-020 | Compare revenue by invoice (`psf_revenue_dms`) vs JC grain (`job_card_closed_data`) vs Busy workbook totals for F1 | Differences explained (cancelled, timing, rounding) or flagged; Busy ledger control PENDING | admin | High |
| ST-09 | AT-017 | CAP-016 | As `outsider`, select/insert/update/delete on `psf_revenue_dms`, `job_card_closed_data`, `service_invoice_data`, `warranty_*` | Select denied or filtered; writes denied | outsider | High |
| ST-10 | regression | CAP-016 | After any policy change run DMS import (web and mobile import), triggers (voucher assignment, JC mirror), payroll variable earnings, all registered reports as proper roles | Same results as before the change | admin, accounts, viewer | High |
| ST-11 | AT-006 | CAP-005 | Filter each branch and ALL on F1 spread across branches including an unmapped employee code | Branch totals sum to ALL; unmapped appears as its own bucket | viewer | Medium |
| ST-12 | period | CAP-005 | Filter this-month/last-month/custom around F1/E boundary in IST | Same rows as in ST-05 | viewer | Medium |
| ST-13 | AT-009 | CAP-008 | Payroll cost summary for F2 | Finalized total 48,250.25; Z shown provisional 7,500.00, excluded from the finalized total | payroll view | High |
| ST-14 | AT-012 | CAP-008/011 | Recompute open month after changing a rate; try recompute finalized month; unlock with and without reason | Open recomputes; finalized rejects; unlock needs reason and is logged | payroll modify | Medium |
| ST-15 | AT-013 | CAP-012 | List registry reports vs catalogue | All 48 present with owner/source/date basis; unregistered ones registered or retired | engineering | Medium |
| ST-16 | AT-014 | CAP-013 | Check each priority line has a lineage record | Present, reviewed by Finance | finance | Medium |
| ST-17 | regression | CAP-009/014/015 | Snapshot every registered report on F1 before and after changes | Only intended figures change; each change listed with reason | viewer | High |
| ST-18 | AT-018 | CAP-017/019 | Perform export, import, payment delete, payroll unlock | One log/audit event each with actor and time | admin | Medium |
| ST-19 | AT-019 | CAP-018 | Edit a DMS row or payment dated in a Busy-closed period | Behaviour per OD-10 (block or reversal) | accounts | Medium |
| ST-20 | second-source guard | CAP-001/002/006/007/010 | Confirm no expense/manual-revenue object exists or is added without approval | None present | engineering | Medium |
| ST-21 | AT-021 | CAP-020 | Compare to an approved Busy control extract with tolerance | MATCH/EXPLAINED with sign-off by named role | finance | High |
| ST-22 | AT-022 | CAP-021 | Insert vouchers concurrently across RApp/JApp; compare series inventory with Sales/Busy | No duplicates within Service; no overlap with Sales series | accounts | High |
| ST-23 | rollover | CAP-021 | Set date to 2027-04-01 equivalent in the disposable DB and create receipts | New FY series issued; old numbers unchanged; Busy series names match approved list | accounts | High |
| ST-24 | AT-017 | CAP-016 | As a user with no module, select `bank_name`, `account_number`, `ifsc` from `employee_master` | Denied or empty; payroll screens still load for payroll users | outsider, payroll | High |
| ST-25 | AT-006 | CAP-016 | As a Tonk-branch user, read finance rows of another branch | Per PD-17: denied by policy, or the application-scope decision is recorded and tested at the UI | branch user | High |
| ST-26 | AT-017 | CAP-016 | Call `list_accounts_*` and `payroll_finalize_month` without the module right | Denied with a clear error | outsider | Medium |
| ST-27 | AT-017 | CAP-016 | As `anon`, read finance tables | No rows | anon | High |

## 2. Results of the first audit pass (static, audit time)

Date: 2026-11-25. Revision `e7877341` + audit-time worktree snapshot `7809bd2a…` (committed afterwards as `98016773`). **No runtime check was run**: no environment was proven isolated with synthetic data (EV-042). Nothing was opened in production. Statuses: PASS / FAIL / NOT_RUN / STATIC_ONLY / BLOCKED. "Defect indicated" means code or policy text shows the requirement is not met; it is not an observed run.

| ID | Status | Evidence | What closes it |
|---|---|---|---|
| ST-01 page-load writes | STATIC_ONLY (no write found) | List/get RPCs are `STABLE` with no DML (EV-032); `/busy` mount reads only (EV-007) | Run ST-01 on disposable DB; record row/sequence counts |
| ST-02 row cap visible | STATIC_ONLY — **defect indicated** | Loop breaks at 5,000 with no flag (EV-019) | Run F3 |
| ST-03 failed source visible | STATIC_ONLY — **defect indicated** | `.catch(() => [])` on payment lines (EV-036) | Run with a forced RPC error |
| ST-04 revenue formula | STATIC_ONLY — **defect indicated** | Flat ÷1.18 per row (EV-020). Calculated expectations: coded 21,339; correct 22,000 | Run F1; record observed value |
| ST-05 status/date basis | STATIC_ONLY | No status filter in report queries (EV-021); Busy excludes "cancel" (EV-007) | Run F1 + D + E |
| ST-06 drilldown = headline | NOT_RUN | — | Run with F1 |
| ST-07 duplicates/retries | STATIC_ONLY | Unique key on `psf_revenue_dms` (EV-015); parts invoice-key skip (EV-011); no Busy export log exists | Run F4; build export log first for the Busy part |
| ST-08 JC vs invoice vs Busy | NOT_RUN | Equality of `dms_*` mirror and invoice rows unverified | Run F1 on disposable DB |
| ST-09 table access | STATIC_ONLY — **defect indicated** | `USING (true)` select/insert/update/delete policies (EV-015,017,018,025) | Run as `outsider` |
| ST-10 regression after policy change | NOT_RUN | Applies after change | Build a before/after harness (see PLAN P2) |
| ST-11 branch filter | NOT_RUN | Label sets differ (EV-038,009) | Run with unmapped code |
| ST-12 period filter | NOT_RUN | Local-date conversion in `applyDateFilterToQuery` (EV-019 area) | Run around IST boundary |
| ST-13 payroll cost | STATIC_ONLY | Formula and expected 48,250.25 calculated (EV-023); no cost report exists | Build view then run |
| ST-14 payroll lock/recompute | STATIC_ONLY | Finalize/unlock RPCs with security grant (EV-023) | Run F2 |
| ST-15 catalogue | **FAIL** (static) | Registry has no owner/source/date-basis; 10 reports unregistered (EV-035). `ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv` created as audit copy for all 48 | Implement CAP-012 |
| ST-16 lineage | STATIC_ONLY | 2 priority figures traced (`ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv`); others not traced | Extend after approval |
| ST-17 regression snapshot | NOT_RUN | — | Capture baseline on F1 before any code change |
| ST-18 audit events | STATIC_ONLY | `audit_logs` used by payment delete (EV-037); no export/import log | Implement CAP-017/019 |
| ST-19 period-lock edit | BLOCKED | Needs OD-10 | Finance decision |
| ST-20 no second source | **PASS** | No expense or manual revenue object in snapshot or app (EV-034) | Re-run grep at each phase gate |
| ST-21 reconciliation to control | BLOCKED | No approved Busy control provided (OD-11) | Provide control + tolerance + sign-off role |
| ST-22 cross-system refs | BLOCKED (cross-system); STATIC_ONLY (inside Service: unique `voucher_no` indexes, immutable trigger) | EV-013,024 | Sales/Busy series inventory (OD-03) |
| ST-23 FY rollover | NOT_RUN | FY hard-coded (EV-008,012,013) | Run in disposable DB after design |

### 2.1 Counts
PASS 1 (ST-20) · FAIL 1 (ST-15) · STATIC_ONLY 11 · NOT_RUN 7 · BLOCKED 3 (ST-19, ST-21, ST-22) = 23 tests. Four STATIC_ONLY rows indicate defects (ST-02, ST-03, ST-04, ST-09).

### 2.2 Independent items not blocked by others
ST-01..ST-07, ST-09, ST-11..ST-14, ST-17 only need the disposable environment; ST-19, ST-21, ST-22 need Finance/Sales inputs.

## 3. Implementation-readiness verification: isolated runtime (second pass, 2026-11-25 IST)

**Environment (EV-043).** A scratch PostgreSQL 17.7 cluster on loopback only, restored from the committed schema snapshot (sha256 `694ac198…8636`, commit `0c61add8`). Four extensions were unavailable (pgtap, pg_net, pg_cron, supabase_vault), so the pgTAP helper grants and the cron/net objects failed to restore; every table, policy and function used below loaded. Synthetic users, modules, revenue rows (fixture F1), payroll rows. No edge functions, no network integrations, no production data or credentials. The cluster and its data were destroyed after the run. This is **not production**: hosted Auth settings, production permission assignments and real data volumes remain unverified (EV-050).

**Access matrix** (rows = operation attempted inside a rolled-back transaction; numbers = rows affected or returned):

| Table / operation | no module | reports view | accounts | payroll view |
|---|---|---|---|---|
| `psf_revenue_dms` select / update / delete / insert | 4 / 4 / 1 / 1 | same | same | same |
| `job_card_closed_data` select / update / delete / insert | 2 / 2 / 1 / 1 | same | same | same |
| `service_invoice_data` select / update / delete / insert | 1 / 1 / 0 / 1 | same | same | same |
| `warranty_claim_settlement_report_data` select / update (insert tested as no-module user) | 1 / 1 (insert allowed) | 1 / 1 | 1 / 1 | 1 / 1 |
| `payroll_entries` select | 0 | 0 | 0 | 1 |
| `payroll_entries` update / delete / insert | 0 / 0 / denied | same | same | same |
| `list_accounts_mechanical_cases`, `list_accounts_bodyshop_cases` | denied | denied | allowed | denied |
| `payroll_finalize_month` | denied | denied | denied | denied (admin allowed) |
| Unauthenticated (`anon`) read of `psf_revenue_dms` / `job_card_closed_data` | 0 rows / permission denied | | | |

| ID | Status | Observed result (isolated) | Evidence |
|---|---|---|---|
| ST-01 page-load writes | PASS (RPC level) | After the Accounts list RPCs as the accounts user, voucher sequences, `audit_logs` count and revenue row count were unchanged. Page-level load of `/busy`, `/reports`, `/payroll` NOT_RUN | EV-043 |
| ST-04 revenue formula | FAIL (function level) | Repository `parseRevenueExcludingGst` run in Node on the F1 totals: 10,000 + 4,449 + 6,890 = **21,339**; correct 22,000. KPI end-to-end NOT_RUN | EV-047 |
| ST-07 duplicates/retries | FAIL (partial) | Identical import retry: one row (idempotent). Two invoices for one job card and date: same batch fails; separate batches: the later invoice **replaces** the earlier (3,000 expected, 2,000 stored). Busy export duplicates NOT_RUN (no export log exists) | EV-046 |
| ST-09 table access | FAIL | See matrix: a signed-in user with no module can read, change and delete revenue rows | EV-044 |
| ST-13 payroll formula | PASS (formula level) | `computePayrollAmounts` gave 28,250.25 and 20,000.00; total 48,250.25. Cost view not built | EV-047 |
| ST-23 FY rollover | FAIL | `accounts_mechanical_next_voucher_no('cash','2027-05-01')` returned `RApp/26-27/0002`; before 2026-09-02 it returns NULL; the voucher CHECK constraint pins `26-27` | EV-045 |
| ST-24 employee bank fields | FAIL | Synthetic `bank_name`, `account_number`, `ifsc` in `employee_master` were readable by a user with no module | EV-049 |
| ST-25 DB-level branch isolation | FAIL | 0 public policies mention branch; a Tonk-branch user read Sitapura and Ajmer Road rows | EV-048 |
| ST-26 module-gated RPCs | PASS | Accounts list RPCs and `payroll_finalize_month` enforced module rights as shown | EV-044 |
| ST-27 anonymous access | PASS | `anon` got 0 rows from `psf_revenue_dms` and permission denied on `job_card_closed_data` (table grants exist but policies are `TO authenticated`) | EV-044 |

New tests added by this pass:
- **ST-24** `employee_master` bank fields are not readable without a payroll right (AT-017).
- **ST-25** Branch scope is enforced in the database for finance tables, or the decision to rely on application scope is recorded (AT-006; PD-17).
- **ST-26** Module-gated RPCs reject users without the right (AT-017).
- **ST-27** An unauthenticated caller reads no finance row (AT-017).

### 3.1 Combined status after the second pass (27 tests)
PASS 5 (ST-01 RPC level, ST-13 formula, ST-20, ST-26, ST-27) · FAIL 7 (ST-04, ST-07, ST-09, ST-15, ST-23, ST-24, ST-25) · STATIC_ONLY 6 (ST-02, ST-03, ST-05, ST-14, ST-16, ST-18) · NOT_RUN 6 (ST-06, ST-08, ST-10, ST-11, ST-12, ST-17) · BLOCKED 3 (ST-19, ST-21, ST-22). FAIL means the current behaviour does not meet the requirement; it is a verified gap that the plan addresses, not a defect introduced by this plan.

