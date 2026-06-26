# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-06-25
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime (latest, 2026-06-25): RAM 64%, CPU 15%, disk 36%, connections 25/60
- Traffic (latest capture window): Query Performance reports 935 slow queries in window; top load concentrated in PostgREST list/count family on `service_reception_entries`
- Advisory state: Security Advisor Errors already cleared (0 on 2026-06-08 milestone); current operational risk moved to Disk IO budget depletion warning
- Migration visibility: last migration shown as `parts_phase1_alignment`
- Operational flags: no backups configured, no repo connected in dashboard
- DB observability windows:
	- 2026-06-08 08:53-09:53 IST: memory usage ~408 MB, memory commitment ~1.33 GB, sustained cache-heavy read profile
	- 2026-06-25: Disk IO budget warning active in dashboard banner; Query Performance + EXPLAIN evidence indicates query-shape and list/count frequency as primary driver
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
| P0-03 | Critical | Define least-privilege policies for `anon` and `authenticated` | Team | Done | 2026-06-08 | 2026-06-08 | Step 1-4 fully validated: `p0_auth_delete` tightened across warranty, service, import/reconciliation, and operational/staging domains; baseline policies and RLS confirmed on all scoped tables. | 2026-06-08 | - |
| P0-04 | High | Restrict `anon` API key permissions in settings | Team | Done | 2026-06-08 | 2026-06-08 | Migration executed: `20260608182000_p0_04_restrict_anon_public_surface.sql`; post-check confirms complete anon surface elimination: `public_policy_rows=0`, `anon_table_grants=0`, `anon_function_grants=0` (vs baseline 25/322/31). | 2026-06-08 | - |
| P0-05 | High | Enable leaked-password protection in Auth | Team | Blocked | 2026-06-08 | N/A | Feature requires Pro plan tier; techwheels-services project is Free tier. Rollout checklist prepared for future upgrade: `docs/Implementation_plans/webversion/categories/supabase/evidence/runbooks/SUPABASE_P0_05_LEAKED_PASSWORD_ROLLOUT_CHECKLIST.md` | 2026-06-08 | Upgrade to Pro tier if security requirement mandates leaked-password protection, then execute P0-05 checklist |
| P1-01 | Critical | Move app DB connection usage to pooler URL | Team | Done | 2026-06-08 | 2026-06-08 | Comprehensive audit completed: web/mobile apps use REST API (pooling built-in); no direct postgres connections in runtime code. Optional pooler update available for scripts but not critical. Audit report: `docs/Implementation_plans/webversion/categories/supabase/evidence/P1_01_CONNECTION_POOLING_AUDIT.md` | 2026-06-08 | - |
| P1-02 | High | Accept and triage Index Advisor suggestions | Team | Not Started |  |  |  | 2026-06-04 | Mark suggestions as apply/defer/reject with reason |
| P1-03 | High | Analyze top 3-5 slow queries in dashboard | Team | Done | 2026-06-08 | 2026-06-08 | Comprehensive slow query analysis completed: ranked top 10 query families by proportional DB time (20.82% down to 1.88%), identified root causes (OFFSET pagination, missing indexes, wide projections), provided EXPLAIN strategy + recommended indexes. Analysis: `docs/Implementation_plans/webversion/categories/supabase/evidence/P1_03_SLOW_QUERY_ANALYSIS.md` | 2026-06-08 | - |
| P1-04 | High | Add and verify indexes for sequential scans | Team | Done | 2026-06-08 | 2026-06-08 | 4 migration files created and audited against authoritative dump (full_database.sql). 2 CRITICAL + 2 OPTIONAL indexes: `idx_reception_entries_branch_created_at_desc` (missing branch+created index for Query 2), `idx_vas_jc_data_branch_created_at_desc` (missing branch+created for Query 7), `idx_parts_consumption_branch_fiscal_year_desc` (complementary to portal-based index), `idx_stock_snapshot_branch_snapshot_date_desc` (optional complement). All columns/tables verified in authoritative dump. Ready for execution. | 2026-06-08 | - |
| P1-04 | High | Add and verify indexes for sequential scans | Team | Done | 2026-06-08 | 2026-06-08 | 4 migration files created, audited, and DEPLOYED in Supabase. All indexes confirmed in production: idx_reception_entries_branch_created_at_desc, idx_vas_jc_data_branch_created_at_desc, idx_parts_consumption_branch_fiscal_year_desc, idx_stock_snapshot_branch_snapshot_date_desc. Ready for P1-05 query rewrites. | 2026-06-08 | Execute P1-05 query rewrites (keyset pagination) |
| P1-05 | Critical | Remove fetch-all patterns from reports and warranty JSON extractors | Team | In Progress | 2026-06-08 |  | Tier A code pass applied (exact-count probe removal + date-scoped SA fetch + VAS keyset loop), but immediate recapture still shows unchanged cumulative totals on top query IDs. | 2026-06-25 | Validate deployed build is serving traffic, then run time-window delta capture (before/after snapshot method) instead of relying on cumulative totals |
| P1-06 | High | Replace OFFSET scans with cursor pagination in large tables/views | Team | In Progress | 2026-06-25 |  | Post-index verification now shows Index Scan plans for reception, technician, and VAS ordered list checks; residual load is now primarily query-shape/call-frequency (`OFFSET` + default exact-count) rather than missing sort-path indexes. | 2026-06-25 | Execute Tier A code patches from exact-count checklist and complete cursor contract rollout in web/mobile list endpoints |
| P1-07 | High | Add targeted composite/partial indexes for timeout hotlist queries | Team | Done | 2026-06-25 | 2026-06-25 | Migration executed successfully (`supabase/migrations/20260625221000_p1_07_disk_io_hotlist_indexes.sql`); check output confirms all 4 indexes exist and all 3 hot EXPLAINs switched from Seq Scan + Sort to Index Scan (`idx_sre_created_at_id_desc`, `idx_ta_updated_assigned_desc`, `idx_vas_jc_closed_branch`). | 2026-06-25 | - |
| P1-08 | High | Reduce Realtime WAL polling cost and fan-out | Team | In Progress | 2026-06-25 |  | `realtime.list_changes` remains high-frequency (`queryid=-2876120296317350531`, `calls=612039`, `total_ms=3832695.82`, `mean_ms=6.26`). | 2026-06-25 | Inventory channels per screen and remove duplicate subscriptions; verify drop in calls and proportional time in next capture |
| P1-09 | High | Eliminate expensive exact-count list patterns in PostgREST paths | Team | In Progress | 2026-06-25 |  | Dominant reception family still tops cumulative totals and additional reception list IDs surfaced in latest capture (`-225245605736690330`, `-922008049376959953`, `852176900607336119`, `2744925251257801673`) with `OFFSET` signatures. | 2026-06-25 | Run strict A/B interval delta capture after deploy traffic and rank by `delta_total_ms` (not cumulative totals) before next code batch |
| P1-10 | Critical | Disk IO budget incident response (query-shape mitigation first) | Team | In Progress | 2026-06-25 | 2026-06-27 | Latest post-deploy check remains cumulative-flat on prior top IDs while reception query family spread increased across additional list IDs; Realtime/COPY still persistent secondary contributors. | 2026-06-25 | Execute 10-minute controlled delta protocol (A/B snapshots on tracked + newly surfaced IDs), then target top `delta_total_ms` family first |
| P1-11 | Critical | Log-driven performance tracker (rolling updates from every new capture) | Team | In Progress | 2026-06-25 |  | Established explicit update protocol in Section 14.5 with required evidence fields from each new log drop (top queries, plans, index/seq-scan deltas, action status). | 2026-06-25 | For each new log bundle: update Section 14.1/14.2 table rows, then sync affected tracker lines P1-05..P1-10 same day |
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Not Started |  |  |  | 2026-06-04 | Define endpoint + schedule + monitoring |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | In Progress | 2026-06-05 |  | Fresh authoritative dump refreshed and audited on 2026-06-25 using manifest baseline (`sha256=56cc1ef74d7c5482200b1f04d7b6404bf71a2d29c3f5addc7b4788472f7f9e35`, `created_at_utc=2026-06-25T15:02:12Z`) plus overlay file `supabase/evidence/post_dump_verified_promotions.md`. | 2026-06-25 | Use Section 10 + Section 14 truth to generate migration/check files for performance index fixes, then validate via post-change EXPLAIN |
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
| 2026-06-25 | 64% | 15% | 36% | 25/60 | - | - | - | - | New Disk IO budget warning visible in Observability; Query Performance shows 935 slow queries with `service_reception_entries` exact-count/list family as primary load driver |
| 2026-06-25 (SQL audit) | - | - | - | - | - | - | - | - | `pg_stat_statements` confirmed in `extensions` schema; reception list EXPLAIN still uses Seq Scan + Sort for `ORDER BY created_at DESC, id DESC`; date-range count path is fast in isolation but high-frequency in production |
| 2026-06-25 (dump refresh audit) | - | - | - | - | - | - | - | - | Authoritative dump refreshed: `local_folder/backups/full_database.sql` (105 MB) + chunk mirror (`part_000`..`part_005`), baseline marker from `supabase/evidence/authoritative_dump_manifest.json`; overlay promotions file currently contains no promoted SQL entries in active window |
| 2026-06-25 (full SQL check pack) | - | - | - | - | - | - | - | - | Top total-time family is reception exact-count (`queryid=6416750758406621842`, `total_ms=82854948.73`); EXPLAIN for reception/technician/VAS list paths all show Seq Scan + Sort; top IO-heavy queries are COPY exports |
| 2026-06-25 (post-index verification) | - | - | - | - | - | - | - | - | Migration `20260625221000` executed and verified: all new indexes present; reception/technician/VAS verification EXPLAINs now use Index Scan paths; next impact step is code-side exact-count and OFFSET reduction |
| 2026-06-25 (post-code recapture) | - | - | - | - | - | - | - | - | Latest top-query outputs remain effectively unchanged vs prior capture (`queryid=6416750758406621842` still `calls=38386`, `total_ms=82854948.73`), indicating cumulative-window/no-traffic-delta view; shift measurement to interval delta method |
| 2026-06-25 (post-deploy reception family recapture) | - | - | - | - | - | - | - | - | New reception IDs entered hotlist while legacy top IDs remained cumulative-flat (`6416750758406621842`, `-5344960703026327435`, `-225245605736690330`, `2744925251257801673` etc.); classify as insufficient interval evidence until A/B delta window is captured |
| 2026-06-26 (overnight no-delta snapshot) | - | - | - | - | - | - | - | - | Overnight capture remained numerically identical to prior baseline for all tracked IDs (including dominant reception IDs), indicating no measurable interval movement in sampled window |
| 2026-06-26 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83; comparison=regressed; delta_total_ms_sum=37711.57 |
| 2026-06-26 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83; comparison=regressed; delta_total_ms_sum=16722.77 |

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
| 2026-06-08 | Copilot | Logged Step 1 warranty tightening migration execution; next checkpoint is SQL + frontend/mobile validation before Step 2 |
| 2026-06-08 | Copilot | Step 1 warranty tightening validated (policy + baseline + RLS checks passed); prepared Step 2 service-domain delete-policy tightening draft and SQL checks |
| 2026-06-08 | Copilot | Step 2 service-domain tightening validated (policy + baseline + RLS checks passed); prepared Step 3 import/reconciliation delete-policy tightening draft and SQL checks |
| 2026-06-08 | Copilot | Step 3 import/reconciliation tightening validated (policy + baseline + RLS checks passed); prepared Step 4 operational/staging delete-policy tightening draft and SQL checks |
| 2026-06-08 | Copilot | Step 4 operational/staging tightening executed; delete-policy and baseline-policy checks passed for all 4 tables; awaiting explicit RLS output rows to close P0-03 |
| 2026-06-08 | Copilot | Step 4 RLS confirmation received (`rls_enabled=true` for all 4 tables); closed P0-03 and marked staged `p0_auth_delete` tightening complete |
| 2026-06-08 | Copilot | Started P0-04/P0-05 next steps: created anon-surface pre/post SQL check pack and leaked-password rollout checklist; moved both tracker rows to In Progress |
| 2026-06-08 | Copilot | Logged P0-04 pre-check baseline output: 25 public/anon policy rows, 322 anon table grants, 31 anon function grants; queued dashboard restriction + post-check diff |
| 2026-06-08 | Copilot | Logged P0-04 post-check attempt: no delta vs baseline (25/322/31). Marked P0-04 blocked until dashboard restriction is effectively applied and verified by reduced counts |
| 2026-06-08 | Copilot | Prepared DB-level P0-04 unblock migration to re-scope `{public}` policies to `authenticated` and revoke anon public-schema grants; added dedicated post-migration check file |
| 2026-06-08 | Copilot | Executed P0-04 migration; post-check confirms complete anon surface elimination (0/0/0 from baseline 25/322/31); closed P0-04 as Done and queued P0-05 validation |
| 2026-06-08 | Copilot | Attempted P0-05 leaked-password protection enablement via dashboard. Feature requires Pro plan; techwheels-services is Free tier. Marked P0-05 as Blocked with rollout checklist prepared for future upgrade. |
| 2026-06-08 | Copilot | Completed P1-01 audit: Connection string usage audited in web/mobile/edge-functions/scripts. Confirmed REST API pattern (pooling built-in), no direct postgres migration needed. Marked P1-01 Done. |
| 2026-06-08 | Copilot | Completed P1-03 analysis: Top 10 slow queries ranked by proportional DB time. Root causes identified (OFFSET pagination, missing indexes, wide projections). 4 high-impact indexes recommended. Created P1_03_SLOW_QUERY_ANALYSIS.md. Marked P1-03 Done. |
| 2026-06-08 | Copilot | Completed P1-04 migrations: Audited 4 target tables against authoritative dump (full_database.sql + chunks mirror). All columns verified in schema. Created 4 migration files: 2 CRITICAL (reception_entries, vas_jc_data branch+created indexes), 2 OPTIONAL (complementary fiscal/snapshot). Created P1_04_INDEX_AUDIT_REPORT.md with full governance audit. Marked P1-04 Done. |
| 2026-06-08 | Copilot | Completed P1-04 migrations: Audited 4 target tables against authoritative dump (full_database.sql + chunks mirror). All columns verified in schema. Created 4 migration files: 2 CRITICAL (reception_entries, vas_jc_data branch+created indexes), 2 OPTIONAL (complementary fiscal/snapshot). Created P1_04_INDEX_AUDIT_REPORT.md with full governance audit. Marked P1-04 Done. |
| 2026-06-08 | User | Executed all 4 P1-04 migration files in Supabase. Deployment confirmed: all indexes now present in production database. 2 CRITICAL indexes deployed (reception_entries, vas_jc_data); 2 OPTIONAL indexes deployed (parts_consumption, stock_snapshot). Ready for P1-05 query rewrites. |
| 2026-06-08 | Copilot | Crash-recovery continuation: appended P1-05 execution pack (query rewrite batches, exact-count removal strategy, validation SQL, rollback, and completion gates) so implementation can resume without context loss. |
| 2026-06-08 | Copilot | Implemented first P1-05 code batch: web/mobile `reportQueries` switched core VAS + parts-consumption loops from OFFSET (`.range`) to keyset (`order+limit+cursor`), reception list APIs moved to keyset ordered reads, and `count: 'exact'` replaced with `count: 'estimated'` in high-frequency dashboard/warranty count paths. |
| 2026-06-08 | Copilot | Resolved follow-up build regression from P1-05 reception keyset helper (`src/lib/api/reception.ts`): fixed TypeScript cast mismatch surfaced on Vercel (`GenericStringError[]` overlap), verified clean local build (`npm run build` success). |
| 2026-06-25 | Copilot | Updated this plan for the next active work item only: moved P1-08 and P1-09 to In Progress using latest Query Performance evidence, added P1-10 Disk IO budget incident response row, and appended current Observability metrics snapshot. |
| 2026-06-25 | Copilot | Integrated latest provided SQL/performance logs into baseline + tracker: marked P1-06/P1-07 as In Progress, added P1-11 rolling log tracker, and appended Section 14 with DB-truth-backed fix pack + update template for future log captures. |
| 2026-06-25 | Copilot | Audited freshly refreshed authoritative dump using manifest baseline marker and post-dump overlay rules; replaced Section 10 with current dump truth (counts, key table/index presence, candidate index gaps) and synced tracker/metrics for next fix phase. |
| 2026-06-25 | Copilot | Ingested full SQL check pack results (columns, top-time/top-IO queries, seq/index scans, table IO, plan checks) and updated tracker evidence with exact query IDs/numbers plus a concrete ranked capture block in Section 14. |
| 2026-06-25 | Copilot | Created pending execution artifacts for fix rollout: migration `20260625221000_p1_07_disk_io_hotlist_indexes.sql`, verification checks `20260625221000_p1_07_disk_io_hotlist_indexes_checks.sql`, and code-side checklist `P1_09_EXACT_COUNT_REMOVAL_CHECKLIST_2026-06-25.md`; linked all three into tracker rows. |
| 2026-06-25 | Copilot | Recorded successful execution/verification of migration `20260625221000`: marked P1-07 Done, logged Index Scan plan shifts for reception/technician/VAS, and moved next priority to code-side exact-count and OFFSET reduction (P1-06/P1-09). |
| 2026-06-25 | Copilot | Logged latest post-code query capture from user: top query totals/calls still match prior cumulative values, so plan now requires interval-based delta measurement before judging code impact; updated tracker next actions accordingly. |
| 2026-06-25 | Copilot | Appended post-deploy reception-family capture from user showing unchanged cumulative leaders plus newly surfaced reception list query IDs; updated plan to require strict A/B interval delta scoring before next patch batch. |
| 2026-06-26 | Copilot | Logged overnight tracked-ID snapshot from user as no-delta (all key counters unchanged), and tightened next step to a controlled synthetic-traffic A/B window to force measurable deltas. |
| 2026-06-26 | Copilot | Automated Supabase audit cycle appended run summary (2026-06-26T04:30:23.188Z) and refreshed plan evidence block from generated audit artifacts. |
| 2026-06-26 | Copilot | Automated Supabase audit cycle appended run summary (2026-06-26T04:33:21.433Z) and refreshed plan evidence block from generated audit artifacts. |

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

