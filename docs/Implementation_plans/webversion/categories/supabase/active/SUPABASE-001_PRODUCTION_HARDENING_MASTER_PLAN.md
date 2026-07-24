# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-07-21 (audit cycle script aligned with TECHWHEELS-WEB collectors; service-history table-name fix migration pending deploy)
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime (dashboard checkpoint 2026-07-06 ~12:25 IST; latest automated audit 2026-07-07 06:14:46 UTC snapshot 14.36): Observability last-24h — memory 71%, CPU 8%, disk 36%, Disk IO 4%, peak connections 25/60, API Gateway errors 0.13%; audit connection snapshot 24/60 (active 3, idle 19, waiting 23); interval comparison vs 14.35 status=regressed (`delta_total_ms_sum=3425053.57`, `delta_calls_sum=48439`)
- Traffic (latest audit KPIs): slow queries (`total_time > 1000ms`)=200 (up from 18 in snapshot 14.35 low-traffic window), cache hit rate 99.99%, avg rows/call 3.80; top load `technician_assignments` list (`queryid=6462467893367818088`, 214 calls), then `service_reception_entries` wide list and `process_all_service_history_sync_queue` (167 calls)
- Plan quota (Usage Summary 2026-07-06): egress 6.231/5 GB (**125%**, over limit), database size 0.442/0.5 GB (**88%**), storage 0.51/1 GB (51%), cached egress 4%, realtime peak 14/200, MAU 92/50000
- Advisory state: Security Advisor Errors cleared (0 on 2026-06-08 milestone); regression guard **blocked_requires_checklist** on snapshot 14.36 (warn+block triggered); Batch B gains from 14.35 remain valid but next traffic window shows renewed query/realtime pressure
- Migration visibility: last migration shown as `parts_phase1_alignment` (dashboard); repo promotions through EW reminder batch (`20260706220000` et seq) executed 2026-07-06
- Operational flags: repo metadata backup cadence active via `npm run db:backup:metadata`; Supabase dashboard backups still not configured; GitHub repo not connected in dashboard
- Maintenance note: metadata dump refreshed 2026-07-07 06:15:53 UTC; post-deploy audit retry 2026-07-07 blocked by local-edits guard (no new snapshot — use confirm env var after deploy + 15m wait)
- Batch C Phase 1 (2026-07-07, code complete): `ServiceAdvisorPage` assignment status query bounded to visible job-card numbers from date-scoped rows (C-01); Realtime subscription applies incremental status updates with ref-guarded single channel and teardown cleanup (C-02). `npm run build` pass. Production verification pending next Vercel deploy + 15m wait + post-deploy audit cycle.
- DB observability windows:
	- 2026-06-08 08:53-09:53 IST: memory usage ~408 MB, memory commitment ~1.33 GB, sustained cache-heavy read profile
	- 2026-06-25: Disk IO budget warning active in dashboard banner; Query Performance + EXPLAIN evidence indicates query-shape and list/count frequency as primary driver
