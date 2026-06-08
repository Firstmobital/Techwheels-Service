# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-06-08
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime: RAM 64%, CPU 2%, disk 27%, connections 16/60
- Traffic (last 60 min): 446 DB requests, 43 Auth requests, 496 total requests (Storage 0, Realtime 7)
- Advisory state: 22 issues, mostly Security/Critical
- Migration visibility: last migration shown as `parts_phase1_alignment`
- Operational flags: no backups configured, no repo connected in dashboard
- DB observability window (2026-06-08 08:53-09:53 IST): memory usage ~408 MB, memory commitment ~1.33 GB, sustained cache-heavy read profile
- Authoritative dump audit source: `local_folder/backups/full_database.sql` (80 MB), mirrored as `local_folder/backups/chunks/full_database.sql.part_*` (5 parts)
- Authoritative dump timestamp: Started on 2026-06-05 10:06:12 IST (pg_dump 17.7, DB 17.6)

## 2) Execution Rules (Always On)

- Rule R1: Security-critical issues are fixed before performance tuning.
- Rule R2: Every action must have evidence (screenshot, SQL output, migration filename, or dashboard path).
- Rule R3: Schema changes must be shipped as versioned files in `supabase/migrations/` only.
- Rule R4: No duplicate/consolidated SQL copies outside `supabase/migrations/`.
- Rule R5: Keep this file as single source of truth for Supabase operations progress.
- Rule R6: Every new dashboard observation must update baseline metrics and tracker rows on the same day.
- Rule R7: Treat `local_folder/backups/full_database.sql` as the authoritative schema and full database dump; authority never downgrades.
- Rule R8: If direct access to `local_folder/backups/full_database.sql` is blocked by size limits, use `local_folder/backups/chunks/full_database.sql.part_*` as the access mirror of the same authoritative dump.
- Rule R9: Never invent tables, columns, functions, triggers, or RLS policies not present in the active authoritative source.
- Rule R10: If any conflict appears across docs/migrations/dashboard assumptions, prefer the local authoritative dump without reconciliation.

## 3) Prioritized Plan

### Phase P0 - Critical Security Stabilization (Do First)

Objective: Close critical attack surface immediately.

1. Audit all 22 Advisor issues and classify by severity and object (table/function/auth setting).
2. Enable RLS on all public tables that are client-facing or indirectly exposed.
3. Add/repair SELECT/INSERT/UPDATE/DELETE policies per table and role (`anon`, `authenticated`, service-only paths).
4. Restrict `anon` key permissions to least privilege for public-facing access only.
5. Enable leaked-password protection in Auth providers.
6. Validate each fix by re-running Advisor and recording delta.

Exit criteria:
- Critical security issues in Advisor = 0.
- All modified tables have explicit RLS + policies mapped to expected app flows.

### Phase P1 - Connection and Query Efficiency (Same Day/Week)

Objective: Prevent pool exhaustion and reduce RAM pressure.

1. Switch application DB connection usage to Supabase pooler URL where applicable.
2. Enable/accept Index Advisor recommendations after review.
3. Identify top 3-5 slowest queries in Query Performance.
4. Run `EXPLAIN (ANALYZE, BUFFERS)` for slow queries.
5. Add targeted indexes for FK/filter/order columns causing sequential scans.
6. Replace broad `select('*')` and fetch-all loops with server-side aggregates/RPCs and narrow column projections.
7. Replace OFFSET pagination on large relations with keyset pagination (`id > last_id` or date+id cursor).
8. Add per-page query budget targets and fail-fast guardrails (`limit`, date range required, default branch required).
9. Re-check RAM trend after index rollout and query-shape changes.

Exit criteria:
- No recurring slow query with obvious missing-index pattern.
- Statement timeout cancellations trend to zero for top user pages.
- Connections remain stable under normal peak.
- RAM trend is stable or improving over 3-7 days.

### Phase P2 - Reliability and Operational Guardrails (This Week)

