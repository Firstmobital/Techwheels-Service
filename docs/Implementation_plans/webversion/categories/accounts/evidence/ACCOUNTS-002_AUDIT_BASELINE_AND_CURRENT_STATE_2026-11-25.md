# ACCOUNTS-002 Audit Baseline, Current State and Promotion Manifest

**Plan:** [ACCOUNTS-002](../active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md)  
**Audit date:** 2026-11-25 (IST)  
**Classification:** state = implementation evidence, scope = web, intent = evidence  
**Method:** static audit of the repository at `e7877341` and the schema snapshot; no runtime check was run. No database row data was read.

## 1. Revision matrix (audit baseline)

### 1.1 Repository
| Item | Value | Evidence |
|---|---|---|
| Path | repository root (origin `Firstmobital/Techwheels-Service`) | git remote |
| Branch / commit | `main` / `e7877341d40bacbc72f4314c2b66797da0519ea1` (2026-11-25 11:23:45 +0530, "Changes by Vinod") | git log |
| Remote `main` | same SHA (read-only `git ls-remote`) | EV-040 |
| Worktree (at audit time) | 2 modified tracked files, both user changes, left untouched (committed afterwards as `98016773`): `supabase/backups/full_metadata.sql`, `supabase/evidence/authoritative_metadata_manifest.json` | git status |
| Agent instruction files | `AGENTS.md` and `CLAUDE.md` **do not exist**. The repo mandates one generic contract `.instructions.md` and forbids vendor files. Read: `.instructions.md`, `README.md`, `CONTRIBUTING.md`, `docs/STRUCTURE_GUIDE.md`, `docs/MASTER_INDEX.md`, `docs/shared/reference/DATABASE_TRUTH.md`, `docs/shared/reference/CURRENT_STATE.md` (dated 2026-06-18, stale for this scope) | EV-001..003 |
| Deployment | No trusted read-only deployment metadata accessed. Deployed commit and deployed DB state: **parity unknown** | — |

### 1.2 Schema snapshot (structural authority)
| | Committed at `e7877341` | Audit-time worktree refresh (used for the audit; committed later as `98016773`) |
|---|---|---|
| Dump time | 2026-11-24 (manifest 05:59:19Z) | 2026-11-25 11:23:54 IST (manifest 05:55:10Z) |
| sha256 | `0e036266…7b0b` | `7809bd2a…5027` |
| Bytes | 2,903,248 | 2,904,146 |
| Manifest matches file | yes | yes (checked with shasum) |

The worktree snapshot is a newer, **uncommitted** refresh (diff: +139/-119 lines). Per `DATABASE_TRUTH.md` an uncommitted refresh is not visible to repository-based inspection. **Line numbers in this promoted doc set refer to the committed snapshot at `e7877341`** (sha `0e036266…`). The audit was originally run against the worktree refresh; every one of the 32 anchors in section 3.1 sits exactly 20 lines later there. Cite object names if a later refresh moves the lines. Latest migration file is `20261123120000_…` (105 files), older than both dumps. Applied-migration state in the live database is **UNVERIFIED**; migrations were used only as history. `post_dump_verified_promotions.md` window opened 2026-10-02 and lists no promotions after the dump. **Update after the audit (2026-11-25 IST):** the refresh was committed unchanged as `98016773` ("Refresh authoritative schema metadata snapshot"). In a checkout at or after that commit every snapshot line number cited here is 20 higher; `git show e7877341:supabase/backups/full_metadata.sql` reproduces the cited numbers exactly.

### 1.3 Conclusion provenance
| Layer | Used for |
|---|---|
| Snapshot (CONFIRMED) | table/column existence, constraints, unique keys, RLS policies, function bodies, triggers, grants |
| Source code at pinned SHA (CONFIRMED) | route gates, API/RPC calls, formulas, page-load behaviour, hard-coded constants |
| Migrations | not relied on |
| Runtime-verified | **none** (EV-042) |
| Row data / production values | not accessed; `local_folder/backups/full_database.sql` deliberately not read (customer and financial rows) |

