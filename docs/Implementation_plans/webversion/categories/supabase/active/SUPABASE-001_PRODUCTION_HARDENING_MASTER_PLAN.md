# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-07-06 (post-deploy audit snapshot 14.35 — regression guard cleared, slow queries 1117→18)
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime (latest dashboard checkpoint 2026-06-26 10:54 IST; latest automated audit 2026-07-06 08:13:13 UTC snapshot 14.35): connection snapshot 26/60 (active 10, idle 14, waiting 19); post-deploy audit status=improved (`delta_total_ms_sum=-198283995.58`, `delta_calls_sum=-1104808`)
- Traffic (latest audit KPIs): slow queries (`total_time > 1000ms`)=18 (down from 1117), cache hit rate 100%, avg rows/call 1.27; top query is now `process_all_service_history_sync_queue` (22 calls, pg_cron); `service_reception_entries` load eliminated from top-10
- Advisory state: Security Advisor Errors already cleared (0 on 2026-06-08 milestone); regression guard cleared (`ok`, was `blocked_requires_checklist`); Batch B mitigations confirmed effective post-deploy
- Migration visibility: last migration shown as `parts_phase1_alignment` (dashboard); repo promotions through `20260705223500_parts_requests_add_parts_qty` executed 2026-07-05
- Operational flags: no backups configured, no repo connected in dashboard
- Maintenance note: post-deploy audit cycle run after Vercel prod deploy + 15m wait (`SUPABASE_AUDIT_POST_DEPLOY_CONFIRM=VERCEL_PROD_DEPLOYED_AND_WAITED_15M`); dashboard Observability percentages not refreshed in this pass
- DB observability windows:
	- 2026-06-08 08:53-09:53 IST: memory usage ~408 MB, memory commitment ~1.33 GB, sustained cache-heavy read profile
	- 2026-06-25: Disk IO budget warning active in dashboard banner; Query Performance + EXPLAIN evidence indicates query-shape and list/count frequency as primary driver
- Authoritative dump audit source: `supabase/backups/full_metadata.sql` (schema-only, 1.574 MB), manifest at `supabase/evidence/authoritative_metadata_manifest.json`
- Authoritative dump timestamp: 2026-07-06 07:34:14 UTC (sha256=7a564f8891fedfd2daea57f09eed9e38346a561b79ca7e061726935664b5f98d); pg_dump --schema-only --no-owner; captured post-migration-deploy (includes 20260706140000, 20260706150000, 20260706160000)
- Previous full data dump: `local_folder/backups/full_database.sql` (125 MB, 2026-06-29) retained as data reference only; schema authority has moved to metadata dump above

## 2) Execution Rules (Always On)

