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

## 10) Authoritative Database Truth Audit (Fresh Dump Baseline + Overlay)

Audit date: 2026-06-25  
Authority source used: `local_folder/backups/full_database.sql`  
Mirror used for large-file access fallback: `local_folder/backups/chunks/full_database.sql.part_*`

Baseline marker (manifest truth):
- Manifest file: `supabase/evidence/authoritative_dump_manifest.json`
- Dump path marker: `local_folder/backups/full_database.sql`
- Chunk marker: `local_folder/backups/chunks/full_database.sql.part_*`
- Baseline `created_at_utc`: `2026-06-25T15:02:12Z`
- Baseline `sha256`: `56cc1ef74d7c5482200b1f04d7b6404bf71a2d29c3f5addc7b4788472f7f9e35`
- Baseline size marker: `109744753` bytes (~105 MB)

Overlay truth (post-dump execution state):
- Overlay file: `supabase/evidence/post_dump_verified_promotions.md`
- Active overlay window matches baseline timestamp and sha.
- Current overlay state in this window: no promoted SQL/SQL-check entries listed yet.

Dump header verification from fresh baseline:
- Dump started: `2026-06-25 20:29:17 IST`
- Dumped from DB version: `17.6`
- Dumped by `pg_dump`: `17.7`

Current object-count snapshot (fresh dump):
- `CREATE TABLE public.*`: `91`
- `CREATE VIEW public.*`: `6`
- `CREATE MATERIALIZED VIEW public.*`: `0`
- `CREATE FUNCTION public.*`: `130`
- `CREATE TRIGGER ... ON public.*`: `83`
- Public tables with `ENABLE ROW LEVEL SECURITY`: `77`
- `CREATE POLICY ... ON public.*`: `310`

Performance-critical table presence confirmed:
- `service_reception_entries`
- `technician_assignments`
- `service_vas_jc_data`
- `service_parts_consumption_data`
- `service_parts_stock_snapshot_data`

Index truth (fresh dump, relevant to current IO fix path):
- Present:
	- `idx_service_reception_entries_dealer_created`
	- `idx_service_reception_entries_jc_number`
	- `idx_service_reception_sa_lookup`
	- `idx_technician_assignments_assigned_at`
	- `idx_vas_jc_data_branch_created_at_desc`
	- `idx_parts_consumption_branch_portal_fiscal`
	- `idx_parts_stock_branch_portal_date`
- Not present (candidate indexes identified from 2026-06-25 log + EXPLAIN audit):
	- `idx_sre_created_at_id_desc`
	- `idx_sre_service_type_created_at_id_desc`
	- `idx_ta_updated_assigned_desc`
	- `idx_vas_jc_closed_branch`

Operational interpretation from fresh truth:
- Existing reception indexes are dealer/lookup-oriented; plain ordered-list query path (`ORDER BY created_at DESC, id DESC`) still lacks dedicated sort/seek index.
- RLS/policy baseline is materially broader than earlier snapshots, so policy-hardening and performance tasks must use this refreshed baseline as authority.

Conflict handling applied:
- Per Rules R7-R10, this section supersedes older audit counts and remains authoritative until next dump refresh.
- Post-dump executed-state deltas must be layered only through overlay promotions file and not inferred from memory.

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

Step 1 validation outcome (2026-06-08):
- PASS: `p0_auth_delete` on all 7 warranty tables now requires `is_admin()` or `has_module_delete('reports')`.
- PASS: `p0_auth_select`, `p0_auth_insert`, `p0_auth_update` remained present on all 7 tables.
- PASS: RLS stayed enabled on all 7 tables.

Step 2 draft prepared:
- Migration: `supabase/migrations/20260608120000_p0_step2_service_tighten_delete_policy.sql`
- Checks: `supabase/sql_checks/20260608120000_service_tighten_step2_checks.sql`
- Scope: `service_vas_jc_data`, `service_jc_parts_data`, `service_invoice_data`, `service_invoice_order_data`.
- Action: tighten only `p0_auth_delete`; leave select/insert/update unchanged in this step.

Step 2 validation outcome (2026-06-08):
- PASS: `p0_auth_delete` on all 4 service tables now requires `is_admin()` or `has_module_delete('reports')`.
- PASS: `p0_auth_select`, `p0_auth_insert`, `p0_auth_update` remained present on all 4 tables.
- PASS: RLS stayed enabled on all 4 tables.

Step 3 draft prepared:
- Migration: `supabase/migrations/20260608123000_p0_step3_import_recon_tighten_delete_policy.sql`
- Checks: `supabase/sql_checks/20260608123000_import_recon_tighten_step3_checks.sql`
- Scope: `import_employee_mapping_issues`, `pending_drive_uploads`, `open_job_cards_import_staging`.
- Action: tighten only `p0_auth_delete`; keep `p0_auth_select/insert/update` unchanged in this step.