Objective: Reduce outage and drift risk on free-tier constraints.

1. Implement lightweight health-check ping to avoid free-plan inactivity pause.
2. Connect GitHub repository in Supabase dashboard for better operational traceability.
3. Validate migration lineage in repo vs deployed state.
4. Establish backup posture and documented restore drill cadence.
5. Create alert thresholds for RAM, connection saturation, and critical Advisor regressions.

Exit criteria:
- Inactivity pause mitigation active and tested.
- Repo linkage and migration traceability verified.
- Backup and restore procedure documented and test date scheduled.

### Phase P3 - Continuous Optimization (Long Term)

Objective: Keep Supabase healthy as data volume grows.

1. Weekly Advisor review and closure of new findings.
2. Weekly query-performance review for regressions.
3. Monthly RLS and auth policy audit.
4. Monthly cost/performance review: free-tier viability vs growth.
5. Quarterly failover/incident tabletop for DB pause, auth outage, and accidental policy lockout.

Exit criteria:
- No unresolved critical findings older than 7 days.
- Performance and security reviews happen on schedule with evidence logged.

## 4) Activity Tracker (Live)

Status legend: `Not Started` | `In Progress` | `Blocked` | `Done`

| ID | Priority | Task | Owner | Status | Start Date | Target Date | Evidence | Last Update | Next Action |
|---|---|---|---|---|---|---|---|---|---|
| P0-01 | Critical | Export and classify all 22 Advisor issues | Team | Done | 2026-06-08 | 2026-06-08 | Full advisor inventory captured and tracked across four fix batches; final rerun shows Security Advisor Errors = 0 | 2026-06-08 | - |
| P0-02 | Critical | Enable RLS on exposed public tables | Team | Done | 2026-06-08 | 2026-06-08 | Fixes 1-4 executed (`20260608100000`, `20260608101500`, `20260608103000`, `20260608104500`); final rerun shows all `rls_disabled_in_public` errors cleared | 2026-06-08 | - |
| P0-03 | Critical | Define least-privilege policies for `anon` and `authenticated` | Team | In Progress | 2026-06-08 |  | Step 1 draft prepared: `supabase/migrations/20260608113000_p0_step1_warranty_tighten_delete_policy.sql` (tightens existing `p0_auth_delete` on warranty tables only; keeps read/import continuity) | 2026-06-08 | Execute Step 1 draft, run warranty validation checklist, then proceed to Step 2 service-domain tightening |
| P0-04 | High | Restrict `anon` API key permissions in settings | Team | Not Started |  |  |  | 2026-06-04 | Validate no frontend breakage after restriction |
| P0-05 | High | Enable leaked-password protection in Auth | Team | Not Started |  |  |  | 2026-06-04 | Toggle and test signup/login failure path |
| P1-01 | Critical | Move app DB connection usage to pooler URL | Team | Not Started |  |  |  | 2026-06-04 | Identify all runtime connection string consumers |
| P1-02 | High | Accept and triage Index Advisor suggestions | Team | Not Started |  |  |  | 2026-06-04 | Mark suggestions as apply/defer/reject with reason |
| P1-03 | High | Analyze top 3-5 slow queries in dashboard | Team | In Progress | 2026-06-08 |  | Query hotlist expanded from Supabase Query Performance logs (roles: authenticated/anon/supabase_admin/postgres) with prop-total-time ranking and query-family grouping | 2026-06-08 | Convert top offenders into index + query-shape migration tasks with EXPLAIN evidence |
| P1-04 | High | Add and verify indexes for sequential scans | Team | Not Started |  |  |  | 2026-06-04 | Implement migration files for approved indexes |
| P1-05 | Critical | Remove fetch-all patterns from reports and warranty JSON extractors | Team | Not Started |  |  |  | 2026-06-05 | Convert to RPC/aggregate SQL and strict page limits |
| P1-06 | High | Replace OFFSET scans with cursor pagination in large tables/views | Team | Not Started |  |  |  | 2026-06-05 | Use id/date cursors and verify no timeout regressions |
| P1-07 | High | Add targeted composite/partial indexes for timeout hotlist queries | Team | Not Started |  |  |  | 2026-06-05 | Ship migration files and attach EXPLAIN evidence |
| P1-08 | High | Reduce Realtime WAL polling cost and fan-out | Team | Not Started |  |  |  | 2026-06-08 | Audit active subscriptions/channels and cap noisy clients |
| P1-09 | High | Eliminate expensive exact-count list patterns in PostgREST paths | Team | Not Started |  |  |  | 2026-06-08 | Replace exact counts with planned/estimated counts or dedicated aggregate RPC |
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Not Started |  |  |  | 2026-06-04 | Define endpoint + schedule + monitoring |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | In Progress | 2026-06-05 |  | Authoritative dump audit completed (header + object/RLS/index extracts from `local_folder/backups/full_database.sql`) | 2026-06-05 | Convert confirmed schema drift points into migration/status actions without overriding dump authority |
| P2-04 | High | Define backup/restore runbook and drill date | Team | Not Started |  |  |  | 2026-06-04 | Add restore checklist and owner |
| P2-05 | High | Resolve schema drift where app queries depend on objects not present in authoritative dump | Team | Blocked | 2026-06-05 |  | Dump shows `vw_parts_stock_health` exists but no current `vw_parts_latest_stock` or `vw_parts_consumption_trend` object definitions | 2026-06-05 | Validate intended source-of-truth object set and prepare explicit migration/backport decision |
| P3-01 | Medium | Weekly Advisor regression sweep | Team | Not Started |  |  |  | 2026-06-04 | Schedule recurring review |
| P3-02 | Medium | Weekly query performance review | Team | Not Started |  |  |  | 2026-06-04 | Schedule recurring review |

