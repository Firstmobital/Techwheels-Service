# P1-06 Batch E: Paginated reception lists + summary scan (2026-07-24)

**Target queryids:** `852176900607336119` (date-range page 1), `3787216458397661678` (keyset page 2+)
**Plan:** SUPABASE-001 P1-06 Step 2 (Batch E)
**Prior batch:** [P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md](./P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md) (Batch D — 90-day bounding)

## Problem

Batch D capped the date window but still **fetch-all looped** every page (200 rows × ~37 columns) on each Service Advisor / Reception load. Audit snapshot **14.45** showed:

| queryid | mean_ms | Notes |
|---------|--------:|-------|
| `852176900607336119` | ~1623 | First page, full column projection |
| `3787216458397661678` | ~391 | Same projection, keyset pages 2+ |

Column trimming alone was rejected — Service Advisor list UI requires estimate/invoice/remark fields for tiles, filters, and row actions.

## Approach (Batch E)

1. **UI pagination** — load **one page** (200 rows, full columns) on open; **Load more** for additional pages. Eliminates automatic multi-page loop on every visit.
2. **Background summary scan** — slim column projection (`RECEPTION_SUMMARY_FIELD_COLUMNS`, 18 fields, no file blobs) paginated in background for Service Advisor summary tiles and filter metadata. Assignment statuses fetched in batches for all JCs in the date range.
3. **Server-side search (SA)** — when search box is non-empty, list API applies PostgREST `ilike` filters instead of client-only filtering on loaded rows.
4. **Reception page** — same single-page + Load more pattern (global search pool unchanged, on-demand).

## Code changes

| Area | Change |
|------|--------|
| `src/lib/api/reception.ts` | `fetchReceptionEntriesPage`, `listReceptionEntriesByDateRangePage`, `listServiceAdvisorEntriesByDateRangePage`, `fetchReceptionSummaryFieldsByDateRange`, `fetchTechnicianAssignmentStatusesForJobCards`; legacy fetch-all retained for floor/technician/global-search callers |
| `src/pages/ServiceAdvisorPage.tsx` | Page-1 load, Load more, background summary + assignment sets for tiles; table still uses full columns for loaded rows |
| `src/pages/ReceptionPage.tsx` | Page-1 load, Load more; removed client-side 100-row cap |

## Audit verification (post-deploy)

Compare snapshot after deploy vs **14.45**:

| Signal | Expected if Batch E works |
|--------|---------------------------|
| `852176900607336119` `delta_calls` | **Lower** per user session (1 page vs N pages on load) |
| `3787216458397661678` `delta_calls` | **Lower** growth rate (only on explicit Load more) |
| `852176900607336119` `mean_ms` | May stay ~1.6s per page (full row still needed for SA table) |
| `3787216458397661678` total_ms rank | Should drop relative to page-1 query |

**Functional checks:**

1. Service Advisor opens with first 200 rows; summary tiles populate after background scan (may show `…` briefly).
2. Load more appends rows; assignment badges update for newly loaded JCs.
3. Summary tile counts match date range (not limited to loaded table page).
4. Reception list shows first page; Load more works; global search still searches 90-day pool.

## Status

| Item | Status |
|------|--------|
| API pagination + summary scan | Done (repo) |
| ServiceAdvisorPage wiring | Done (repo) |
| ReceptionPage wiring | Done (repo) |
| Deploy + post-deploy audit | **Pending** |
| Technician / floor fetch-all callers | Pending (separate P1-06 items) |

## Deferred (not Batch E)

- Blind column trim on list/detail shared select
- DB RPC for summary counts (optional future optimization if slim scan cost remains high)
- Reception service-type tile counts from full-range summary (currently from loaded pages)