Step 3 validation outcome (2026-06-08):
- PASS: `p0_auth_delete` now requires:
	- `import_employee_mapping_issues`: `is_admin()` OR `has_module_delete('employees')`
	- `pending_drive_uploads`: `is_admin()` OR `has_module_delete('job_cards')`
	- `open_job_cards_import_staging`: `is_admin()` OR `has_module_delete('job_cards')`
- PASS: `p0_auth_select`, `p0_auth_insert`, `p0_auth_update` remained present on all 3 tables.
- PASS: RLS stayed enabled on all 3 tables.

Step 4 draft prepared:
- Migration: `supabase/migrations/20260608130000_p0_step4_operational_staging_tighten_delete_policy.sql`
- Checks: `supabase/sql_checks/20260608130000_operational_staging_tighten_step4_checks.sql`
- Scope: `cancel_job_card`, `closed_but_not_invoiced`, `open_job_cards`, `job_card_closed_data_duplicates_backup`.
- Action: tighten only `p0_auth_delete`; keep `p0_auth_select/insert/update` unchanged in this step.

Step 4 execution outcome (2026-06-08):
- PASS: `p0_auth_delete` tightened on all 4 Step 4 tables:
	- `cancel_job_card`: `is_admin()` OR `has_module_delete('reception')` OR `has_module_delete('job_cards')`
	- `closed_but_not_invoiced`: `is_admin()` OR `has_module_delete('reports')` OR `has_module_delete('job_cards')`
	- `open_job_cards`: `is_admin()` OR `has_module_delete('reception')` OR `has_module_delete('job_cards')`
	- `job_card_closed_data_duplicates_backup`: `is_admin()` OR `has_module_delete('reports')` OR `has_module_delete('job_cards')`
- PASS: `p0_auth_select`, `p0_auth_insert`, `p0_auth_update` remained present on all 4 tables.
- PASS: Step 4 RLS rows confirmed all `true` for:
	- `cancel_job_card`
	- `closed_but_not_invoiced`
	- `job_card_closed_data_duplicates_backup`
	- `open_job_cards`

Staged tightening closeout (P0-03):
- Completed Step 1 through Step 4 with policy-text evidence, baseline continuity checks, and RLS confirmations.
- Scope of this staged track was `p0_auth_delete` tightening only; select/insert/update hardening remains a future scoped phase.

## 13) P1-05 Query Rewrite Execution Pack (Crash-Recovery Continuation)

Status at continuation point:
- P1-04 indexes are already deployed in production.
- P1-05 is the active bottleneck phase and should now focus on query shape fixes, not new broad schema changes.

Execution objective:
- Reduce high-cost OFFSET and exact-count query families by moving to keyset pagination, narrow projections, and planned/estimated counts.

### 13.1 Rewrite Targets (Top-Impact First)

Batch A (critical, first deploy):
1. `service_reception_entries` list endpoints (web + mobile)
- Replace `.range(from, to)` style OFFSET pagination with cursor pagination on `(created_at, id)`.
- Keep projection narrow in list paths (avoid `select('*')` in list views).

2. `service_vas_jc_data` paginated report endpoints (web + mobile)
- Replace OFFSET pagination with keyset `(created_at, id)` for report listing flows.
- Keep existing business filters intact (branch/date/service type), only pagination shape changes.

3. High-frequency exact-count paths
- Replace `count: 'exact'` for list UX with `count: 'planned'` or `count: 'estimated'`.
- Keep exact count only for explicit user-triggered "export/final summary" style actions.

Batch B (second deploy):
1. `service_parts_consumption_data` fiscal-year list
- Replace fetch-all/list pagination with branch-scoped distinct-year retrieval pattern.
- Prefer RPC or narrow distinct query path that avoids broad row scans.

2. Warranty extraction exact-count loop
- Remove repeated exact-count per status loop and shift to one grouped aggregate path (RPC or SQL function) where feasible.

### 13.2 Concrete Code Hotspots to Edit

Primary hotspots already observed in codebase (web + mobile parity):
- `src/lib/reportQueries.ts` (multiple `.range(...)` patterns over report tables)
- `mobile/src/lib/reportQueries.ts` (matching `.range(...)` patterns)
- `src/lib/warranty/jsonExtraction.ts` (`count: 'exact'` in stage-count extraction)
- `src/pages/reports/warranty/WarrantyOverviewReport.tsx` (range-based list fetches)

Guardrail:
- Preserve response contracts expected by screens; pagination transport may change, but returned row shape and filter semantics must remain backward compatible.