This section has been intentionally minimized to prevent long-run file bloat.

Historical step-by-step playbooks that are already executed and verified are archived in evidence and git history.
The active rule is:
- Keep only current tracker status in Section 4.
- Keep only recent, decision-relevant evidence in Section 14.
- Keep only the latest two automated audit records in Sections 5, 6, and 14 snapshots.

## 9) Archived Execution Notes

- Detailed legacy execution runbooks from completed phases are retired from this active plan file.
- Authoritative evidence remains in:
  - `supabase/evidence/audit_runs/`
  - executed migration/check files under `supabase/migrations/` and `supabase/sql-checks/`
  - repository git history for historical narrative detail

## 10) Active Evidence Scope

Only retain in this file:
- live status rows in Section 4
- latest two automated metrics rows in Section 5
- latest two automated changelog rows in Section 6
- latest two capture snapshots with compact top-10 and comparison in Section 14

## 14) 2026-06-25 Log Audit + DB-Truth Fix Plan (Rolling)

Purpose:
- Keep one continuously updated performance-audit section tied to real logs and authoritative DB truth.
- Every new log bundle updates this section first, then Section 4 tracker rows.

### 14.1 Evidence Ingested (Current Batch)

Sources provided (2026-06-25):
- Supabase Observability screenshots: Disk IO warning, Query Performance overview.
- SQL outputs from:
  - `extensions.pg_stat_statements` query-family export.
  - `pg_stat_user_indexes` high-usage index inventory.
  - `pg_stat_user_tables` seq-scan pressure inventory.
  - `EXPLAIN (ANALYZE, BUFFERS)` for reception list order query.
  - `EXPLAIN (ANALYZE, BUFFERS)` for reception date-window count query.