## 5) Real-Time Metrics Log (Append Only)

Use one line per update so trend changes are visible over time.

| Date | RAM | CPU | Disk | Connections | Advisor Critical | Advisor Medium | DB Req/60m | Auth Req/60m | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-06-04 | 55% | 2% | 28% | 9/60 | 3 (from screenshot section counters) | 1+ | 194 | 10 | Baseline from dashboard screenshot |
| 2026-06-08 | 64% | 2% | 27% | 16/60 | 3 (unchanged in latest screenshot context) | 1+ | 446 | 43 | Added Query Performance hotlist from production logs; memory usage ~408 MB and commitment ~1.33 GB during observed hour |
| 2026-06-08 10:08 | - | - | - | - | 0 | 121 | - | - | Security Advisor milestone reached: no errors detected after Fix 4 execution |

## 6) Change Log (What Was Updated in This Plan)

| Date | Updated By | Summary |
|---|---|---|
| 2026-06-04 | Copilot | Created initial master plan, phase model, activity tracker, and metrics log baseline |
| 2026-06-04 | Copilot | Added authoritative dump governance rules (authority source, chunk mirror, no-invention, and conflict preference) |
| 2026-06-05 | Copilot | Added statement-timeout mitigation actions, tracker rows P1-05 to P1-07, and hot-query remediation matrix |
| 2026-06-05 | Copilot | Audited active authoritative dump and recorded schema/index/RLS/view truth plus drift findings in Section 10 |
| 2026-06-08 | Copilot | Refreshed production baseline from dashboard screenshots, replaced hot-query section using latest Supabase logs, and added tracker tasks P1-08/P1-09 |
| 2026-06-08 | Copilot | Logged Security Advisor Error export (23 errors), added first-3-fix execution order, and drafted Fix 1 migration file for `job_card_closed_data` RLS enablement |
| 2026-06-08 | Copilot | Validated Fix 1 against authoritative dump mirror: `job_card_closed_data` table and policy names are present in active dump; migration confirmed as authority-consistent and non-invented |
| 2026-06-08 | Copilot | Recorded post-Fix-1 Advisor delta (23 -> 21 errors) and created Fix 2 migration to set `vw_parts_stock_health` as `security_invoker` |
| 2026-06-08 | Copilot | Logged Fix 2 execution; checked authoritative dump mirror for next sensitive tables (`audit_logs`, `user_employee_links`) and confirmed table presence with no current RLS/policy entries in active dump |
| 2026-06-08 | Copilot | Logged post-Fix-2 Advisor delta (21 -> 20 errors, all RLS-disabled), and created Fix 3 migration for `user_employee_links` + `audit_logs` with baseline RBAC-safe policies |
| 2026-06-08 | Copilot | Logged post-Fix-3 Advisor delta (20 -> 18 errors) and created Fix 4 migration to enable RLS + baseline authenticated policies for all remaining flagged tables |
| 2026-06-08 | Copilot | Logged Fix 4 execution and Security Advisor milestone (Errors: 0); transitioned plan from error-clearance to least-privilege policy tightening |
| 2026-06-08 | Copilot | Started tightening Step 1 draft for warranty domain: constrained `p0_auth_delete` only (existing policy name) and added pre/post execution validation checklist |