### 1.4 Source vs snapshot vs deployment differences found
1. Snapshot refresh was uncommitted at audit time (above); committed afterwards as `98016773`.
2. `docs/shared/reference/CURRENT_STATE.md` predates the Accounts, Busy and Payroll modules in this scope (dated 2026-06-18).
3. Hard-coded FY `26-27` appears in code (`accounts.ts:19-20`, `eligibility.ts:5-6`) and in the DB function and sequence names (`full_metadata.sql:2244-2272`); source and snapshot agree.
4. Deployed behaviour unknown; nothing in this audit asserts what production runs.

## 2. Current state: what Service already does (pinned `e7877341`)

Status words: **Implemented** (code + snapshot), **Configured**, **Documented-only**, **Unverified**. All CONFIRMED items cite evidence IDs ([evidence index](ACCOUNTS-002_EVIDENCE_INDEX_2026-11-25.csv)). Nothing here is runtime-verified.

### 2.0. Headline
- **Expenses: no workshop expense capability exists** — no table, view, RPC or page (EV-034). Cost-side data in Service is limited to payroll/incentives, bodyshop settlement payables, and parts consumption/stock data.
- **Revenue: Service already holds DMS-invoice revenue** in three overlapping sources (invoice grain `psf_revenue_dms`, JC grain `job_card_closed_data`, invoice-order grain `service_invoice_data`) plus keyed collections in Accounts. No manual revenue register exists, and the evidence does not show a need for one.
- **Accounting: Service already feeds Busy by file** — sales-voucher and party workbooks (`/busy`) and receipt-voucher exports (`/accounts`). Service **issues its own voucher numbers** (`RApp/26-27/nnnn`, `JApp/26-27/nnnn`) from DB sequences and derives `PV-S 26-27` / `EV-S 26-27` series from DMS invoice prefixes. This is the direct collision surface for OD-02/OD-03.
- **Reports: 38 registered reports (plus 10 implemented but unregistered)** under one module right; revenue figures are derived with a flat ÷1.18 and a silent 5,000-row cap.

### 2.1. Capability inventory
| # | Capability | Where used (route → module) | Decision supported / owner of records | Source and filters | Lifecycle (create / correct / cancel / reverse) | Dependants | State |
|---|---|---|---|---|---|---|---|
| C1 | DMS revenue import | `/import` → `job_cards` (EV-006) | Feeds all revenue; records owned by DMS export, loaded by staff | `run_psf_revenue_dms_import_batch` upsert on `(location,portal,job_card_number,invoice_date)` (EV-027, EV-015) | Re-import updates; cancelled invoices carry `invoice_status`/`invoice_cancellation_date`; no delete flow seen | Reports, Busy, Accounts, payroll variable earnings (EV-033), triggers (EV-016) | Implemented |
| C2 | JC revenue mirror | internal | JC-level reporting | `job_card_closed_data`, unique `(location,portal,job_card_number,invoice_date)`; `dms_*` columns mirrored from latest `psf_revenue_dms` by trigger (EV-016,EV-017) | Trigger-refreshed | All `/reports` revenue figures (EV-021) | Implemented |
| C3 | Revenue reports | `/reports/revenue/*`, `/reports/labour-revenue/*`, dashboard → `reports` | Management view by service type, branch, advisor, date | `job_card_closed_data` (+`employee_master`, `service_vas_jc_data`); invoice date forced (EV-022); branch aliases (EV-038) | Read-only | Managers; payroll shares the data | Implemented; flawed (see §3) |
| C4 | Busy sales-voucher export | `/busy` → `busy` | Finance posts workshop invoices into Busy | `psf_revenue_dms` labour rows by invoice date (paged, no cap, EV-030) + uploaded parts workbook persisted in `busy_parts` (EV-011) | Cancelled invoices excluded; blocked/warning rows shown; masters editable by admin (EV-039) | Busy (external), Accounts | Implemented |
| C5 | Accounts: mechanical invoices & receipts | `/accounts` → `accounts` | Cash office captures bill and customer payments | `accounts_mechanical_invoices` (keyed `billed_amount`), `accounts_mechanical_payment_lines` (EV-014); lists via STABLE RPCs (EV-032) | Payment edit/delete RPCs; delete writes `audit_logs` (EV-037); voucher number immutable once set (EV-013) | Busy receipt export, gate-pass release | Implemented |
| C6 | Busy receipt-voucher export | `/accounts` | Cash/UPI/card to Busy | `BUSY_PAYMENT_ACCOUNT_DR`; blocked when eligible voucher missing (EV-012) | Voucher backfilled by trigger when DMS invoice date arrives (EV-016) | Busy | Implemented |
| C7 | Bodyshop settlement & DO recovery | `/bodyshop-repair`, `/bodyshop-recovery`, `/accounts` | Customer/insurer receipts, DO payments, write-offs | `bodyshop_settlements`, append-only `bodyshop_settlement_lines` with reversal & write-off RPCs (EV-024) | Reversal lines, voucher immutable | Accounts, Busy export | Implemented |
| C8 | Payroll and incentives | `/payroll` → `payroll` | Monthly salary cost | `payroll_entries` snapshot rows, `payroll_months` finalize/unlock with security grant (EV-023) | Adjustments, unlock with reason, finalize lock | Settings, SA/technician/bodyshop earnings (EV-033) | Implemented |
| C9 | CRE incentive | `/cre-incentive` | Incentive amounts | `cre_incentive_settings` key/value (EV-041) | — | Payroll `incentive_amount` | Implemented (not traced further) |
| C10 | Warranty reports | `/reports/warranty/*` | OEM claim tracking | `warranty_*` import tables, open RLS (EV-025) | Import-only | Reports | Implemented; estimate/actual separation **Unverified** |
| C11 | Parts reports | `/reports/parts/*`, `/parts-spm` | Stock, consumption, GRN | parts tables, GRN uploads | Import-only | Reports | Implemented; valuation basis **Unverified** |
| C12 | Audit log | admin only | Admin ops | `audit_logs` (EV-026) | Insert by actor | Edge functions, a few RPCs | Implemented; not used by report/import writes |

