# P1-06 Batch F: SA summary RPC + fetch-all elimination (2026-07-28)

**Plan:** SUPABASE-001 P1-06 Step 2 (Batch F)  
**Triggered by:** Snapshot **14.46** post-Batch E deploy (2026-07-28)  
**Prior:** [Batch E](./P1_06_RECEPTION_PAGINATED_LIST_BATCH_E_2026-07-24.md) (paginated list — partial win)

## Why Batch F

Batch E stopped auto fetch-all on page load (page-2/page-1 call ratio **~3.8 → ~2.0**), but:

| Problem | Evidence (14.46) |
|---------|------------------|
| Reception still top DB cost | `852176900607336119` #2 (4408 calls, 1721ms mean); `3787216458397661678` #3 (7681 calls, 604ms mean) |
| Summary scan adds heavy load | `3827816949739656130` — slim SA summary projection — **166 calls, ~728k ms, ~4384ms mean** |
| Other fetch-all paths remain | `-3550207178760076775` rising; global search still 90d fetch-all; floor/technician/mobile |

**DB truth:** `supabase/backups/full_metadata.sql` (2026-07-28 04:58:52 UTC)

## Batch F scope

### F1 — Replace background slim summary scan (highest ROI)

**Remove:** `fetchReceptionSummaryFieldsByDateRange()` full-range keyset loop from SA page load.

**Replace with one of:**
- **Preferred:** Postgres RPC `get_service_advisor_summary_counts(p_from timestamptz, p_to timestamptz)` returning JSON counts (job_card_pending, estimate_pending, invoice_pending, no_technician, hold, in_process, completed, total) + optional branch/advisor filters; uses indexed `service_reception_entries` + batched join to `technician_assignments`.
- **Fallback (no migration):** Parallel PostgREST head-count queries with `.select('id', { count: 'exact', head: true })` + filters for reception-only tiles; separate batched assignment query for JC-dependent tiles only.

**Success metric:** `3827816949739656130` absent or near-zero in post-deploy audit; SA tiles still accurate for full date range.

### F2 — Bound remaining fetch-all callers

| Caller | Current behavior | Target |
|--------|------------------|--------|
| `listReceptionEntriesForGlobalSearch()` | 90d fetch-all loop | Server search + pagination, or debounced single query with ilike |
| `listFloorInchargeEntries()` | fetch-all in lookback | Page 1 + Load more (match SA) |
| `listReceptionEntriesWithDefaultLookback()` (Technician) | fetch-all 90d | JC-scoped or paginated |
| Mobile floor / Reception | Same patterns | Align with web Batch E |

### F3 — Quick schema fix (parallel, P2-05)

- `src/pages/PartsSPMDashboardPage.tsx`: `on_hand_qty` → `on_hand_quantity` (14.46 postgres error).

## Audit verification (post Batch F)

Compare vs snapshot **14.46**:

| queryid | Expected |
|---------|----------|
| `3827816949739656130` | Eliminated or minimal |
| `852176900607336119` | Stable or lower delta_calls per session |
| `3787216458397661678` | Lower delta_calls (fewer Load-more + no summary pages) |
| `-3550207178760076775` | Flat or eliminated |

## Status

| Item | Status |
|------|--------|
| Batch F design | Done (this doc) |
| Summary RPC migration | **Ready — user applies SQL** (`20260728103000_p1_06_batch_f_service_advisor_summary_rpc.sql`) |
| SA page wiring (remove slim scan) | Done — `fetchServiceAdvisorSummaryCounts` + 4 parallel RPC calls for filter metadata |
| Global search pagination | Done — `searchReceptionEntriesForGlobalSearchPage` + Load more on Reception |
| Audit cycle ClickHouse logs | Done — `/analytics/endpoints/logs` with 24h window |
| `on_hand_qty` fix | Done — `PartsSPMDashboardPage.tsx` |
| pgcrypto migration | **Ready — user applies SQL** (`20260728104000_enable_pgcrypto_extension.sql`) |
| Deploy + audit vs 14.46 | Pending (after SQL + Vercel deploy) |