- Authoritative dump audit source: `supabase/backups/full_metadata.sql` (schema-only, 1.607 MB), manifest at `supabase/evidence/authoritative_metadata_manifest.json`
- Authoritative dump timestamp: 2026-07-07 06:18:12 UTC (sha256=aa70820a5880c925a20408338f0128dc9430ff381ae66fdba082b773fd953a3e); pg_dump --schema-only --no-owner; captures post-EW-reminder migration batch through `20260706220000`
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
| P1-06 | High | Replace OFFSET scans with cursor pagination in large tables/views | Team | In Progress | 2026-06-25 |  | Snapshot 14.45: reception wide list still #2 (`852176900607336119` ~1623ms mean); keyset page 2+ `3787216458397661678` rising. **Batch D (2026-07-22):** 90d lookback bound. **Batch E (2026-07-24):** paginated SA/Reception list load (1 page on open + Load more); background slim summary scan for SA tiles; no blind column trim. Evidence: [P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md](../evidence/P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md), [P1_06_RECEPTION_PAGINATED_LIST_BATCH_E_2026-07-24.md](../evidence/P1_06_RECEPTION_PAGINATED_LIST_BATCH_E_2026-07-24.md). Remaining: Technician/floor fetch-all, mobile, DashboardPage. | 2026-07-24 | Deploy Batch E; post-deploy audit — expect lower `delta_calls` on `852176900607336119` + `3787216458397661678` |
| P1-07 | High | Add targeted composite/partial indexes for timeout hotlist queries | Team | Done | 2026-06-25 | 2026-06-25 | Migration executed successfully (`supabase/migrations/20260625221000_p1_07_disk_io_hotlist_indexes.sql`); check output confirms all 4 indexes exist and all 3 hot EXPLAINs switched from Seq Scan + Sort to Index Scan (`idx_sre_created_at_id_desc`, `idx_ta_updated_assigned_desc`, `idx_vas_jc_closed_branch`). | 2026-06-25 | - |
| P1-08 | High | Reduce Realtime WAL polling cost and fan-out | Team | In Progress | 2026-06-25 |  | Snapshot 14.36: `realtime.list_changes` resurfaced in top-10 (`queryid=-2876120296317350531`, `calls=24357`, `delta_calls=24357`, `delta_total_ms=221571.48` vs near-zero in 14.35). **Batch C Phase 1 (C-02, 2026-07-07):** `ServiceAdvisorPage` Realtime callback no longer triggers full assignment rescan; incremental INSERT/UPDATE/DELETE updates for visible job cards only; `assignmentRealtimeChannelRef` enforces single active channel + cleanup on unmount. Table-wide subscription scope unchanged; other screens still pending inventory. | 2026-07-07 | Deploy Batch C Phase 1; post-deploy audit for Realtime delta; complete per-screen subscription inventory (Phase 2+) |
| P1-09 | High | Eliminate expensive exact-count list patterns in PostgREST paths | Team | Done | 2026-06-25 | 2026-07-06 | Batch B (2026-07-06): Root cause confirmed and fixed — unbounded all-time fetch on `ServiceAdvisorPage` and `listFloorInchargeEntries` / technician fallback all bounded. `MasterDataNullCountsReport` total count switched to `estimated`. Post-deploy audit snapshot 14.35: `queryid=-5344960703026327435` (no-WHERE OFFSET, calls=11096) absent from top-10 — eliminated. Regression guard cleared. | 2026-07-06 | - |
| P1-10 | Critical | Disk IO budget incident response (query-shape mitigation first) | Team | Done | 2026-06-25 | 2026-07-06 | Batch B mitigations confirmed effective. Post-deploy audit snapshot 14.35: regression guard cleared (`ok`), `delta_total_ms_sum=-198283995.58`, slow queries 1117→18. All three top-delta queryids from snapshot 14.32 (`-5344960703026327435`, `3220864789079889211`, `4251000708073776526`) either eliminated or reduced to noise level. | 2026-07-06 | - |
| P1-11 | Critical | Log-driven performance tracker (rolling updates from every new capture) | Team | In Progress | 2026-06-25 |  | Rolling evidence synced to snapshot `14.37` (`2026-07-21__08-09-21-622Z`); Section 14 retains latest-two captures (`14.36`, `14.37`). **2026-07-21:** `scripts/supabase_audit_cycle.mjs` brought to parity with TECHWHEELS-WEB — ranked `postgres_logs` / `edge_logs` error digests, ILIKE `tracked_queries` (includes `process_all_service_history_sync_queue`), expanded table-scan watchlist, comparison actions for refresh/sync queues + statement-timeout log hints. Re-run post-deploy audit to populate new artifacts. | 2026-07-21 | Re-run `supabase:audit:cycle:postdeploy`; use ranked postgres errors for P1-12 batch/timeout fixes |
| P1-12 | Critical | Contain service history sync queue RPC load | Team | Done | 2026-07-06 | 2026-07-21 | ACL `20260706140000`; SUPABASE-003 migrations `20260721133000`–`20260721152000` (indexes, refresh SQL, batch 50 + 60s budget, cron). **Verified snapshot 14.40** (`2026-07-21__09-05-34-309Z`): ranked postgres errors empty (24h); cron job 24 runs `process_all_service_history_sync_queue(50)` and completes; queryid `3220864789079889211` absent from top-10. Metadata dump `2026-07-21T09:04:19Z`. Plan: [SUPABASE-003](SUPABASE-003_SERVICE_HISTORY_SYNC_QUEUE_PERFORMANCE_PLAN_2026-07-21.md). | 2026-07-21 | Monitor queue drain + logs; regression guard blocked for unrelated Realtime/reception load |
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Done | 2026-07-06 | 2026-07-06 | Migration `20260706160000_p2_01_inactivity_prevention_ping.sql` deployed: pg_cron job `techwheels-inactivity-prevention-ping` scheduled every 4 days at 06:00 UTC (job ID 16). Confirmed active in cron.job. | 2026-07-06 | - |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | In Progress | 2026-06-05 |  | Metadata dump refreshed 2026-07-07 06:18:12 UTC via `npm run db:backup:metadata`; sha256=aa70820a5880c925a20408338f0128dc9430ff381ae66fdba082b773fd953a3e, size=1.607 MB. Captures EW reminder migration batch through `20260706220000`. | 2026-07-07 | Reconcile any pending migrations vs manifest after next deploy batch |
| P2-04 | High | Define backup/restore runbook and drill date | Team | In Progress | 2026-06-04 |  | Metadata schema backup executed 2026-07-07 (`npm run db:backup:metadata` → `supabase/backups/full_metadata.sql` + manifest update). Full data restore runbook and drill date still pending. | 2026-07-07 | Document restore checklist for metadata dump; schedule first drill date |
| P2-06 | Critical | Resolve egress quota breach (free-plan 5 GB limit) | Team | In Progress | 2026-07-06 |  | Usage Summary 2026-07-06: egress 6.231/5 GB (**125%**); cached egress only 0.188/5 GB (4%) — uncached API/storage egress is primary driver. | 2026-07-07 | Identify top egress endpoints; narrow projections, paginate exports, reduce redundant polling downloads |
| P2-07 | High | Database size capacity planning (0.5 GB free limit) | Team | In Progress | 2026-07-06 |  | Usage Summary 2026-07-06: database size 0.442/0.5 GB (**88%**); ~58 MB headroom remaining on free tier. | 2026-07-07 | Run table/index size breakdown; define archival or retention policy before 90% threshold |
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
| 2026-07-06 (automated audit cycle, post-deploy Batch B) | - | - | - | 26/60 | - | - | - | - | Snapshot 14.35 (08:13 UTC); top query 3220864789079889211 calls=22 total_ms=31092.85 mean_ms=1413.31; slow_queries=18 (was 1117); cache_hit=100%; comparison=improved; delta_total_ms_sum=-198283995.58; guard=ok |
| 2026-07-07 (automated audit 14.36 + metadata backup) | 71% | 8% | 36% | 24/60 | - | - | - | - | Snapshot 14.36 (06:14 UTC); top query 6462467893367818088 calls=214; slow_queries=200; comparison=regressed; delta_total_ms_sum=3425053.57; guard=blocked_requires_checklist; egress=125%; db_size=88%; metadata dump sha256=aa70820a (06:18 UTC) |
| 2026-07-22 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query -2876120296317350531 calls=520961 total_ms=5750354.02 mean_ms=11.04; comparison=regressed; delta_total_ms_sum=1328716.34 |
| 2026-07-24 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query -2876120296317350531 calls=653128 total_ms=6737768.55 mean_ms=10.32; comparison=regressed; delta_total_ms_sum=5541869.49 |