### 2.2. Same figure, different sources (revenue)
| Source | Grain | Date | Scope | Owner / used by | Notes |
|---|---|---|---|---|---|
| `psf_revenue_dms` (EV-015) | one row per JC + invoice date (unique key) with `invoice_number`, `invoice_status`, labour/spares/total, tax fields, cancellation date | `invoice_date` | `branch`, `location`, `portal` PV/EV | DMS import; Busy export; Accounts voucher eligibility | Closest to the legal invoice; has cancellation state |
| `job_card_closed_data` (EV-017) | JC (+ invoice date), plus mirrored `dms_*` | `invoice_date` (reports) or `closed_date_time` | `branch`, `location`, `portal`, advisor code | Reports; payroll variable earnings | No invoice-status filter seen in report queries (UNVERIFIED) |
| `service_invoice_data` (EV-018) | invoice (order number + branch + date) | `invoice_date` | `branch` | Invoice-order reports | Overlaps both |
| `accounts_mechanical_invoices` (EV-014) | JC, keyed by Accounts staff | `invoice_date` (keyed or DMS fallback) | `branch` via reception | Collections / receivables | Manual `billed_amount`; **must not become a second revenue source** |

**Recommendation for the proposed revenue report:** use `psf_revenue_dms` as the finance-grade revenue basis (invoice grain, has status/cancellation, already drives the Busy export, so it matches what is posted), and keep `job_card_closed_data` for operational/JC analytics. Close the gap with a read-only reconciliation between the two and the Busy export (CAP-009/020), not a new register. Whether `dms_total_invoice_amount` equals `psf_revenue_dms.total_invoice_amount` per JC is **UNVERIFIED** (needs synthetic runtime test ST-08).