Validated DB-truth notes:
- `pg_stat_statements` relation is in schema `extensions` (not `public` on this project).
- Existing reception index set includes `idx_service_reception_entries_dealer_created` and lookup indexes, but EXPLAIN confirms no direct sort-path index for plain `ORDER BY created_at DESC, id DESC` list query.

### 14.2 Ranked Findings (From Current Batch)

1. Primary bottleneck: PostgREST `service_reception_entries` list + exact-count family.
- Evidence: high call volume and highest proportional total time (~56.7% for exact-count-shaped family in provided Query Performance table).
- Effect: sustained IO/CPU pressure from frequent count/list execution.

2. Reception ordered list plan still non-optimal.
- Evidence: EXPLAIN shows `Seq Scan` + `Sort (top-N heapsort)` for `ORDER BY created_at DESC, id DESC LIMIT 100`.
- Effect: repeated sort and broader heap traversal than needed.

3. Date-window count query itself is not slow, but high-frequency count usage is expensive at system level.
- Evidence: isolated EXPLAIN count ~3.38 ms via index-only scan, yet count family dominates total workload share due to call frequency.

4. Additional scan pressure persists in `technician_assignments` and `service_vas_jc_data`.
- Evidence: `pg_stat_user_tables` shows notable seq_scan counts; current index usage suggests partial mismatch to active list/order query shapes.