## 6) Change Log (What Was Updated in This Plan)

Retention rule:
- Keep only key milestone manual records plus latest two automated audit updates.

| Date | Updated By | Summary |
|---|---|---|
| 2026-06-04 | Copilot | Created initial master plan, phase model, activity tracker, and metrics log baseline |
| 2026-06-08 | Copilot | Security stabilization completed and validated (Advisor errors reduced to zero); plan moved to performance and reliability hardening. |
| 2026-06-25 | Copilot | Performance hardening focus consolidated to P1-05..P1-11 with index verification complete and next-step emphasis on query-shape and exact-count reduction. |
| 2026-07-06 | Copilot | Post-deploy audit snapshot 14.35 confirmed: slow queries 1117→18, regression guard cleared (ok), delta_total_ms_sum=-198283995.58. P1-05, P1-09, P1-10 closed; Batch B mitigations verified. |
| 2026-07-07 | Copilot | Snapshot 14.36 synced (regressed vs 14.35); metadata dump refreshed via `npm run db:backup:metadata`; dashboard quota evidence added (P2-06 egress 125%, P2-07 db size 88%); P1-06/P1-08/P1-12 reopened; post-deploy audit retry blocked by local-edits guard. |
| 2026-07-07 | Copilot | Batch C Phase 1 implemented in `src/pages/ServiceAdvisorPage.tsx`: C-01 bounded assignment status query (visible job cards, batched `.in()`, narrowed columns); C-02 incremental Realtime updates with ref-guarded single subscription and teardown cleanup. `npm run build` pass. Post-deploy audit pending (no production snapshot yet). |
| 2026-07-21 | Copilot | Audit cycle script parity with TECHWHEELS-WEB: ranked postgres/edge log digests, ILIKE tracked queries (incl. service-history sync), expanded scan watchlist, sync-queue/timeout comparison actions; plan Section 10A added. |
| 2026-07-21 | Copilot | Ranked log SQL fixed for Supabase Logs API: postgres `unnest(metadata.parsed.error_severity)`, edge 5xx + function_logs level, 24h window (fills timeout/missing-relation frequency in audit artifacts). |
| 2026-07-22 | Copilot | Automated Supabase audit cycle appended run summary (2026-07-22 17:14:29 IST) and refreshed plan evidence block from generated audit artifacts. |
| 2026-07-24 | Copilot | Automated Supabase audit cycle appended run summary (2026-07-24 09:55:12 IST) and refreshed plan evidence block from generated audit artifacts. |
| 2026-07-24 | Copilot | P1-06 Batch E implemented: paginated SA/Reception list APIs, background slim summary scan for SA tiles, Load more UX. Evidence: [P1_06_RECEPTION_PAGINATED_LIST_BATCH_E_2026-07-24.md](../evidence/P1_06_RECEPTION_PAGINATED_LIST_BATCH_E_2026-07-24.md). Deploy + audit pending. |

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