## 7) Update Protocol For Future Chats

When new Supabase information arrives, update this file in this order:

1. Update Section 1 baseline snapshot (only fields that changed).
2. Update tracker row status/evidence/next action for impacted tasks.
3. Append one row to metrics log with the new timestamped readings.
4. Add one line in change log summarizing what changed.
5. If new risk appears, add a new tracker row with unique ID (for example `P1-05`).

Definition of done for tracker row:
- Status is `Done`.
- Evidence field has concrete proof.
- Next Action is `-`.

## 8) Optional Execution Cadence

- Daily (10 min): Advisor and metrics update.
- Weekly (30-45 min): Query performance + index follow-up.
- Monthly (45-60 min): RLS/auth policy audit + backup drill readiness.

## 8A) Step-by-Step Start (Base Track)

Use this sequence exactly. Do not start P1 actions until Step 4 is done.

Step 1 - Build Advisor inventory (P0-01)
- Open Supabase Dashboard -> Database -> Advisor.
- Export/copy all open findings.
- Classify each row by: severity, object type, object name, risk, fix owner.
- Fill the working table below.

Step 2 - Prioritize critical findings
- Filter severity = Critical/High.
- Mark quick-win fixes that do not require app contract changes.
- Set target date for each critical item.

Step 3 - Execute first 3 critical fixes
- Apply the fixes one-by-one (RLS/policy/auth setting).
- Capture evidence after each fix (screenshot or SQL evidence).

Step 4 - Re-validate and log
- Re-run Advisor.
- Update Section 4 tracker status and Section 5 metrics.
- Add one new row in Section 6 change log summarizing resolved findings.

### P0-01 Working Table (Fill During Step 1)

| Finding ID/Title | Severity | Object Type | Object Name | Risk Summary | Proposed Fix | Owner | Status | Evidence Link/Path |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  | Not Started |  |
|  |  |  |  |  |  |  | Not Started |  |
|  |  |  |  |  |  |  | Not Started |  |
|  |  |  |  |  |  |  | Not Started |  |
|  |  |  |  |  |  |  | Not Started |  |

### Step Gate (Must Pass Before P1)

- Gate G1: All Advisor findings inventoried and classified.
- Gate G2: At least 3 critical/high fixes completed with evidence.
- Gate G3: Advisor rerun completed and delta recorded.

### Step 1 Intake Snapshot (Received 2026-06-08)

Error inventory from Security Advisor export:
- Total errors: 23
- `rls_disabled_in_public`: 21
- `policy_exists_rls_disabled`: 1 (`public.job_card_closed_data`)
- `security_definer_view`: 1 (`public.vw_parts_stock_health`)

Grouped risk map:
- Sensitive identity/audit tables without RLS: `public.user_employee_links`, `public.audit_logs`.
- Core operations/reporting tables without RLS: job card, invoice, VAS, reception-adjacent, warranty, and staging/import tables.
- Privilege model inconsistency: `public.job_card_closed_data` already has policies but table RLS is disabled.
- View privilege bypass risk: `public.vw_parts_stock_health` flagged as security definer.