5. Export (`COPY ... TO stdout`) workload is a meaningful IO consumer.
- Evidence: high `shared_blks_read` and large total time in provided top query rows.

### 14.3 Fix Plan (Execute In Order; DB-Truth Aligned)

Fix A (query-shape, no schema change):
1. Remove default exact-count from high-traffic list APIs (`service_reception_entries` first).
2. Keep exact counts only for explicit, user-triggered reporting/export actions.
3. Enforce narrow list projection (no broad row payload in list endpoints).

Fix B (query-shape, app layer):
1. Standardize keyset pagination on `(created_at, id)` for reception lists (web + mobile parity).
2. Ensure cursor predicate uses `(created_at < cursor_created_at) OR (created_at = cursor_created_at AND id < cursor_id)`.

Fix C (schema migration set, from log audit):
1. Add `service_reception_entries` sort-path index:
	- `(created_at DESC, id DESC)`
2. Add filtered reception index for service-type path:
	- `(service_type, created_at DESC, id DESC)` with predicate `jc_number IS NOT NULL AND jc_number <> ''`
3. Add technician assignment order index:
	- `(updated_at DESC, assigned_at DESC)`
4. Add VAS date-window support index:
	- `(jc_closed_date_time DESC, branch)`

Fix D (operational load control):
1. Schedule/export throttle for `COPY ... TO stdout` tasks outside peak interactive windows.
2. Cap concurrent export jobs.