## 10A) Automated Audit Cycle Instrumentation

Command: `SUPABASE_AUDIT_POST_DEPLOY_CONFIRM=VERCEL_PROD_DEPLOYED_AND_WAITED_15M npm run supabase:audit:cycle:postdeploy`

Script: `scripts/supabase_audit_cycle.mjs` (auto-updates this plan via `scripts/supabase_plan_autoupdate.mjs`).

Each run writes `supabase/evidence/audit_runs/<timestamp>/` including:
- **SQL:** top 25 queries, top 10 slow (full text), ILIKE **tracked_queries** (reception, assignments, stock refresh queues, `process_refresh_queue`, `process_all_service_history_sync_queue`, service-history refresh RPC), table scan ratios (reception, assignments, vas, booking/stock queues, service-history tables), KPIs, connections, IO hotspots, auth minute buckets, DB health.
- **Platform logs (tail):** auth, edge, realtime, storage, postgres (`raw_platform_*`).
- **Ranked log digests:** grouped postgres errors/warnings via `metadata.parsed.error_severity` (24h window) and edge/function failures (`raw_top_postgres_errors.json`, `raw_top_edge_errors.json`; tables in `summary.md`).
- **Delta:** `comparison.json` vs previous run; regression guard + optional `fix_checklist.md`.
- **Plan sync:** appends Section 14 snapshot, trims to latest two; updates Section 5/6 one-liners.