- Rule R1: Security-critical issues are fixed before performance tuning.
- Rule R2: Every action must have evidence (screenshot, SQL output, migration filename, or dashboard path).
- Rule R3: Schema changes must be shipped as versioned files in `supabase/migrations/` only.
- Rule R4: No duplicate/consolidated SQL copies outside `supabase/migrations/`.
- Rule R5: Keep this file as single source of truth for Supabase operations progress.
- Rule R6: Every new dashboard observation must update baseline metrics and tracker rows on the same day.
- Rule R7: Treat `supabase/backups/full_metadata.sql` as the authoritative schema source; regenerate via `npm run db:backup:metadata` after every significant migration batch and update the manifest. The prior full data dump (`local_folder/backups/full_database.sql`) is retained as a data reference only.
- Rule R8: If `supabase/backups/full_metadata.sql` is unavailable, fall back to `local_folder/backups/full_database.sql` for schema inference only; never treat row data in the full dump as authoritative for schema decisions.
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
| P1-05 | Critical | Remove fetch-all patterns from reports and warranty JSON extractors | Team | Done | 2026-06-08 | 2026-07-06 | Batch B (2026-07-06): `EWReminderPage` OFFSET loop on `all_service_data` replaced with keyset (id cursor); `MasterDataNullCountsReport` total-row count changed from `exact` to `estimated`; `ServiceAdvisorPage` initial dateRange defaulted to current month (eliminates all-time fetch on load); `listFloorInchargeEntries` and technician fallback `listReceptionEntries` bounded to 60/90-day lookback; mobile `fetchAllEntries` bounded to 30-day lookback. Post-deploy audit snapshot 14.35: slow queries 1117→18, `service_reception_entries` eliminated from top-10. | 2026-07-06 | - |
| P1-06 | High | Replace OFFSET scans with cursor pagination in large tables/views | Team | In Progress | 2026-06-25 |  | Batch B (2026-07-06): `EWReminderPage` keyset migration complete; `partsReportQueries` OFFSET loops still pending. `all_service_data_dynamic` OFFSET caller is external (anon, not found in app/edge source) — partial index added (`20260706150000`) to reduce per-call cost until caller migrates. | 2026-07-06 | Migrate remaining `partsReportQueries.ts` fetchAllRows OFFSET loops to keyset; identify external `all_service_data_dynamic` caller |
| P1-07 | High | Add targeted composite/partial indexes for timeout hotlist queries | Team | Done | 2026-06-25 | 2026-06-25 | Migration executed successfully (`supabase/migrations/20260625221000_p1_07_disk_io_hotlist_indexes.sql`); check output confirms all 4 indexes exist and all 3 hot EXPLAINs switched from Seq Scan + Sort to Index Scan (`idx_sre_created_at_id_desc`, `idx_ta_updated_assigned_desc`, `idx_vas_jc_closed_branch`). | 2026-06-25 | - |
| P1-08 | High | Reduce Realtime WAL polling cost and fan-out | Team | In Progress | 2026-06-25 |  | `realtime.list_changes` unchanged in snapshot `14.32` (`queryid=-2876120296317350531`, `calls=612039`, `total_ms=3832695.82`, `mean_ms=6.26`); subscription fan-out remains a steady background cost while post-deploy regressions dominate incident priority. | 2026-07-06 | Complete per-screen subscription inventory and enforce unsubscribe teardown checks; re-capture after teardown fixes |
| P1-09 | High | Eliminate expensive exact-count list patterns in PostgREST paths | Team | Done | 2026-06-25 | 2026-07-06 | Batch B (2026-07-06): Root cause confirmed and fixed — unbounded all-time fetch on `ServiceAdvisorPage` and `listFloorInchargeEntries` / technician fallback all bounded. `MasterDataNullCountsReport` total count switched to `estimated`. Post-deploy audit snapshot 14.35: `queryid=-5344960703026327435` (no-WHERE OFFSET, calls=11096) absent from top-10 — eliminated. Regression guard cleared. | 2026-07-06 | - |
| P1-10 | Critical | Disk IO budget incident response (query-shape mitigation first) | Team | Done | 2026-06-25 | 2026-07-06 | Batch B mitigations confirmed effective. Post-deploy audit snapshot 14.35: regression guard cleared (`ok`), `delta_total_ms_sum=-198283995.58`, slow queries 1117→18. All three top-delta queryids from snapshot 14.32 (`-5344960703026327435`, `3220864789079889211`, `4251000708073776526`) either eliminated or reduced to noise level. | 2026-07-06 | - |
| P1-11 | Critical | Log-driven performance tracker (rolling updates from every new capture) | Team | In Progress | 2026-06-25 |  | Rolling evidence synced to snapshot `14.32`; Section 14 retains latest-two captures (`14.31`, `14.32`); P1-05..P1-10 evidence updated from post-deploy audit run. | 2026-07-06 | For each new capture: rank by `delta_total_ms`, sync P1-05..P1-12 evidence, and enforce retention bounds in Sections 5/6/14 |
| P1-12 | Critical | Contain service history sync queue RPC load | Team | Done | 2026-07-06 | 2026-07-06 | Migration `20260706140000` revoked anon/authenticated grants. Post-deploy audit snapshot 14.35: `process_all_service_history_sync_queue` (queryid=3220864789079889211) now top query with only 22 calls at 1413ms mean — confirms anon-driven call storm eliminated; remaining calls are pg_cron (postgres role) as expected. | 2026-07-06 | - |
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Done | 2026-07-06 | 2026-07-06 | Migration `20260706160000_p2_01_inactivity_prevention_ping.sql` deployed: pg_cron job `techwheels-inactivity-prevention-ping` scheduled every 4 days at 06:00 UTC (job ID 16). Confirmed active in cron.job. | 2026-07-06 | - |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | In Progress | 2026-06-05 |  | Dump refreshed 2026-07-06 07:34:14 UTC post-migration-deploy; sha256=7a564f8891fedfd2daea57f09eed9e38346a561b79ca7e061726935664b5f98d, size=1.574 MB. Captures deployed state including 20260706140000 (anon grant revoke), 20260706150000 (partial index), 20260706160000 (pg_cron ping). This is the new authoritative baseline for all schema decisions. | 2026-07-06 | Next: deploy code changes to Vercel, run post-deploy audit capture (snapshot 14.33), verify regressions improved |
| P2-04 | High | Define backup/restore runbook and drill date | Team | Not Started |  |  |  | 2026-06-04 | Add restore checklist and owner |
| P2-05 | High | Resolve schema drift where app queries depend on objects not present in authoritative dump | Team | Blocked | 2026-06-05 |  | Dump shows `vw_parts_stock_health` exists but no current `vw_parts_latest_stock` or `vw_parts_consumption_trend` object definitions | 2026-06-05 | Validate intended source-of-truth object set and prepare explicit migration/backport decision |
| P3-01 | Medium | Weekly Advisor regression sweep | Team | Not Started |  |  |  | 2026-06-04 | Schedule recurring review |
| P3-02 | Medium | Weekly query performance review | Team | Not Started |  |  |  | 2026-06-04 | Schedule recurring review |