Execution governance:
- Follow migration workflow rule already active in repo:
  - add migration SQL under `supabase/migrations/`
  - add matching checks under `supabase/sql_checks/`
  - after successful user execution, promote to executed folders and log in `docs/db-changes.md`

### 14.4 Success Criteria + Verification Pack

Primary targets for next 24-48h capture:
1. Reduce `service_reception_entries` count/list family proportional total time by at least 30%.
2. Remove Seq Scan + Sort for plain reception ordered list; plan should use index scan path.
3. Stabilize connections under 70% pool utilization during normal peak.

Verification SQL (post-fix):
1. Re-run top query-family extract from `extensions.pg_stat_statements`.
2. Re-run `EXPLAIN (ANALYZE, BUFFERS)` for:
	- reception ordered list
	- reception date-window count
3. Re-run `pg_stat_user_tables` seq/index scan snapshot for:
	- `service_reception_entries`
	- `technician_assignments`
	- `service_vas_jc_data`

### 14.5 Rolling Update Template (Use For Every New Log Drop)

For each new log bundle, append one update block here with:
1. Timestamp + source window.
2. Top 5 query families by total_time share.
3. One-line plan status per fix bucket (A/B/C/D): `Not Started` | `In Progress` | `Done`.
4. Plan delta summary:
	- improved
	- unchanged
	- regressed