### Step 2 Priority Output (Execute In Order)

Fix 1 (highest confidence, lowest blast radius)
- Enable RLS on `public.job_card_closed_data` to align existing policies with enforcement.
- Expected lint delta: clears `policy_exists_rls_disabled` for this table and one `rls_disabled_in_public` entry.

Fix 2 (high impact)
- Change `public.vw_parts_stock_health` away from SECURITY DEFINER behavior (set security invoker or recreate view accordingly).
- Expected lint delta: clears `security_definer_view`.

Fix 3 (sensitive data containment)
- Enable RLS on `public.user_employee_links` and `public.audit_logs`, then attach least-privilege read/write policies for intended roles only.
- Expected lint delta: removes high-risk exposed-table errors for identity and audit domains.

Execution note:
- Apply each fix separately and rerun Advisor after each one; record screenshots/evidence per fix before proceeding.

Completion note (2026-06-08):
- Steps 1-4 completed for error elimination track; Security Advisor now reports 0 errors.
- Next track is policy hardening quality: replace broad baseline policies with least-privilege RBAC policies table-by-table.

## 9) Statement Timeout and Latency Hotlist (2026-06-08)

Observed issue:
- PostgREST list endpoints with LIMIT/OFFSET continue to dominate database time.
- High cache-hit rates (mostly ~100%) indicate logical query shape and row-width/scan patterns are the bottleneck, not disk I/O.
- A high-frequency Realtime WAL polling query is now a top time consumer and must be treated as first-class load.

Evidence summary from provided logs (ranked by proportional total time):
1. `service_parts_consumption_data` fiscal-year list (`authenticated`): 2322 calls, mean ~792 ms, max ~7.94 s, ~20.82% total DB time.
2. `service_reception_entries` full row list ordered by `created_at DESC` (`authenticated`): 1947 calls, mean ~610 ms, max ~1.85 s, ~13.46% total DB time.
3. `realtime.list_changes(...)` (`supabase_admin`): 164,784 calls, mean ~6.09 ms, max ~14.1 s, ~11.37% total DB time.
4. `COPY public.service_parts_stock_snapshot_data ... TO stdout` (`postgres`): 72 calls, mean ~13.8 s, ~11.25% total DB time (operational export workload).
5. `vw_parts_stock_health` weeks-of-supply filter (`anon` + `authenticated`): 5808 + 3887 calls, mean ~58-85 ms, combined ~7.57% total DB time.
6. `service_reception_entries` filtered by service type (`authenticated`): 703 calls, mean ~358 ms, ~2.85% total DB time.
7. `service_vas_jc_data` date-window read (`authenticated`): 6218 calls, mean ~38 ms, max ~6.38 s, ~2.67% total DB time.
8. `service_reception_entries` projected list (`authenticated`): 881 calls, mean ~264 ms, ~2.64% total DB time.
9. `service_reception_entries` exact-count pattern via `pgrst_source_count` CTE (`authenticated`): 159 + 617 calls, mean up to ~1.14 s, combined ~3.97% total DB time.
10. `service_parts_stock_snapshot_data` ordered list (`authenticated`): 87 calls, mean ~1.91 s, ~1.88% total DB time.

Interpretation:
- The largest user-facing pain remains broad list endpoints that over-fetch columns and rely on OFFSET pagination.
- Exact count requests in PostgREST are materially expensive at current table sizes.
- Realtime polling frequency is high enough to become a top shared-cost driver even with low per-call mean time.
- `index_advisor_result` is null for these log lines, so index work must be driven by EXPLAIN-based manual analysis.

Action matrix (execute in this order):
1. `service_parts_consumption_data` fiscal-year lookup
- Replace list scans with branch-scoped `SELECT DISTINCT fiscal_year` RPC.
- Add/verify index strategy: `(branch, fiscal_year)` with optional partial index where `fiscal_year IS NOT NULL`.
- Cache fiscal-year results per branch with short TTL.