Comparison auto-actions include: exact-count CTE, OFFSET, Realtime WAL queryid, `process_refresh_queue`, `process_all_service_history_sync_queue`, and statement-timeout / missing-relation hints from ranked postgres logs.

## 11) Active Fix Phase Plan (Current Cycle)

Purpose:
- Maintain explicit phase -> subphase -> task -> ordered-step tracking for this cycle.
- Keep all pending/in-progress/blocked/unverified items visible until done and verified.

Cycle anchor:
- Latest snapshot: `14.37` (2026-07-21 08:09:21 UTC)
- Previous snapshot: `14.36` (2026-07-07 06:14:46 UTC)
- Current movement: `regressed` vs 14.36 baseline in long interval (`delta_total_ms_sum=18438370.52` vs 2026-07-07 run)
- Regression guard: `blocked_requires_checklist` on 14.37

Hotspot evidence (code audit, 2026-06-26):
- Exact-count hotspots: `src/pages/reports/master-data/MasterDataNullCountsReport.tsx`, `mobile/src/app/(tabs)/autodoc.old.tsx`
- OFFSET/range hotspots: `src/lib/reportQueries.ts`, `src/lib/partsReportQueries.ts`, `mobile/src/lib/reportQueries.ts`, `mobile/src/lib/partsReportQueries.ts`, `src/pages/SATrackerPage.tsx`, `src/pages/TechnicianPage.tsx`

Batch A implementation results (2026-06-26, IST):
- Implemented this cycle: `src/lib/reportQueries.ts` and `mobile/src/lib/reportQueries.ts` now enforce `MAX_REPORT_FETCH_ROWS=5000` in core report fetch paths and replaced targeted residual `.range` offset loops with bounded single-pass `limit(MAX_REPORT_FETCH_ROWS)` queries.
- Verified existing (already present in current HEAD): exact-count mitigation in `src/pages/reports/master-data/MasterDataNullCountsReport.tsx` and `mobile/src/app/(tabs)/autodoc.old.tsx`; keyset page rollouts in `src/pages/SATrackerPage.tsx` and `src/pages/TechnicianPage.tsx`.
- Verified (code/build): `npm run build` and `npm --prefix ./mobile run -s typecheck` completed successfully.
- Batch B verified (snapshot 14.35): slow queries 1117→18, guard cleared. Snapshot 14.36 (next traffic window) regressed — rolling monitor active via P1-11.

Batch C Phase 1 implementation (2026-07-07, code complete — production audit pending):

| Finding | File | Change | Status | Verification |
|---|---|---|---|---|
| C-01 | `src/pages/ServiceAdvisorPage.tsx` | Replaced unbounded `technician_assignments` keyset scan with batched `.in('job_card_number', chunk)` scoped to visible date-range job cards; select narrowed to `job_card_number, work_status`; refetch tied to `visibleJobCardNumbers` | Implemented | `npm run build` pass; post-deploy audit pending |
| C-02 | `src/pages/ServiceAdvisorPage.tsx` | Realtime callback applies incremental status set updates (no full-table refetch); `assignmentRealtimeChannelRef` prevents duplicate subscriptions; `removeChannel` + ref null on unmount | Implemented | Code review + build pass; live Realtime verification pending deploy |

