# SUPABASE-001: Production Hardening Master Plan + Activity Tracker

Last updated: 2026-06-04
Scope: Security, performance, reliability, operations hygiene, and tracking discipline for the Supabase project `techwheels-services` (Free plan).

## 1) Current Snapshot (Baseline)

- Plan: Free (Nano compute), region ap-south-1 (Mumbai)
- Runtime: RAM 55%, CPU 2%, disk 28%, connections 9/60
- Traffic (last 60 min): 194 DB requests, 10 Auth requests
- Advisory state: 22 issues, mostly Security/Critical
- Migration visibility: last migration shown as `parts_phase1_alignment`
- Operational flags: no backups configured, no repo connected in dashboard

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
6. Re-check RAM trend after index rollout.

Exit criteria:
- No recurring slow query with obvious missing-index pattern.
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
| P2-01 | High | Add free-plan inactivity prevention ping | Team | Not Started |  |  |  | 2026-06-04 | Define endpoint + schedule + monitoring |
| P2-02 | Medium | Connect GitHub repo in Supabase dashboard | Team | Not Started |  |  |  | 2026-06-04 | Validate migration linkage after connection |
| P2-03 | Critical | Reconcile deployed schema with migration history | Team | Not Started |  |  |  | 2026-06-04 | Compare production state and repo migrations |
| P2-04 | High | Define backup/restore runbook and drill date | Team | Not Started |  |  |  | 2026-06-04 | Add restore checklist and owner |
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