5. Tracker sync checklist:
	- update Section 4 rows P1-05, P1-06, P1-07, P1-08, P1-09, P1-10, P1-11 as needed
	- append one metrics row in Section 5
	- append one change log row in Section 6

### 14.24 Capture Snapshot: 2026-06-26 (Automated Audit Cycle)

What was captured:
- Timestamp: 2026-06-26T04:30:23.188Z
- Capture mode: automated_supabase_audit_cycle
- Top queryid: 6416750758406621842 (calls=38414, total_ms=82890843.76, mean_ms=2157.83)
- Platform logs capture status: auth=ok, edge_functions=ok, realtime=ok, storage=ok, database_health=ok
- Comparison vs previous run (2026-06-26__04-24-40-091Z): status=regressed, delta_total_ms_sum=37711.57, delta_calls_sum=217
- Top regressions by delta_total_ms: -5344960703026327435 (16124.2); 7336725908253715888 (5670.2); -2647655532108368607 (3352.85)

Compact Top 10 (run-local):
| rank | queryid | calls | total_ms | mean_ms |
|---:|---|---:|---:|---:|
| 1 | 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| 2 | -5344960703026327435 | 6654 | 14037784.55 | 2109.68 |
| 3 | -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| 4 | -225245605736690330 | 3202 | 4172183.95 | 1302.99 |
| 5 | -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| 6 | -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 7 | 3220864789079889211 | 4098 | 3018048.70 | 736.47 |
| 8 | -2647655532108368607 | 4350 | 2903452.88 | 667.46 |
| 9 | -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 10 | 852176900607336119 | 2236 | 2620111.02 | 1171.78 |