### 13.3 Keyset Pagination Contract (Standard)

Required order:
- `order('created_at', { ascending: false }).order('id', { ascending: false })`

Cursor filters for next page:
- `created_at < cursor_created_at`
- OR same timestamp + `id < cursor_id`

Pseudo-pattern:
```ts
let query = supabase
	.from('target_table')
	.select('id, created_at, ...narrow_columns')
	.order('created_at', { ascending: false })
	.order('id', { ascending: false })
	.limit(PAGE_SIZE)

if (cursor) {
	query = query.or(
		`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
	)
}
```

### 13.4 Validation Checklist (Per Batch)

Functional validation:
1. Web report pages load first page and next page without duplicates/skips.
2. Mobile report pages show same ordering and pagination continuity.
3. Warranty overview KPIs still render with no permission/query errors.

Performance validation:
1. Re-check Query Performance after each batch.
2. Confirm reduced proportional DB time for:
- `service_reception_entries` list family
- `service_vas_jc_data` date-window list family
- exact-count query family (`pgrst_source_count`-style)

SQL spot checks:
```sql
-- Ensure new indexes are used by rewritten list shapes
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, jc_number, reg_number, service_type
FROM service_reception_entries
WHERE branch = 'BRANCH_NAME'
ORDER BY created_at DESC, id DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, job_card_number, sr_type
FROM service_vas_jc_data
WHERE branch = 'BRANCH_NAME'
	AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC, id DESC