2. `service_reception_entries` list endpoints
- Stop full-row list reads; use narrow projection in list views.
- Replace OFFSET with keyset cursor pagination using `(created_at, id)`.
- Add/verify index tuned for sort+seek path, for example `(created_at DESC, id DESC)` and common filters.

3. Exact-count endpoints
- Remove default `count=exact` usage on high-traffic pages.
- Use planned/estimated counts for list UX, and move exact counts to explicit on-demand actions or aggregate RPC.

4. `vw_parts_stock_health` reads
- Limit selected columns per widget.
- Push predicate selectivity to underlying indexed base tables used by the view.
- Enforce widget-level default limits and lazy-load deep slices.

5. Realtime load (`realtime.list_changes`)
- Inventory active channels and remove duplicate/idle subscriptions.
- Reduce client reconnection churn and enforce channel teardown on navigation/unmount.
- Scope subscriptions to only required schemas/tables/events.

6. `service_vas_jc_data` and `job_card_closed_data` date scans
- Make date windows mandatory in API and UI defaults.
- Add/verify composite indexes on date plus branch/service-type predicates used in report paths.
- Move heavy aggregations into SQL/RPC group-by endpoints.

7. Export workload isolation
- Treat `COPY ... TO stdout` entries as operational jobs; schedule outside peak user windows where possible.
- Cap export concurrency and separate from interactive report traffic.

Immediate success criteria for next measurement cycle:
1. Reduce combined proportional time of the top two application query families by at least 30%.
2. Cut exact-count query family proportional time by at least 50%.
3. Keep connection usage below 70% of pool under normal peak.
4. Re-capture logs after each index/query-shape batch and append to Sections 5 and 6.

## 10) Authoritative Database Truth Audit (From Active Dump)

Audit date: 2026-06-05  
Authority source used: `local_folder/backups/full_database.sql`  
Mirror used for large-file access fallback: `local_folder/backups/chunks/full_database.sql.part_*`

Evidence snapshot captured from dump:
- Header confirms: Dump started `2026-06-05 10:06:12 IST`, dumped by `pg_dump 17.7`, DB version `17.6`.
- Public schema object declarations (`CREATE TABLE/VIEW/MATERIALIZED VIEW` + public alter-table declarations counted in audit command): `139` matches.
- Public functions count (`CREATE FUNCTION public.*`): `29`.
- Public triggers count (`CREATE TRIGGER ... ON public.*`): `40`.
- Public RLS-enabled tables count (`ALTER TABLE public.* ENABLE ROW LEVEL SECURITY`): `24`.
- Public policies count (`CREATE POLICY ... ON public.*`): `95`.

Timeout-hot relations confirmed present in authoritative dump:
- `job_card_closed_data`
- `part_master`
- `service_parts_consumption_data`
- `service_parts_stock_snapshot_data`
- `service_reception_entries`
- `service_vas_jc_data`
- `warranty_claim_settlement_report_data`
- `warranty_fsb_data`
- `warranty_updation_claim_data`
- `warranty_wc_data`

Index truth (authoritative dump excerpts):
- `service_parts_consumption_data` has branch/date and branch/portal/fiscal indexes (`idx_parts_consumption_branch_date`, `idx_parts_consumption_branch_portal_fiscal`) plus part-number and uniqueness indexes.
- `service_parts_stock_snapshot_data` has branch/date and branch/portal/date-desc indexes (`idx_parts_stock_branch_date`, `idx_parts_stock_branch_portal_date`) plus part-number indexes.
- `service_reception_entries` has dealer+created, jc_number, reg_number, and SA lookup indexes.
- `service_vas_jc_data` has employee_code, job_card+branch, and sr_type indexes.
- Warranty tables have branch+portal indexes for listed hot tables.

