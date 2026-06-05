# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-06-05
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime: RAM 55%, CPU 2%, disk 28%, connections 9/60
- Traffic (last 60 min): 194 DB requests, 10 Auth requests
- Advisory state: 22 issues, mostly Security/Critical
- Migration visibility: last migration shown as `parts_phase1_alignment`
- Operational flags: no backups configured, no repo connected in dashboard
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
| P0-01 | Critical | Export and classify all 22 Advisor issues | Team | Not Started |  |  |  | 2026-06-04 | Build issue inventory by table/setting |
| P0-02 | Critical | Enable RLS on exposed public tables | Team | Not Started |  |  |  | 2026-06-04 | Start with highest-risk tables from Advisor |
| P0-03 | Critical | Define least-privilege policies for `anon` and `authenticated` | Team | Not Started |  |  |  | 2026-06-04 | Map policies to each API path |
| P0-04 | High | Restrict `anon` API key permissions in settings | Team | Not Started |  |  |  | 2026-06-04 | Validate no frontend breakage after restriction |
| P0-05 | High | Enable leaked-password protection in Auth | Team | Not Started |  |  |  | 2026-06-04 | Toggle and test signup/login failure path |
| P1-01 | Critical | Move app DB connection usage to pooler URL | Team | Not Started |  |  |  | 2026-06-04 | Identify all runtime connection string consumers |
| P1-02 | High | Accept and triage Index Advisor suggestions | Team | Not Started |  |  |  | 2026-06-04 | Mark suggestions as apply/defer/reject with reason |
| P1-03 | High | Analyze top 3-5 slow queries in dashboard | Team | Not Started |  |  |  | 2026-06-04 | Capture SQL IDs, mean time, total time |
| P1-04 | High | Add and verify indexes for sequential scans | Team | Not Started |  |  |  | 2026-06-04 | Implement migration files for approved indexes |
| P1-05 | Critical | Remove fetch-all patterns from reports and warranty JSON extractors | Team | Not Started |  |  |  | 2026-06-05 | Convert to RPC/aggregate SQL and strict page limits |
| P1-06 | High | Replace OFFSET scans with cursor pagination in large tables/views | Team | Not Started |  |  |  | 2026-06-05 | Use id/date cursors and verify no timeout regressions |
| P1-07 | High | Add targeted composite/partial indexes for timeout hotlist queries | Team | Not Started |  |  |  | 2026-06-05 | Ship migration files and attach EXPLAIN evidence |
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

## 6) Change Log (What Was Updated in This Plan)

| Date | Updated By | Summary |
|---|---|---|
| 2026-06-04 | Copilot | Created initial master plan, phase model, activity tracker, and metrics log baseline |
| 2026-06-04 | Copilot | Added authoritative dump governance rules (authority source, chunk mirror, no-invention, and conflict preference) |
| 2026-06-05 | Copilot | Added statement-timeout mitigation actions, tracker rows P1-05 to P1-07, and hot-query remediation matrix |
| 2026-06-05 | Copilot | Audited active authoritative dump and recorded schema/index/RLS/view truth plus drift findings in Section 10 |

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

## 9) Statement Timeout Hotlist (2026-06-05)

Observed issue: recurrent `canceling statement due to statement timeout` on user pages despite low CPU.

Interpretation:
- Most heavy queries are PostgREST-generated `WITH pgrst_source ... LIMIT/OFFSET` patterns over large base tables/views.
- High cache hit rate indicates CPU is not the primary bottleneck; scan width, row volume, and repeated page-level refetch are driving latency.
- Timeouts are amplified by client-side fetch-all loops and repeated exact counts.

Top offenders and actions:

1. Query family: `service_parts_consumption_data` fiscal year lookup (`calls: 2189`, `mean: ~820ms`, `max: ~7.9s`, `~29.4% total time`).
	Action:
	- Replace raw fiscal-year scans with `SELECT DISTINCT fiscal_year` via RPC/view scoped by branch.
	- Add index strategy: `(branch, fiscal_year)` and/or partial index where `fiscal_year IS NOT NULL`.
	- Cache fiscal-year options per branch (short TTL).

2. Query family: `vw_parts_stock_health` branch filters (`calls: 5808+3887`, `mean: 58-85ms`, `max: up to ~2.7s`, `~10.9% total time combined`).
	Action:
	- Avoid `select('*')`; project only required columns.
	- Push `weeks_of_supply` and branch filtering into indexed base-table predicates used by the view.
	- Add default `limit` for dashboard widgets and lazy-load detail pages.

3. Query family: `service_parts_stock_snapshot_data` ordered by `snapshot_date DESC` (`mean: ~1.9s`).
	Action:
	- Add composite index aligned to access path, e.g. `(branch, snapshot_date DESC, part_number)`.
	- Replace offset loops with cursor pagination on `(snapshot_date, part_number)`.

4. Query family: `service_reception_entries` full row listing plus count CTE (`mean: ~270ms`, `max: ~1.5s`).
	Action:
	- Avoid full-row `select('*')` in list screens.
	- Use a minimal projection for list pages and fetch full record only on detail click.
	- Ensure index for default sort path `(created_at DESC)` and key filters.

5. Query family: `service_vas_jc_data` and `job_card_closed_data` date-window scans (`max > 6s`).
	Action:
	- Enforce mandatory date window on report pages.
	- Add/verify composite indexes for common predicates: `(branch, jc_closed_date_time)`, `(branch, closed_date_time)`, plus service-type columns where used.
	- Move aggregations from client-side loops to SQL/RPC grouping.

6. Query family: warranty JSON tables (`warranty_wc_data`, `warranty_claim_settlement_report_data`, `warranty_updation_claim_data`, `warranty_fsb_data`).
	Action:
	- Replace repeated `count exact` and bulk JSON pulls with pre-aggregated SQL views/RPC returning KPI-level data.
	- Add expression/GIN indexes for frequently filtered JSON keys where needed (for example claim status or job code).

Out-of-band noise to ignore in app remediation:
- `COPY ... TO stdout` entries are operational export jobs, not user page reads.
- Dashboard metadata introspection queries from `postgres` role are administrative noise unless they coincide with incidents.

Immediate rollout order (safe and high impact):
1. Remove fetch-all patterns from the highest-traffic pages.
2. Add missing composite/partial indexes for top 3 query families.
3. Shift expensive dashboard calculations to RPC/materialized summaries.
4. Re-measure Query Performance after each batch and append evidence in Section 5.

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
