# P1-06 Batch E: Paginated reception lists + summary scan (2026-07-24)

**Target queryids:** `852176900607336119` (date-range page 1), `3787216458397661678` (keyset page 2+)  
**Plan:** SUPABASE-001 P1-06 Step 2 (Batch E)  
**Prior batch:** [P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md](./P1_06_RECEPTION_LIST_BOUNDING_2026-07-22.md) (Batch D — 90-day bounding)  
**Follow-up:** [P1_06_RECEPTION_SUMMARY_RPC_BATCH_F_2026-07-28.md](./P1_06_RECEPTION_SUMMARY_RPC_BATCH_F_2026-07-28.md) (Batch F — next)

## Problem

Batch D capped the date window but still **fetch-all looped** every page (200 rows × ~37 columns) on each Service Advisor / Reception load. Audit snapshot **14.45** showed:

| queryid | mean_ms | Notes |
|---------|--------:|-------|
| `852176900607336119` | ~1623 | First page, full column projection |
| `3787216458397661678` | ~391 | Same projection, keyset pages 2+ |

Column trimming alone was rejected — Service Advisor list UI requires estimate/invoice/remark fields for tiles, filters, and row actions.

## Approach (Batch E)

1. **UI pagination** — load **one page** (200 rows, full columns) on open; **Load more** for additional pages.
2. **Background summary scan** — slim column projection (`RECEPTION_SUMMARY_FIELD_COLUMNS`, 18 fields) paginated in background for SA summary tiles.
3. **Server-side search (SA)** — PostgREST `ilike` filters when search box non-empty.
4. **Reception page** — same single-page + Load more (global search pool unchanged, on-demand).

## Code changes

| Area | Change |
|------|--------|
| `src/lib/api/reception.ts` | `fetchReceptionEntriesPage`, `listReceptionEntriesByDateRangePage`, `fetchReceptionSummaryFieldsByDateRange`, etc. |
| `src/pages/ServiceAdvisorPage.tsx` | Page-1 load, Load more, background summary + assignment sets for tiles |
| `src/pages/ReceptionPage.tsx` | Page-1 load, Load more |

## Post-deploy verification — snapshot 14.46 (2026-07-28)

Baseline: **14.45** (2026-07-24). Deploy confirmed by new query shape in production stats.

### Reception list queries

| queryid | 14.45 | 14.46 | Δ (4 days) | Verdict |
|---------|------:|------:|-----------|---------|
| `852176900607336119` (page 1) | 3045 / 1623ms | 4408 / 1721ms | +1363 calls (~341/day) | Mean **worse**; still #2 |
| `3787216458397661678` (page 2+) | 5015 / 391ms | 7681 / 604ms | +2666 calls (~667/day) | Mean **worse**; still #3 |

### Call-rate ratio (auto multi-page on load)

| Window | Page-1/day | Page-2+/day | Page-2+ / Page-1 |
|--------|----------:|------------:|----------------:|
| 14.43 → 14.45 (pre-Batch E, ~2d) | ~256 | ~971 | **~3.8×** |
| 14.45 → 14.46 (post-Batch E, ~4d) | ~341 | ~667 | **~2.0×** |

**Partial success:** fewer automatic keyset pages per page-1 load. **Not done:** total reception DB time still rising; per-call latency not improved.

### New Batch E cost

| queryid | 14.46 stats | Notes |
|---------|-------------|-------|
| `3827816949739656130` | 166 calls, ~728k ms, **~4384ms mean** | Slim SA summary scan — **too expensive**; drives Batch F |

## Status

| Item | Status |
|------|--------|
| API pagination + summary scan | Done |
| ServiceAdvisorPage / ReceptionPage wiring | Done |
| Deploy | **Done** |
| Post-deploy audit 14.46 | **Done — partial verify** |
| Batch F (replace summary scan) | **Next** — see [Batch F plan](./P1_06_RECEPTION_SUMMARY_RPC_BATCH_F_2026-07-28.md) |
| Technician / floor / global search fetch-all | Pending (Batch F) |

## Deferred

- Blind column trim on shared list select
- Reception service-type tile counts from full-range summary (loaded pages only today)