RLS and policy truth for timeout-hot relations:
- RLS enabled and policy-backed in dump: `part_master`, `service_parts_consumption_data`, `service_parts_stock_snapshot_data`, `service_reception_entries`.
- No `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` or `CREATE POLICY ... ON ...` statements found in dump for: `job_card_closed_data`, `service_vas_jc_data`, `warranty_wc_data`, `warranty_updation_claim_data`, `warranty_claim_settlement_report_data`, `warranty_fsb_data`.

View truth and detected schema drift (authoritative-first):
- Current view definition found: `public.vw_parts_stock_health`.
- No current `CREATE VIEW public.vw_parts_latest_stock` or `CREATE VIEW public.vw_parts_consumption_trend` object definitions found in active dump object section.
- References to `vw_parts_latest_stock` and `vw_parts_consumption_trend` appear in migration history SQL text payloads, not as current dumped objects.

Conflict handling applied:
- Per Rules R7-R10, this plan prefers active local dump truth without reconciliation to prior assumptions.
- Any remediation/migration decisions must start from this audited object set and not from inferred/missing objects.

## 11) Full Frontend + Dump Compatibility Audit (Pre-Tightening, 2026-06-08)

Audit objective:
- Verify that next-phase policy tightening will not break existing web/mobile behavior.
- Restrict evidence to authoritative dump mirror and current frontend query paths.

Authority used for this audit:
- Mirror source: `local_folder/backups/chunks/full_database.sql.part_*`.
- Conflict rule applied: if any prior note conflicts with mirror evidence, mirror evidence wins.

### 11.1 Frontend Query Surface (Evidence)

Web application touchpoints that rely on soon-to-tighten tables:
- `src/pages/SettingsPage.tsx`: reads/updates `import_employee_mapping_issues` and updates `service_vas_jc_data` during pendency resolution workflows.
- `src/pages/ImportPage.tsx`: upload pipeline writes to import/report tables with insert/upsert and duplicate handling.
- `src/lib/reportQueries.ts`: paginated read paths over `service_vas_jc_data` and `service_invoice_data` power core reports.
- `src/lib/warranty/jsonExtraction.ts`: warranty KPI extraction reads `warranty_*` tables and still uses exact-count on `warranty_wc_data`.
- `src/pages/reports/labour-revenue/*.tsx`: reads `service_invoice_order_data` for labour-revenue reporting.
- `src/lib/api/userEmployeeLinks.ts` and `src/lib/api/auth.ts`: dealer and mapping resolution paths depend on `user_employee_links` read/write semantics.

Mobile application touchpoints that rely on soon-to-tighten tables:
- `mobile/src/lib/reportQueries.ts`: heavy paginated reads on `service_vas_jc_data` and `service_invoice_data`.
- `mobile/src/app/(tabs)/floor-incharge.tsx`: reads `open_job_cards`, `employee_master`, and writes `technician_assignments`.
- `mobile/src/app/(tabs)/import.tsx`: generic insert/upsert import runner for configured data tables.

### 11.2 Authoritative Dump Cross-Check (2026-06-08)

Confirmed in mirror:
- All 18 previously flagged tables exist in public schema.
- Public RBAC helper functions used by frontend are present: `is_admin`, `has_module_view`, `has_module_modify`, `has_module_delete`, `get_all_my_permissions`, `my_dealer_code`, `my_sa_employee_code`, `user_has_employee_code`.
- RLS is enabled for the previously flagged table set.
- Policy baseline now includes both:
	- `admin_unrestricted_all_ops_v1` (admin bypass), and
	- `p0_auth_select/insert/update/delete` (broad authenticated baseline) on the same table family.

Governance delta note:
- Section 10 historical snapshot (2026-06-05) remains valuable as point-in-time evidence, but current mirror now reflects post-fix policy state.
- Any upcoming tightening must start from this current mirror policy baseline, not from the older pre-fix snapshot.

### 11.3 No-Break Guardrails For Tightening

