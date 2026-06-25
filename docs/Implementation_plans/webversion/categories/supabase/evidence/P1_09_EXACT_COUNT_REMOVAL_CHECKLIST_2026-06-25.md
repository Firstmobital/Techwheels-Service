# P1-09 Exact-Count Removal Checklist (Disk IO Incident)

Date: 2026-06-25
Owner: Team
Scope: Remove default exact-count behavior from high-traffic list endpoints, starting with reception flows.

## 1) Why This Is Priority 1

Incident-linked query IDs from 2026-06-25 capture:
- 6416750758406621842: reception exact-count/list CTE path, calls=38386, total_ms=82854948.73, mean_ms=2158.47
- -5344960703026327435: reception wide list path, calls=6585, total_ms=13889043.53
- -6712128630152386476: technician list path, calls=5091, total_ms=9968420.04

Interpretation:
- Exact count on hot list paths is the dominant total-time driver.
- Count query can be fast in isolation, but default high-frequency invocation is expensive system-wide.

## 2) Code-Side Search Commands

Run in repo root to find remaining exact-count and OFFSET patterns:

```bash
rg -n "count:\s*'exact'|count:\s*\"exact\"" src mobile
rg -n "\.range\(" src mobile
```

## 3) Mandatory Replacements

For high-traffic list screens:
- Replace `count: 'exact'` with one of:
  - `count: 'planned'`
  - `count: 'estimated'`
  - no count for default list fetch
- Keep exact count only for explicit user actions:
  - exports
  - final summary dialogs
  - admin-only audit actions

For paging logic:
- Stop OFFSET-heavy loops on hot list paths.
- Use keyset pagination with stable order (`created_at`, `id`) where supported.

## 4) Priority Hotspots To Patch First

Tier A (patch first):
- src/pages/ReceptionPage.tsx
- src/pages/ServiceAdvisorPage.tsx
- src/lib/api/reception.ts
- src/lib/reportQueries.ts
- mobile/src/lib/reportQueries.ts

Tier B (patch next):
- src/lib/warranty/jsonExtraction.ts
- src/pages/reports/warranty/WarrantyOverviewReport.tsx
- src/pages/reports/master-data/MasterDataNullCountsReport.tsx
- any remaining list screens that combine `.range(...)` with heavy table scans

## 5) Acceptance Criteria (Code)

- No default `count: 'exact'` remains in reception/service-advisor list paths.
- Reception list endpoints use narrow list projection (avoid `select('*')` for list pages).
- No user-facing pagination regression (no missing/duplicate rows across page boundaries).

## 6) Acceptance Criteria (Database)

After code deployment and index rollout, run:
- `supabase/sql_checks/20260625221000_p1_07_disk_io_hotlist_indexes_checks.sql`

Expected:
- Query IDs above show reduced `total_ms` trend in subsequent windows.
- List-path EXPLAIN output no longer defaults to Seq Scan + Sort for hot list cases.
- `seq_scan_pct` improves for:
  - service_reception_entries
  - technician_assignments
  - service_vas_jc_data

## 7) Tracker Sync Requirement

After each patch batch:
- Update Section 14.6 in SUPABASE-001 plan with before/after numbers.
- Update tracker rows P1-05, P1-06, P1-09, P1-10, P1-11.
- Append one metrics row and one change-log row in the plan.