### 2.3. Verified gaps (static)
| ID | Gap | Evidence |
|---|---|---|
| G-01 | Revenue "ex-GST" = `round(gross/1.18)` per row. Parts invoiced at 5% GST (the Busy export handles 5% and 18% separately) are understated; row-level rounding drifts from invoice-level | EV-020, EV-010 |
| G-02 | Reports stop silently at 5,000 rows (oldest by `created_at` dropped); no truncation flag | EV-019 |
| G-03 | Report tables (`psf_revenue_dms`, `job_card_closed_data`, `service_invoice_data`, warranty) allow select/insert/update/delete to **any authenticated user** (`true` policies); module right is only a route gate | EV-015,017,018,025 |
| G-04 | One `reports` module gates every report (revenue, parts, warranty, master data) | EV-006 |
| G-05 | Name-based exclusion of service advisors in the Reports page | EV-022 |
| G-06 | Ten Performance reports (incl. `jc-invoice-reconciliation`) are implemented but not registered, so unreachable | EV-035 |
| G-07 | Voucher series and FY are hard-coded in 4 places; FY `26-27` ends 2027-03-31; Sales series unknown here | EV-008,012,013 |
| G-08 | No export history for Busy workbooks; re-exporting a period could be imported twice into Busy | EV-007 (absence of any export log table in snapshot) |
| G-09 | Accounts swallows payment-line load errors, which can show lower received totals without warning | EV-036 |
| G-10 | Branch has three label systems (report options, Busy branches via employee code with Sitapura fallback, DB `branch/location/portal`) | EV-009,038 |
| G-11 | No expense capability; no cost view other than payroll | EV-034 |
| G-12 | Rate settings are key/value, not effective-dated | EV-041 |

### 2.4. Page-load write effects (static)
Accounts, bodyshop recovery and settlement list/get RPCs are `STABLE`, permission-checked (`accounts_can_access`, bodyshop_recovery view) and contain no INSERT/UPDATE/DELETE/nextval (EV-032). `/busy` mount only reads status/masters; writes occur on explicit Import/Save clicks (EV-007). `/reports` mount reads only. Voucher numbers are assigned by **triggers during DMS import or payment entry**, never by viewing (EV-016). **View-only user:** cannot call write RPCs (module checks) — but see G-03 for direct table access by any authenticated user. Unseen settings: Supabase auth/role configuration, scheduled jobs and edge-function secrets (UNVERIFIED).

### 2.5. Applicability
Not applicable to Service as written in the handoff: recurring expense templates and generation (nothing to recur), shared-cost pool lines (no costs register), capitalisation tag, in-app ledger posting queue (Service posts nothing; Busy files only). These are DEFER, not BUILD, until Finance confirms a need.

## 3. Promotion manifest (every file in the local audit folder)

Promotion date 2026-11-25 (IST). The local audit root `local_folder/audits/finance-reporting/` is Git-ignored and keeps its original files as private working copies; this table is the accounting record. Paths below are repo-relative; "local" paths do not exist in a fresh clone.