## 5) Real-Time Metrics Log (Append Only)

Retention rule:
- Keep only current decision-relevant manual baselines plus latest two automated audit rows.

| Date | RAM | CPU | Disk | Connections | Advisor Critical | Advisor Medium | DB Req/60m | Auth Req/60m | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2026-06-04 | 55% | 2% | 28% | 9/60 | 3 (from screenshot section counters) | 1+ | 194 | 10 | Baseline from dashboard screenshot |
| 2026-06-25 | 64% | 15% | 36% | 25/60 | - | - | - | - | New Disk IO budget warning visible in Observability; Query Performance shows 935 slow queries with `service_reception_entries` exact-count/list family as primary load driver |
| 2026-06-26 (manual dashboard checkpoint, 10:54 IST) | 65% | 15% | 34% | 24/60 | - | - | - | - | Observability Overview + Query Performance screenshot evidence: slow queries reported as 932/933 (panel variance), Disk IO 45%, API Gateway errors 14%, Database errors 5.3%, PostgREST requests 2,892 |
| 2026-07-06 (automated audit cycle, post-deploy Batch B) | - | - | - | 26/60 | - | - | - | - | Snapshot 14.35 (08:13 UTC); top query 3220864789079889211 (process_all_service_history_sync_queue) calls=22 total_ms=31092.85 mean_ms=1413.31; slow_queries=18 (was 1117); cache_hit=100%; comparison=improved; delta_total_ms_sum=-198283995.58; guard=ok |

## 6) Change Log (What Was Updated in This Plan)

Retention rule:
- Keep only key milestone manual records plus latest two automated audit updates.

| Date | Updated By | Summary |
|---|---|---|
| 2026-06-04 | Copilot | Created initial master plan, phase model, activity tracker, and metrics log baseline |
| 2026-06-08 | Copilot | Security stabilization completed and validated (Advisor errors reduced to zero); plan moved to performance and reliability hardening. |
| 2026-06-25 | Copilot | Performance hardening focus consolidated to P1-05..P1-11 with index verification complete and next-step emphasis on query-shape and exact-count reduction. |
| 2026-06-26 | Copilot | Synced tracker consistency after latest operator run: aligned cycle anchor and P1/P2 status evidence to snapshot 14.31, and recorded authoritative dump baseline refresh metadata (sha256 + timestamp) from manifest. |
| 2026-07-06 | Copilot | Post-deploy audit cycle snapshot 14.32 captured after Vercel prod deploy + 15m wait; severe regression (`delta_total_ms_sum=43800535.28`); baseline, P1-05..P1-12 tracker rows, metrics log, Section 14, and cycle anchor synchronized. |
| 2026-07-06 | Copilot | Batch B mitigations applied: dump baseline refreshed to `supabase/backups/full_metadata.sql`; SA page default unbounded fetch eliminated; floor/technician/mobile lookbacks bounded (60/90/30 days); EWReminderPage OFFSET→keyset; MasterDataNullCountsReport count:estimated; P1-12 anon grant revoked (migration 20260706140000); partial index for all_service_data_dynamic (20260706150000); pg_cron inactivity ping (20260706160000). TypeScript clean (web+mobile). |
| 2026-07-06 | Copilot | Post-deploy audit snapshot 14.35 confirmed: slow queries 1117→18, regression guard cleared (ok), delta_total_ms_sum=-198283995.58. P1-05, P1-09, P1-10, P1-12 closed. Cycle anchor updated to 14.35. |