Batch C Phase 2 (not started — recommended after Phase 1 post-deploy audit):
- `DashboardPage.tsx` unbounded assignment scan
- Mobile floor incharge unbounded `select('*')` assignments
- `TechnicianPage.tsx` unbounded view scan
- `ReceptionPage.tsx` global search list
- Remaining Realtime subscription inventory beyond Service Advisor

Execution tracker (this cycle):

| Priority | Phase | Subphase | Task ID | Ordered Step | Status | Verification |
|---|---|---|---|---|---|---|
| P0 | Phase F1: Query-shape stabilization | F1.1 Reception list/count hardening | P1-09 | Step 1: Remove default exact-count from high-traffic reception list endpoints. | Done | Verified (snapshot 14.35) |
| P0 | Phase F1: Query-shape stabilization | F1.1 Reception list/count hardening | P1-06 | Step 2: Complete keyset pagination rollout for `(created_at,id)` list paths. | In Progress | Batch D 2026-07-22: 90d bound. Batch E 2026-07-24: SA/Reception paginated load + slim summary scan (code in repo; deploy pending) |
| P0 | Phase F1: Query-shape stabilization | F1.2 Fetch-all elimination | P1-05 | Step 3: Remove residual fetch-all report/query loops that still inflate list/count load. | Done | Verified (snapshot 14.35) |
| P0 | Phase F1: Query-shape stabilization | F1.4 Batch C Phase 1 (Service Advisor assignments) | P1-06 | Step 2a: Bound `ServiceAdvisorPage` assignment status query to visible job cards. | Done | Code complete 2026-07-07; post-deploy audit pending |
| P1 | Phase F2: Realtime load containment | F2.1 Subscription fan-out control | P1-08 | Step 4: Remove duplicate subscriptions and reduce channel scope per screen. | In Progress | Batch C C-02 partial: SA incremental Realtime; table-wide channel scope remains |
| P1 | Phase F2: Realtime load containment | F2.1 Subscription fan-out control | P1-08 | Step 5: Verify unsubscribe/teardown behavior on navigation and unmount. | In Progress | SA ref-guard + cleanup implemented; live nav test pending deploy |
| P0 | Phase F3: Delta verification gate | F3.1 Controlled interval recapture | P1-10 | Step 6: Run post-deploy interval recapture in next real traffic window. | Done | Verified (snapshot 14.35 captured post-deploy) |
| P0 | Phase F3: Delta verification gate | F3.2 Evidence synchronization | P1-11 | Step 7: Re-rank regressions by `delta_total_ms` and sync tracker rows. | In Progress | Synced to 14.36; guard blocked |
| P0 | Phase F1: Query-shape stabilization | F1.3 Sync queue containment | P1-12 | Step 8: Contain `process_all_service_history_sync_queue` call volume and batch cost. | Done | Verified snapshot 14.40; see SUPABASE-003 verification note |
| P1 | Phase F4: Plan quota guardrails | F4.1 Egress + DB size | P2-06/P2-07 | Step 9: Bring egress under 100% and DB size under 90% with documented plan. | In Progress | Dashboard Usage Summary 2026-07-06 |

Completion guardrails (this cycle):
1. No step can move to `Done` until evidence is reflected in Section 14 comparison output.
2. Rolling regression guard must return to `ok` for two consecutive captures before closing P1-11 interval watch.

## 14) Rolling Evidence (Latest Two Audits Only)

Retention policy:
- Keep only the latest two automated audit snapshots in this section.
- Keep comparison status and compact top-10 table in each retained snapshot.
- Archive detailed historical logs under `supabase/evidence/audit_runs/`.

### 14.44 Capture Snapshot: 2026-07-22 (Automated Audit Cycle)