Do not remove required read paths before replacement policies are validated:
- Keep authenticated read continuity for `service_vas_jc_data`, `service_invoice_data`, and `service_invoice_order_data` (web + mobile report stack).
- Keep authenticated read continuity for `warranty_*` tables used by warranty overview/extraction paths.
- Keep authenticated read/update continuity for `import_employee_mapping_issues` and update path for `service_vas_jc_data` used by settings pendency resolution.
- Keep authenticated read continuity for `open_job_cards` for floor-incharge mobile screen.
- Keep `user_employee_links` compatibility: admin CRUD + self-scope reads required by auth context resolution flows.

Tightening method contract:
- Migrate table-by-table by domain.
- For each table, replace `p0_auth_*` only after introducing scoped policy equivalent.
- Validate affected web/mobile screens immediately after each table batch.

### 11.4 Tightening Order (Risk-Managed)

1. Warranty tables (`warranty_*`): convert broad authenticated policies to admin + explicit module/dealer-scoped read/write where applicable.
2. Service reporting tables (`service_vas_jc_data`, `service_invoice_data`, `service_invoice_order_data`, `service_jc_parts_data`): preserve report reads while constraining writes.
3. Import and reconciliation tables (`import_employee_mapping_issues`, `pending_drive_uploads`, `open_job_cards_import_staging`): scope write paths to importer/admin roles.
4. Operational/staging tables (`cancel_job_card`, `closed_but_not_invoiced`, `open_job_cards`, `job_card_closed_data_duplicates_backup`): restrict to explicit operational roles/admin.

### 11.5 Exit Gate Before First Tightening Migration

- Gate T1: This audit section reviewed and accepted.
- Gate T2: Current authoritative mirror considered source of truth for policy text.
- Gate T3: First tightening batch includes rollback SQL and post-check query list.

## 12) Tightening Step 1 - Warranty Domain (Draft + Checklist)

Migration draft (not yet executed in this plan log):
- `supabase/migrations/20260608113000_p0_step1_warranty_tighten_delete_policy.sql`

Step 1 scope:
- Tables:
	- `warranty_claim_settlement_report_data`
	- `warranty_part_wc_data`
	- `warranty_updation_claim_data`
	- `warranty_goodwill_data`
	- `warranty_amc_data`
	- `warranty_fsb_data`
	- `warranty_wc_data`
- Policy action:
	- Replace existing `p0_auth_delete` only.
	- New delete condition uses existing RBAC helpers: `public.is_admin() OR public.has_module_delete('reports')`.
- Non-goals in Step 1:
	- No change to `p0_auth_select`, `p0_auth_insert`, `p0_auth_update` yet (to protect report reads and import/upsert continuity).

Validation checklist (run immediately after execution):

Pre-check SQL:
1. Confirm policy text before run:
	 - `select tablename, policyname, cmd, qual from pg_policies where schemaname='public' and policyname='p0_auth_delete' and tablename like 'warranty_%' order by tablename;`

Post-check SQL:
1. Confirm delete policy changed on all 7 tables:
	 - same query as pre-check; verify `qual` contains `is_admin` or `has_module_delete('reports')`.
2. Confirm select/insert/update policies remain present:
	 - `select tablename, policyname, cmd from pg_policies where schemaname='public' and tablename like 'warranty_%' and policyname in ('p0_auth_select','p0_auth_insert','p0_auth_update') order by tablename, policyname;`
3. Confirm Security Advisor remains zero errors.

Frontend/runtime validation:
1. Web: open `Reports -> Warranty Overview` and load KPIs/charts without permission errors.
2. Web: run one warranty report import from `ImportPage` and verify insert/upsert success.
3. Mobile: run warranty-related report queries used in `mobile/src/lib/reportQueries.ts` for one branch/date range.
4. Verify no new `permission denied` errors in console/network logs for warranty tables.

Rollback plan (if breakage appears):
1. Recreate previous broad `p0_auth_delete ... using (true)` for only affected warranty tables.
2. Re-run post-check SQL and confirm recovery.