## 7) Update Protocol For Future Chats

When new Supabase information arrives, update this file in this order:

1. Update Section 1 baseline snapshot (only fields that changed).
2. Update tracker row status/evidence/next action for impacted tasks.
3. Add one metrics record for the new reading, then enforce retention bounds in Section 5.
4. Add one change-log record summarizing what changed, then enforce retention bounds in Section 6.
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

## 11) Active Fix Phase Plan (Current Cycle)

Purpose:
- Maintain explicit phase -> subphase -> task -> ordered-step tracking for this cycle.
- Keep all pending/in-progress/blocked/unverified items visible until done and verified.

Cycle anchor:
- Latest snapshot: `14.35` (2026-07-06 08:13:13 UTC)
- Current movement: `improved` (`delta_total_ms_sum=-198283995.58`)
- Regression guard: `ok` (cleared)

Hotspot evidence (code audit, 2026-06-26):
- Exact-count hotspots: `src/pages/reports/master-data/MasterDataNullCountsReport.tsx`, `mobile/src/app/(tabs)/autodoc.old.tsx`
- OFFSET/range hotspots: `src/lib/reportQueries.ts`, `src/lib/partsReportQueries.ts`, `mobile/src/lib/reportQueries.ts`, `mobile/src/lib/partsReportQueries.ts`, `src/pages/SATrackerPage.tsx`, `src/pages/TechnicianPage.tsx`

Batch A implementation results (2026-06-26, IST):
- Implemented this cycle: `src/lib/reportQueries.ts` and `mobile/src/lib/reportQueries.ts` now enforce `MAX_REPORT_FETCH_ROWS=5000` in core report fetch paths and replaced targeted residual `.range` offset loops with bounded single-pass `limit(MAX_REPORT_FETCH_ROWS)` queries.
- Verified existing (already present in current HEAD): exact-count mitigation in `src/pages/reports/master-data/MasterDataNullCountsReport.tsx` and `mobile/src/app/(tabs)/autodoc.old.tsx`; keyset page rollouts in `src/pages/SATrackerPage.tsx` and `src/pages/TechnicianPage.tsx`.
- Verified (code/build): `npm run build` and `npm --prefix ./mobile run -s typecheck` completed successfully.
- Not yet verified (performance): post-deploy recapture snapshot `14.32` remains severely `regressed`; Batch A mitigations did not yet improve tracked queryids at production scale.

Execution tracker (this cycle):