LIMIT 100;
```

Expected plan shape:
- index scan using `idx_reception_entries_branch_created_at_desc` and `idx_vas_jc_data_branch_created_at_desc`
- no large OFFSET-driven scan/sort in first page path

### 13.5 Rollback Strategy (P1-05 Only)

If regression is detected:
1. Revert only query-shape changes in app code (keep deployed indexes; indexes are additive and already validated).
2. Restore prior pagination/count behavior for the single failing screen/module.
3. Capture failing filter/cursor payload and re-run with SQL explain before second attempt.

### 13.6 Completion Gates for P1-05

P1-05 can move to `Done` only when all gates pass:
1. Keyset pagination live on top report list paths (web + mobile parity).
2. Default exact-count removed from high-traffic list endpoints.
3. No pagination correctness regressions (no duplicate/missing rows across page boundaries).
4. Query Performance shows measurable drop in top list/query-family proportional time.

### 13.7 Immediate Next Actions (Resume Queue)

1. Implement Batch A in `src/lib/reportQueries.ts` and `mobile/src/lib/reportQueries.ts`.
2. Replace exact-count default in `src/lib/warranty/jsonExtraction.ts` and any list UIs relying on default exact count.
3. Re-measure performance and append new rows in Sections 5 and 6.
4. Update tracker rows P1-05/P1-06/P1-09 based on measured outcomes.

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

### 14.6 Capture Snapshot: 2026-06-25 (Full SQL Check Pack)

Capture status:
- Complete check pack received for `extensions.pg_stat_statements`, `pg_stat_user_tables`, `pg_statio_user_tables`, low-usage indexes, and four EXPLAIN plans.

Top findings from this capture:
1. Dominant total-time query family:
- `queryid=6416750758406621842` (`service_reception_entries` exact-count/list CTE path)
- `calls=38386`, `total_ms=82854948.73`, `mean_ms=2158.47`

2. Additional high total-time families:
- `service_reception_entries` wide list path: `queryid=-5344960703026327435`, `calls=6585`, `total_ms=13889043.53`
- `technician_assignments` list path: `queryid=-6712128630152386476`, `calls=5091`, `total_ms=9968420.04`

3. IO-heavy export/query families (top read pressure):
- `COPY service_parts_stock_snapshot_data`: `queryid=-5633448213020496946`, `shared_blks_read=12499`, `total_ms=1017022.47`
- `COPY service_invoice_order_data`: `queryid=8277935260341689633`, `shared_blks_read=9715`, `total_ms=684328.33`

4. Seq-scan pressure highlights:
- `service_vas_jc_data`: `seq_scan_pct=94.20`
- `technician_assignments`: `seq_scan_pct=53.26`
- `service_reception_entries`: `seq_scan_pct=19.06` (still material due to very high call volume)

5. Plan checks (all three hot list paths still sort over seq scan):
- Reception list: Seq Scan + Sort on `ORDER BY created_at DESC, id DESC`
- Technician list: Seq Scan + Sort on `ORDER BY updated_at DESC, assigned_at DESC`
- VAS date-window list: Seq Scan + Sort on `ORDER BY jc_closed_date_time DESC`
- Reception date-window count remains fast via index-only scan (isolated query), but expensive as a high-frequency default list behavior.

Fix status against A/B/C/D buckets:
- A (remove default exact-count): In Progress (highest priority, not complete)
- B (keyset + narrow projections): In Progress
- C (index additions for active sort/filter paths): Done (migration `20260625221000` executed and verified)
- D (COPY/export scheduling and throttling): Not Started

### 14.7 Capture Snapshot: 2026-06-25 (Post-Index Verification)

Verification results received:
1. Migration execution:
- `supabase/migrations/20260625221000_p1_07_disk_io_hotlist_indexes.sql` ran successfully.

2. Index existence check:
- Present and verified:
	- `idx_sre_created_at_id_desc`
	- `idx_sre_service_type_created_at_id_desc`
	- `idx_ta_updated_assigned_desc`
	- `idx_vas_jc_closed_branch`

3. Plan-shape improvements (core objective of P1-07):
- Reception ordered list: `Index Scan using idx_sre_created_at_id_desc`
- Technician ordered list: `Index Scan using idx_ta_updated_assigned_desc`
- VAS date-window list: `Index Scan using idx_vas_jc_closed_branch`

4. Remaining dominant load after index rollout:
- Reception exact-count/list family still dominates total time:
	- `queryid=6416750758406621842`, `calls=38386`, `total_ms=82854948.73`, `mean_ms=2158.47`
- High-frequency Realtime remains significant:
	- `queryid=-2876120296317350531`, `calls=612039`, `total_ms=3832695.82`
- COPY workloads remain top read-heavy IO consumers.

Interpretation:
- Index objective is achieved (plans no longer seq-scan sorting on the validated paths).
- Next measurable gains now depend on code/query-shape work (remove default exact-count, reduce OFFSET fan-out, narrow projections), then capture a fresh time window to observe queryid total-time deltas.

### 14.8 Capture Snapshot: 2026-06-25 (Post-Code Recapture, Unchanged)

What was received:
- Re-capture output for tracked query IDs, top total-time list, and target table scan summary after code-side Tier A pass.

Observed result:
- Dominant query remained unchanged in cumulative stats:
	- `queryid=6416750758406621842`, `calls=38386`, `total_ms=82854948.73`, `mean_ms=2158.47`
- Other top IDs also remained materially unchanged in reported totals/calls.

Interpretation:
- This capture appears to reflect the same cumulative `pg_stat_statements` window (or insufficient post-deploy traffic), so it does not yet prove/deny code impact.
- Plan-shape improvements from index rollout remain valid (Index Scan confirmed), but workload-level effect must be measured by interval deltas.

Measurement protocol for next capture:
1. Take snapshot A for tracked query IDs (calls/total_ms/mean_ms).
2. Let production traffic run for 30-60 minutes after confirmed deploy.
3. Take snapshot B for same query IDs.
4. Compare deltas (`B - A`) instead of absolute cumulative totals.

Current bucket status:
- A (remove default exact-count): In Progress
- B (keyset + narrow projections): In Progress
- C (index additions): Done
- D (COPY/export throttling): Not Started

### 14.9 Capture Snapshot: 2026-06-25 (Post-Deploy Reception Family, Mixed/Unresolved)

What was received:
- User supplied refreshed reception-family hotlist and classifier flags (`has_count_cte`, `has_offset`, `has_select_star`) for top reception query IDs.

Observed result:
- Legacy dominant IDs remained cumulative-flat:
	- `6416750758406621842` (`calls=38386`, `total_ms=82854948.73`, `has_count_cte=true`, `has_offset=true`)
	- `-5344960703026327435` (`calls=6585`, `total_ms=13889043.53`, `has_offset=true`)
- Additional reception query IDs now appear in top set:
	- `-225245605736690330` (`calls=3177`, `total_ms=4150753.83`, `has_offset=true`)
	- `-922008049376959953` (`calls=2248`, `total_ms=2637205.96`, `has_offset=true`)
	- `852176900607336119` (`calls=2199`, `total_ms=2581855.21`, `has_offset=true`)
	- `2744925251257801673` (`calls=885`, `total_ms=1875153.82`, `has_count_cte=true`, `has_offset=true`, `has_select_star=true`)

Interpretation:
- Capture still reflects cumulative statement state, so no direct before/after attribution is possible yet.
- Reception hotspot has broadened across multiple OFFSET list signatures; next optimization decisions must be based on interval deltas, not cumulative totals.

Required next measurement (strict):
1. Snapshot A: tracked + newly surfaced reception IDs (calls/total_ms/mean_ms).
2. Wait 10 minutes under real production traffic.
3. Snapshot B: same ID set.
4. Compute `delta_calls` and `delta_total_ms` for each ID and rank descending by `delta_total_ms`.