Interpretation:
- This snapshot is append-only and intended to keep log evidence current for the hardening cycle.
- Prioritize fixes by highest delta_total_ms and call movement from run-to-run comparison.

Self-heal plan:
- Continue monitoring and prioritize top delta_total_ms queryids in next patch batch.

Next action:
- Re-run the cycle after the next production traffic window and validate that comparison status moves toward improved.

### 14.25 Capture Snapshot: 2026-06-26 (Automated Audit Cycle)

What was captured:
- Timestamp: 2026-06-26T04:33:21.433Z
- Capture mode: automated_supabase_audit_cycle
- Top queryid: 6416750758406621842 (calls=38414, total_ms=82890843.76, mean_ms=2157.83)
- Platform logs capture status: auth=ok, edge_functions=ok, realtime=ok, storage=ok, database_health=ok
- Comparison vs previous run (2026-06-26__04-30-23-188Z): status=regressed, delta_total_ms_sum=16722.77, delta_calls_sum=109
- Top regressions by delta_total_ms: -5344960703026327435 (6379.24); -225245605736690330 (4492.58); 3220864789079889211 (1698.41)

Compact Top 10 (run-local):
| rank | queryid | calls | total_ms | mean_ms |
|---:|---|---:|---:|---:|
| 1 | 6416750758406621842 | 38414 | 82890843.76 | 2157.83 |
| 2 | -5344960703026327435 | 6656 | 14044163.79 | 2110.00 |
| 3 | -6712128630152386476 | 5106 | 9985405.38 | 1955.62 |
| 4 | -225245605736690330 | 3204 | 4176676.53 | 1303.58 |
| 5 | -5044213774447814878 | 3056 | 3907298.51 | 1278.57 |
| 6 | -2876120296317350531 | 612039 | 3832695.82 | 6.26 |
| 7 | 3220864789079889211 | 4101 | 3019747.11 | 736.34 |
| 8 | -2647655532108368607 | 4351 | 2903735.30 | 667.37 |
| 9 | -922008049376959953 | 2254 | 2638086.09 | 1170.40 |
| 10 | 852176900607336119 | 2237 | 2620244.08 | 1171.32 |

Interpretation:
- This snapshot is append-only and intended to keep log evidence current for the hardening cycle.
- Prioritize fixes by highest delta_total_ms and call movement from run-to-run comparison.

Self-heal plan:
- Continue monitoring and prioritize top delta_total_ms queryids in next patch batch.

Next action:
- Re-run the cycle after the next production traffic window and validate that comparison status moves toward improved.
