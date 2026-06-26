# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-06-26
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
| P1-11 | Critical | Log-driven performance tracker (rolling updates from every new capture) | Team | In Progress | 2026-06-25 |  | Rolling evidence model is active in Section 14 with latest-two automated snapshots, compact top-10 table, and run-to-run comparison status. | 2026-06-26 | For each new capture: confirm comparison movement, sync affected tracker lines (P1-05..P1-10), and keep retention bounds enforced |
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Not Started |  |  |  | 2026-06-04 | Define endpoint + schedule + monitoring |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | In Progress | 2026-06-05 |  | Fresh authoritative dump refreshed and audited on 2026-06-25 using manifest baseline (`sha256=56cc1ef74d7c5482200b1f04d7b6404bf71a2d29c3f5addc7b4788472f7f9e35`, `created_at_utc=2026-06-25T15:02:12Z`) plus overlay file `supabase/evidence/post_dump_verified_promotions.md`. | 2026-06-25 | Use Section 10 + Section 14 truth to generate migration/check files for performance index fixes, then validate via post-change EXPLAIN |
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
| 2026-06-26 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83; comparison=regressed; delta_total_ms_sum=37711.57 |
| 2026-06-26 (automated audit cycle) | - | - | - | - | - | - | - | - | Top query 6416750758406621842 calls=38414 total_ms=82890843.76 mean_ms=2157.83; comparison=regressed; delta_total_ms_sum=16722.77 |

## 6) Change Log (What Was Updated in This Plan)

Retention rule:
- Keep only key milestone manual records plus latest two automated audit updates.

| Date | Updated By | Summary |
|---|---|---|
| 2026-06-04 | Copilot | Created initial master plan, phase model, activity tracker, and metrics log baseline |
| 2026-06-08 | Copilot | Security stabilization completed and validated (Advisor errors reduced to zero); plan moved to performance and reliability hardening. |
| 2026-06-25 | Copilot | Performance hardening focus consolidated to P1-05..P1-11 with index verification complete and next-step emphasis on query-shape and exact-count reduction. |
| 2026-06-26 | Copilot | Active plan compacted to bounded-evidence format: retained decision-relevant milestones and latest two automated audit updates only. |
| 2026-06-26 | Copilot | Automated Supabase audit cycle appended run summary (2026-06-26T04:30:23.188Z) and refreshed plan evidence block from generated audit artifacts. |
| 2026-06-26 | Copilot | Automated Supabase audit cycle appended run summary (2026-06-26T04:33:21.433Z) and refreshed plan evidence block from generated audit artifacts. |

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

## 14) Rolling Evidence (Latest Two Audits Only)

Retention policy:
- Keep only the latest two automated audit snapshots in this section.
- Keep comparison status and compact top-10 table in each retained snapshot.
- Archive detailed historical logs under `supabase/evidence/audit_runs/`.

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