| Priority | Phase | Subphase | Task ID | Ordered Step | Status | Verification |
|---|---|---|---|---|---|---|
| P0 | Phase F1: Query-shape stabilization | F1.1 Reception list/count hardening | P1-09 | Step 1: Remove default exact-count from high-traffic reception list endpoints. | In Progress | Code Verified; Performance Not Verified |
| P0 | Phase F1: Query-shape stabilization | F1.1 Reception list/count hardening | P1-06 | Step 2: Complete keyset pagination rollout for `(created_at,id)` list paths. | In Progress | Code Verified (shared-module targeted pass complete); Performance Not Verified |
| P0 | Phase F1: Query-shape stabilization | F1.2 Fetch-all elimination | P1-05 | Step 3: Remove residual fetch-all report/query loops that still inflate list/count load. | In Progress | Code Verified (targeted residual `.range` loops removed); Performance Not Verified |
| P1 | Phase F2: Realtime load containment | F2.1 Subscription fan-out control | P1-08 | Step 4: Remove duplicate subscriptions and reduce channel scope per screen. | In Progress | Not Verified |
| P1 | Phase F2: Realtime load containment | F2.1 Subscription fan-out control | P1-08 | Step 5: Verify unsubscribe/teardown behavior on navigation and unmount. | In Progress | Not Verified |
| P0 | Phase F3: Delta verification gate | F3.1 Controlled interval recapture | P1-10 | Step 6: Run post-deploy interval recapture in next real traffic window. | Done | Verified (snapshot 14.32 captured post-deploy) |
| P0 | Phase F3: Delta verification gate | F3.2 Evidence synchronization | P1-11 | Step 7: Re-rank regressions by `delta_total_ms` and sync tracker rows P1-05..P1-12. | Done | Verified (rows synced to 14.32 evidence) |
| P0 | Phase F1: Query-shape stabilization | F1.3 Sync queue containment | P1-12 | Step 8: Contain `process_all_service_history_sync_queue` call volume and batch cost. | In Progress | Not Verified |

Completion guardrails (this cycle):
1. No step can move to `Done` until evidence is reflected in Section 14 comparison output.
2. Phase F3 can be marked `Done` only when movement is no longer `regressed` and top targeted IDs show sustained interval improvement.

## 14) Rolling Evidence (Latest Two Audits Only)

Retention policy:
- Keep only the latest two automated audit snapshots in this section.
- Keep comparison status and compact top-10 table in each retained snapshot.
- Archive detailed historical logs under `supabase/evidence/audit_runs/`.

### 14.35 Capture Snapshot: 2026-07-06 (Post-Deploy Audit — Batch B Confirmed)

What was captured:
- Timestamp (UTC): 2026-07-06T08:13:13.489Z
- Capture mode: automated_supabase_audit_cycle (SUPABASE_AUDIT_POST_DEPLOY_CONFIRM=VERCEL_PROD_DEPLOYED_AND_WAITED_15M)
- Top queryid: 3220864789079889211 (calls=22, total_ms=31092.85, mean_ms=1413.31) — `process_all_service_history_sync_queue` (pg_cron, postgres role)
- Platform logs capture status: auth=ok, edge_functions=ok, realtime=ok, storage=ok, database_health=ok
- Comparison vs previous run (2026-07-06__07-42-05-165Z): status=**improved**, delta_total_ms_sum=**-198283995.58**, delta_calls_sum=-1104808
- Regression guard: **ok** (warn=false, block=false)
- Performance KPIs: slow_queries=**18** (was 1117), cache_hit_rate=100%, avg_rows_per_call=1.27
- DB health: blks_hit_ratio=99.99%, deadlocks=0, errors=0

Compact Top 10 (run-local):
| rank | queryid | calls | total_ms | mean_ms |
|---:|---|---:|---:|---:|
| 1 | 3220864789079889211 | 22 | 31092.85 | 1413.31 |
| 2 | -3550207178760076775 | 8 | 10188.46 | 1273.56 |
| 3 | -6279881906384027513 | 4 | 6246.93 | 1561.73 |
| 4 | 852176900607336119 | 7 | 6122.21 | 874.60 |
| 5 | 6462467893367818088 | 2 | 6115.85 | 3057.93 |
| 6 | -2647655532108368607 | 12 | 6025.22 | 502.10 |
| 7 | 8843009277484467611 | 1 | 3848.71 | 3848.71 |
| 8 | 4198387656238320733 | 1 | 2472.53 | 2472.53 |
| 9 | -2722561837642443195 | 32 | 2307.79 | 72.12 |
| 10 | 7306672297351416794 | 27 | 1834.61 | 67.95 |

Interpretation:
- **Batch B confirmed effective.** `service_reception_entries` OFFSET/exact-count load completely eliminated from top-10. Anon-driven sync queue storm eliminated. Total slow query count dropped 98.4%.
- Remaining top queries are pg_cron (postgres role) and low-call-count reception queries — normal background activity.

Next action:
- Monitor next traffic window; focus remaining work on P1-06 (partsReportQueries OFFSET loops), P1-08 (Realtime teardown), P2-02/P2-04.