| Original path (local) | Destination | Action | Reason |
|---|---|---|---|
| `…/04-implementation-plan/PLAN.md` | [ACCOUNTS-002 plan](../active/ACCOUNTS-002_FINANCE_REPORTING_EXPENSES_REVENUE_REPORTS_PLAN_2026-11-25.md) | Promoted as canonical plan; local file turned into a "superseded" pointer | Execution plan: `docs/Implementation_plans/webversion/categories/accounts/active/` (STRUCTURE_GUIDE 3, SYNC_PROTOCOL "New Implementation Plan") |
| `…/00-baseline/revision-matrix.md` | This file, section 1 | Merged | Baseline evidence for the plan; one evidence doc avoids fragments (STRUCTURE_GUIDE 7) |
| `…/01-current-state/service-capabilities.md` | This file, section 2 | Merged | Same state/intent; mixed truth claims are static-only, so kept as evidence, not promoted to `docs/web` truth (SYNC_PROTOCOL "Promotion Rule") |
| `…/01-current-state/ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv` | [reports catalogue](ACCOUNTS-002_REPORTS_CATALOGUE_2026-11-25.csv) | Copied | Machine-readable evidence |
| `…/02-fit-gap/fit-gap.csv` | [fit-gap](ACCOUNTS-002_FIT_GAP_2026-11-25.csv) | Copied, added `plan_task_ids`, `existing_plan_owner` | Traceability to the plan and to ACCOUNTS-001 / BUSY-001 |
| `…/02-fit-gap/source-to-target-mapping.csv` | [mapping](ACCOUNTS-002_SOURCE_TO_TARGET_MAPPING_2026-11-25.csv) | Copied | Evidence |
| `…/ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv` | [lineage](ACCOUNTS-002_REPORT_LINEAGE_2026-11-25.csv) | Copied | Evidence (synthetic values only) |
| `…/03-verification/acceptance-tests.md` + `results.md` | [ACCOUNTS-002_TEST_MATRIX.md](ACCOUNTS-002_TEST_MATRIX.md) | Merged | Repo convention is one `<PLAN>_TEST_MATRIX.md` per plan |
| `…/evidence-index.csv` | [evidence index](ACCOUNTS-002_EVIDENCE_INDEX_2026-11-25.csv) | Copied; snapshot lines re-based to the snapshot at `e7877341`; private input path removed | Evidence IDs used throughout |
| `…/decision-log.md` | [ACCOUNTS-002_DECISION_LOG_2026-11-25.md](ACCOUNTS-002_DECISION_LOG_2026-11-25.md) | Copied | Open decisions and non-fitting Sales recommendations; pending decisions are also summarised in the plan |
| `…/README.md`, `…/STATE.md` | none | Retained local | Working navigation/resume files for the local audit; superseded by the plan and this manifest |
| Sales handoff ZIP (outside repo) | none | Retained private, not copied | Private input from another project; only sanitised decision IDs (OD-01..OD-12) are cited |
| Snapshot working copy / raw `local_folder/backups/*` | none | Not read, not copied | Contain customer and financial rows |

Existing owners checked before creating a new plan: ACCOUNTS-001 (`/accounts`, receipts, RApp/JApp vouchers), BUSY-001 (`/busy` export), BODYSHOP-SETTLEMENT-001, BODYSHOP-RECOVERY-001, IMPORT-001, RBAC-001, SUPABASE-001. None owns revenue reporting, report access, or a cross-module finance view, so ACCOUNTS-002 is justified; work that belongs inside ACCOUNTS-001 or BUSY-001 is tracked here by task ID and executed under the owner plan.

### 3.1 Snapshot anchor offsets (both snapshots)

| Anchor | Snapshot at `e7877341` (sha 0e036266…; cited line numbers) | 2026-11-25 refresh (sha 7809bd2a…; uncommitted at audit time, now in commit `98016773`) |
|---|---|---|
| `CREATE FUNCTION public.accounts_mechanical_next_voucher_no` | 2264 | 2284 |
| `CREATE TABLE public.accounts_mechanical_invoices (` | 33517 | 33537 |
| `CREATE TABLE public.accounts_mechanical_payment_lines (` | 33635 | 33655 |
| `CREATE TABLE public.job_card_closed_data (` | 37248 | 37268 |
| `CREATE TABLE public.psf_revenue_dms (` | 38800 | 38820 |
| `CREATE TABLE public.payroll_entries (` | 38187 | 38207 |
| `CREATE TABLE public.payroll_months (` | 38250 | 38270 |
| `CREATE TABLE public.bodyshop_settlement_lines (` | 34677 | 34697 |
| `CREATE TABLE public.bodyshop_settlements (` | 34761 | 34781 |
| `CREATE TABLE public.service_invoice_data (` | 39263 | 39283 |
| `CREATE TABLE public.warranty_claim_settlement_report_data (` | 41327 | 41347 |
| `CREATE FUNCTION public.payroll_finalize_month` | 20043 | 20063 |
| `CREATE TRIGGER trg_psf_revenue_dms_assign_mechanical_vouchers` | 49985 | 50005 |
| `CREATE TRIGGER trg_refresh_job_card_closed_dms_revenue` | 50033 | 50053 |
| `CREATE POLICY psf_revenue_dms_select_authenticated` | 56025 | 56045 |
| `CREATE POLICY p0_auth_insert ON public.service_invoice_data` | 55232 | 55252 |
| `CREATE POLICY job_card_closed_data_select_authenticated` | 54872 | 54892 |
| `CREATE POLICY p0_auth_select ON public.warranty_wc_data` | 55456 | 55476 |
| `CREATE FUNCTION public.reverse_bodyshop_settlement_line` | 24135 | 24155 |
| `CREATE FUNCTION public.write_off_bodyshop_do_residual` | 29394 | 29414 |
| `CREATE FUNCTION public.list_accounts_mechanical_cases` | 15904 | 15924 |
| `CREATE FUNCTION public.list_accounts_bodyshop_cases` | 15831 | 15851 |
| `CREATE TABLE public.audit_logs (` | 34021 | 34041 |
| `CREATE FUNCTION public.delete_accounts_mechanical_payment` | 10286 | 10306 |
| `CREATE TABLE public.sa_earnings_settings` | 39098 | 39118 |
| `CREATE TABLE public.cre_incentive_settings` | 35765 | 35785 |
| `CREATE FUNCTION public.run_psf_revenue_dms_import_batch(p_rows jsonb)` | 24838 | 24858 |
| `CREATE UNIQUE INDEX uq_jc_closed_location_portal_job_card_number_invoice_date` | 48904 | 48924 |
| `ADD CONSTRAINT uq_psf_revenue_dms_location_portal_job_card_invoice_date UNIQUE` | 44668 | 44688 |
| `CREATE TRIGGER trg_prevent_bodyshop_settlement_line_mutation` | 49969 | 49989 |
| `CREATE POLICY audit_logs_select_admin` | 53396 | 53416 |
| `CREATE UNIQUE INDEX busy_insurance_master_company_name_unique` | 45933 | 45953 |