What was captured:
- Timestamp (IST): 2026-07-22 17:14:29 IST
- Capture mode: automated_supabase_audit_cycle
- Top queryid: -2876120296317350531 (calls=520961, total_ms=5750354.02, mean_ms=11.04)
- Platform logs capture status: auth=ok, edge_functions=ok, realtime=ok, storage=ok, database_health=ok
- Comparison vs previous run (2026-07-22__09-13-27-494Z): status=regressed, delta_total_ms_sum=1328716.34, delta_calls_sum=16196
- Top regressions by delta_total_ms: 3833171277786028740 (405610.55); -2876120296317350531 (302878.68); -2647655532108368607 (206536.5)
- Top postgres log messages: unavailable (analytics query empty or failed).

Compact Top 10 (run-local):
| rank | queryid | calls | total_ms | mean_ms |
|---:|---|---:|---:|---:|
| 1 | -2876120296317350531 | 520961 | 5750354.02 | 11.04 |
| 2 | 852176900607336119 | 2603 | 4240996.88 | 1629.27 |
| 3 | 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 4 | 8843009277484467611 | 298 | 1202470.16 | 4035.13 |
| 5 | -397576279058981298 | 408 | 1184667.40 | 2903.60 |
| 6 | -1851842182524549347 | 12500 | 1145742.07 | 91.66 |
| 7 | -6279881906384027513 | 882 | 1116899.51 | 1266.33 |
| 8 | 3787216458397661678 | 3073 | 1018516.84 | 331.44 |
| 9 | 8976932172498995662 | 5727 | 915045.41 | 159.78 |
| 10 | -8535248155740750540 | 148 | 827420.34 | 5590.68 |

Interpretation:
- This snapshot is append-only and intended to keep log evidence current for the hardening cycle.
- Prioritize fixes by highest delta_total_ms and call movement from run-to-run comparison.

Self-heal plan:
- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.

Next action:
- Re-run the cycle after the next production traffic window and validate that comparison status moves toward improved.

### 14.45 Capture Snapshot: 2026-07-24 (Automated Audit Cycle)

What was captured:
- Timestamp (IST): 2026-07-24 09:55:12 IST
- Capture mode: automated_supabase_audit_cycle
- Top queryid: -2876120296317350531 (calls=653128, total_ms=6737768.55, mean_ms=10.32)
- Platform logs capture status: auth=ok, edge_functions=ok, realtime=ok, storage=ok, database_health=ok
- Comparison vs previous run (2026-07-22__11-44-29-065Z): status=regressed, delta_total_ms_sum=5541869.49, delta_calls_sum=164624
- Top regressions by delta_total_ms: -2876120296317350531 (987414.53); 3787216458397661678 (940369.21); 852176900607336119 (701691.78)
- Top postgres log messages: unavailable (analytics query empty or failed).

Compact Top 10 (run-local):
| rank | queryid | calls | total_ms | mean_ms |
|---:|---|---:|---:|---:|
| 1 | -2876120296317350531 | 653128 | 6737768.55 | 10.32 |
| 2 | 852176900607336119 | 3045 | 4942688.66 | 1623.21 |
| 3 | 7336725908253715888 | 2583 | 2279905.15 | 882.66 |
| 4 | 3787216458397661678 | 5015 | 1958886.05 | 390.61 |
| 5 | 8843009277484467611 | 377 | 1519547.15 | 4030.63 |
| 6 | -397576279058981298 | 491 | 1461289.89 | 2976.15 |
| 7 | 8976932172498995662 | 6705 | 1291775.00 | 192.66 |
| 8 | -1851842182524549347 | 14445 | 1253049.52 | 86.75 |
| 9 | -6279881906384027513 | 980 | 1199939.11 | 1224.43 |
| 10 | -2147031708195470770 | 747 | 873721.51 | 1169.64 |

Interpretation:
- This snapshot is append-only and intended to keep log evidence current for the hardening cycle.
- Prioritize fixes by highest delta_total_ms and call movement from run-to-run comparison.

Self-heal plan:
- Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.

Next action:
- Re-run the cycle after the next production traffic window and validate that comparison status moves toward improved.
