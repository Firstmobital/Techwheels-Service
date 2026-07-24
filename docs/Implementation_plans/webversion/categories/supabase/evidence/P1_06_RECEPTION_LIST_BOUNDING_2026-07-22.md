# P1-06 Batch D: Reception list bounding (2026-07-22)

**Target queryid:** `852176900607336119` (wide `service_reception_entries` PostgREST list)  
**Plan:** SUPABASE-001 P1-06 Step 2  
**DB truth:** `supabase/backups/full_metadata.sql` — `idx_sre_created_at_id_desc`, `idx_reception_entries_branch_created_at_desc`

## Problem

Unbounded keyset loops loaded the full `service_reception_entries` table with ~40 columns per row when:

- Service Advisor period = **All** (`dateRange` empty)
- `listReceptionEntries()` / `listServiceAdvisorEntries()` with no `created_at` filter
- Reception global search prefetch

## Changes (app)

| Area | Change |
|------|--------|
| `src/lib/api/reception.ts` | Default lookback **90 days** for `listReceptionEntries`, `listServiceAdvisorEntries`; `listReceptionEntriesForGlobalSearch`; page size **200**; export `getDefaultReceptionLookbackDateRange()` |
| `ServiceAdvisorPage.tsx` | Period **All** uses `getDefaultReceptionLookbackDateRange()` + date-scoped API only |
| `ReceptionPage.tsx` | Global search uses `listReceptionEntriesForGlobalSearch()` |
| `ServiceBookingPage.tsx` | Reception reg lookup limited to last **90 days** |

## Verification (post-deploy)

1. Run audit cycle; compare `852176900607336119` mean_ms and delta_total_ms vs snapshot 14.42.
2. Exercise SA page with period **All** — loads without timeout; shows last 90 days of data.
3. Reception search — results limited to lookback window.

## Status

- Code: complete in repo (pending deploy + audit)
- Post-deploy audit baseline: snapshot **14.45** (2026-07-24)