### 3.2 Committed-snapshot verification and evidence limitations (final review, 2026-11-25 IST)

**Provenance preserved.** The audit read the then-uncommitted local refresh (`full_metadata.sql` sha256 `7809bd2a…5027`, dumped 2026-11-25 11:23:54 IST; manifest `created_at_utc` 2026-11-25T05:55:10Z). Citations in this doc set are re-based to the committed snapshot at `e7877341` (sha256 `0e036266…7b0b`, dumped 2026-11-24 11:28:04 IST) so they resolve in a fresh clone.

**Check performed.** Both snapshots were compared statically (diff, no database access):
1. All 32 anchors in section 3.1 have identical definitions in both snapshots, 20 lines apart.
2. The 11,842 non-comment lines that mention `public.` are identical and in the same order in both files; no changed line mentions `public.` or `Schema: public`. The cited tables, constraints, indexes, triggers, policies (including the `USING (true)` policies), the STABLE list functions, `accounts_mechanical_next_voucher_no`, `payroll_finalize_month`, and the settlement functions are therefore the same in both.
3. "No expense object" (EV-034) was re-run against the snapshot at `e7877341`: 0 matches. That snapshot has 172 `public` tables, the same as the local one.
4. Application code and mobile code cited by the audit are unchanged between the worktree and `HEAD` (`git diff HEAD -- src mobile scripts` is empty).

**Where the snapshots differ (none cited by this plan).** Header time and `\restrict` token; two Supabase PostgREST event-trigger functions in schema `extensions` (`pgrst_ddl_watch`, `pgrst_drop_watch`: added schema exclusions); `realtime.messages` daily partition rotation (2026-11-21 partition removed, 2026-11-28 added, with related index, constraint and ACL lines); removal of the matching `realtime`/`storage` TOC entries; TOC and OID comment renumbering. No `public` object differs.

**Remaining limitations.**
- Neither snapshot proves the live database. Applied-migration state and production RLS are UNVERIFIED; the `e7877341` snapshot is about 24 hours older than the 2026-11-25 refresh.
- The refresh was uncommitted at audit time and is now committed as `98016773`, so citations need the +20 offset in the current tree. A later refresh may move lines again; use object names (section 3.1).
- Some citations use range-level lines for documents (for example `.instructions.md:1-60`), not single statements.
- No runtime verification: all tests in the test matrix are STATIC_ONLY, NOT_RUN or BLOCKED except ST-15 (FAIL) and ST-20 (PASS, grep-based).
- Row data, production settings, scheduled jobs and edge-function secrets were not inspected.

