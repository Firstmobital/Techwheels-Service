# WARRANTY-002: Design Audit — Missing/Incomplete Wiring

**Date Created:** 2026-06-03  
**Scope:** Warranty Overview Report (WarrantyOverviewReport.tsx)  
**Status:** AUDIT COMPLETE — Design elements documented for Phase 2 completion

---

## Overview Tab

### ✅ COMPLETE (DB-wired)

**6 KPIs (Overview Tab only):**
- Settlement portfolio (unique JCs)
- Claimed (all categories)
- Pending value (unposted JCs)
- Payment pending (submitted/approved pipeline)
- 20% parts revenue (computed from parts amount × 0.2)
- Settlement + revenue (combined opportunity)

**Pipeline Visualization:**
- Created / Submitted / Awaiting SOP / Approved / Settled / Rejected
- **Status:** ✅ Live data from filteredRecords via pipelineData useMemo

**Payment Status Table (7 categories):**
- Warranty Claim, Updation, AMC, Goodwill, FSB, Claim Settlement
- **Status:** ✅ Live data from filteredRecords via paymentStatusRows useMemo

**Category Counts & Claim Type Performance:**
- **Status:** ✅ Live data from filteredRecords via categoryCounts useMemo

---

## Alerts Tab

### ✅ COMPLETE (DB-wired, Design Preserved)

**5 Alert Types (All Always Render):**
1. Created but not submitted — beyond 24 hrs
2. Stuck in review stage — beyond 3 days
3. SOP document pending — beyond 2 days
4. Approved but payment not settled — beyond 5 days
5. Rejected claims — reason of rejection not filled

**Status:** ✅ Live data from filteredRecords via computedAlerts useMemo (TR-034)  
**Design Integrity:** ✅ All 5 alert types render in fixed grid layout (5 KPI columns), matching static design exactly. Empty alerts show count=0 but still render to preserve layout.  
**Fix Applied:** Changed logic from conditional push (if length > 0) to always return all 5 alert objects, ensuring design consistency regardless of data availability.

---

## Financial Tab

### 🟡 PARTIALLY COMPLETE — Requires Completion

#### Invoice Pending for Upload Table
- **Current:** ✅ Rendered with WARRANTY_AGGREGATES.invoices (static reference data)
- **Issue:** Should compute from live `extractPendingInvoices()` utility
- **Action Item:** Create extractPendingInvoices wrapper or TR-026 report component
- **Estimated Scope:** Medium — 1 useMemo hook to replace WARRANTY_AGGREGATES.invoices data

#### 20% Parts Revenue Section (4 components)
- **Revenue blocks (4 totals):** Normal WC, Extended WC, Combined, Claim Settlement
  - **Current:** Static WR_REVENUE.blocks
  - **Status:** 🔴 NEEDS WIRING
  - **Action:** Create computedRevenueBlocks useMemo using extract20PercentRevenue()
  
- **Product breakdown (by Normal/Extended WC):**
  - **Current:** Static WR_REVENUE.products (6 product models)
  - **Status:** 🔴 NEEDS WIRING
  - **Action:** Compute product splits from extract20PercentRevenue() pattern
  - **Note:** Extract product names from model field in records; group by model + warranty type
  
- **Monthly revenue breakdown:**
  - **Current:** Static WR_REVENUE.months (4 months: Jan–Apr 2026)
  - **Status:** 🔴 NEEDS WIRING
  - **Action:** Compute from created_at timestamps in filteredRecords grouped by month
  - **Note:** Group invoiceDate or created_at by calendar month; sum 20% revenue; flag warn if below trend
  
- **Monthly grid visualization:**
  - **Current:** Static WR_REVENUE.months mapped to 4 cards
  - **Status:** 🔴 DEPENDS ON monthly breakdown completion

#### AMC Settlement Stages
- **Current:** Static WR_AMC.stages (5 stages: Approved L2, L1, Sent to TM, Not Validated, Created)
- **Status:** 🔴 NEEDS WIRING
- **Action:** Compute from filteredRecords filtered by category='AMC', grouped by status/settlement_stage
- **Scope:** Low — 1 useMemo hook using GROUP BY settlement_stage

**Subtotal Financial Tab Wiring:** ~3 days (product/month extraction + AMC grouping)

---

## Operations Tab

### 🔴 NOT STARTED — All Static Data

#### 1. Pending Claims — WC Table
- **Current:** Static WR_PENDING.wcRows (12 sample rows; +19 more claimed in text)
- **Status:** 🔴 NEEDS WIRING
- **Action:** Filter filteredRecords by category='Warranty Claim' & status IN ('created', 'sop', 'submitted', 'change')
- **Scope:** Low — 1 useMemo hook with 4-way status normalization

#### 2. WC Awaiting SOP — By Model
- **Current:** Static WR_AMC.wcSopByModel (6 models: Nexon, Harrier, Punch, Altroz, Safari, Tigor)
- **Status:** 🔴 NEEDS WIRING
- **Action:** Group WC records by model where status='sop' or status='awaiting_sop'
- **Scope:** Low — 1 useMemo hook using GROUP BY model

#### 3. Updation Pending
- **Current:** Static WR_PENDING.updation (3 rows nested in WC card)
- **Status:** 🔴 NEEDS WIRING
- **Action:** Filter filteredRecords by category='Updation' & status!='settled', take first 3
- **Scope:** Low — inline in wcPendingData useMemo

#### 4. PDI Rejection Root Cause Table
- **Current:** Static WR_PDI.causes (3 causes: JC open >15d, PDI checksheet not in CRM, PDI date after delivery)
- **Status:** 🔴 NEEDS WIRING
- **Details:**
  - Currently shows hardcoded counts: 77, 32, 23 (total 132)
  - Count should reflect actual rejection_reason values in warranty records
  - Each cause is a pattern match on rejection_reason field (JSONB)
- **Action:** Extract rejection themes via extractTopRejectionReasons() pattern or new computedPdiRootCauses useMemo
- **Note:** May need complaint/theme extraction logic (already exists as extractTheme() helper)
- **Scope:** Medium — requires pattern matching on rejection_reason strings

#### 5. Top Parts by NDP — PV & EV
- **Current:** Static WR_TOP_PARTS.pv & .ev (3 parts each with NDP ₹ and JC counts)
- **Status:** 🔴 NEEDS WIRING
- **Details:**
  - Extract model field from records
  - Sum parts_amount for each unique part (group by parts field in JSONB)
  - Calculate NDP = sum(parts_amount) per part
  - Count distinct JCs per part
  - Sort by NDP descending, take top 3
- **Action:** Create computedTopPartsPv & computedTopPartsEv useMemo hooks
- **Note:** Portal='PV' for PV table; Portal='EV' for EV table
- **Scope:** Medium — requires parts extraction + aggregation by model

#### 6. Back Order — ZSOR / ZPGO / ZSSO Tracking
- **Current:** Static WR_BACKORDER (2 branches with row counts and status types)
- **Status:** 🔴 NEEDS WIRING
- **Details:**
  - Appears to track inventory back orders (ZSOR = back order, ZPGO = accessories, ZSSO = ??)
  - Not present in warranty JSONB schema (may be separate inventory query or manual reference)
  - **⚠️ Blocker:** Not in 7 warranty source tables; may need separate inventory module query
- **Action:** Investigate if ZSOR/ZPGO/ZSSO come from separate inventory table or reference data
- **Recommendation:** Document as "Requires Inventory Module Integration" or mark as reference data
- **Scope:** High — requires integration with non-warranty module

#### 7. Special Charges (980016/19/25/01/02) — Operations Display
- **Current:** Not shown on Operations tab (only static WR_SPECIAL const at file level)
- **Status:** 🟡 REFERENCE DATA EXISTS but NOT RENDERED
- **Note:** WR_SPECIAL is defined but never rendered in Operations tab JSX
- **Action:** Either remove from code or add to Operations tab with extractSpecialCharges() wiring
- **Scope:** Low — add to Operations tab grid if needed; use TR-024 (SpecialChargesReport) as model

#### 8. Recovery Opportunity (Recommendations Box)
- **Current:** Static hardcoded recommendations:
  - Extended WC conversion reminder
  - Safari + Harrier ADAS SOP training
  - 2nd FSB submission discipline
- **Status:** 🟡 DESIGN PATTERN (not data-driven)
- **Note:** These are operational recommendations, not live metrics
- **Action:** Leave as static guidance or compute recommendation triggers from live data
- **Scope:** Low — keep as-is unless requirement is to compute triggers from metrics

**Subtotal Operations Tab Wiring:** ~4–5 days (pending claims, AMC, PDI, top parts) + Blocker (back order inventory query)

---

## Summary Table: Wiring Status by Component

| Section | Component | Status | Scope | Blocker | TR Task |
|---|---|---|---|---|---|
| Overview | 6 KPIs | ✅ Done | — | — | TR-031 |
| Overview | Pipeline visualization | ✅ Done | — | — | TR-031 |
| Overview | Payment status table | ✅ Done | — | — | TR-031 |
| Overview | Category counts | ✅ Done | — | — | TR-031 |
| Alerts | 5 alert types | ✅ Done (TR-034) | — | — | TR-034 |
| Financial | Invoice pending | 🟡 Partial | Low | — | TR-026 |
| Financial | Revenue blocks | 🔴 TODO | Low | — | TR-035 (phase 2) |
| Financial | Product breakdown | 🔴 TODO | Low | — | TR-035 (phase 2) |
| Financial | Monthly revenue | 🔴 TODO | Medium | Date extraction | TR-035 (phase 2) |
| Financial | AMC stages | 🔴 TODO | Low | — | TR-035 (phase 2) |
| Operations | Pending WC claims | 🔴 TODO | Low | — | TR-031 (phase 2) |
| Operations | WC awaiting SOP by model | 🔴 TODO | Low | — | TR-031 (phase 2) |
| Operations | Updation pending | 🔴 TODO | Low | — | TR-031 (phase 2) |
| Operations | PDI root cause | 🔴 TODO | Medium | Theme extraction | TR-031 (phase 2) |
| Operations | Top parts PV/EV | 🔴 TODO | Medium | Parts aggregation | TR-031 (phase 2) |
| Operations | Back order ZSOR/ZPGO | 🔴 TODO | High | Inventory query | T-NEW |
| Operations | Recovery opportunity | 🟡 Static guidance | N/A | — | N/A |

---

## Phase 1 Completion (Current)

✅ **TR-038:** Extraction mappings contract  
✅ **TR-041:** Extraction utility functions  
✅ **TR-034:** Critical Alerts tab wiring  
✅ **TR-035 Partial:** Financial tab KPIs (5 top KPIs computed; revenue blocks/products/months still static)

---

## Phase 2 Workstream (Pending)

### High Priority (User-facing impact)
1. **TR-035 Phase 2:** Complete Financial tab (revenue blocks, product breakdown, monthly trends)
   - Estimated: 2–3 days
   - Unblocks: Revenue visibility for dealer negotiations

2. **Operations Tab Base Wiring:** Pending WC, PDI root cause, Top parts
   - Estimated: 3–4 days
   - Unblocks: Claim operations visibility, defect intelligence

### Medium Priority
3. **Special Charges Display:** Add to Operations tab or keep separate (TR-024)
   - Estimated: 1 day
   - Unblocks: Rusting/loaner/misc charge tracking

4. **Back Order Integration:** Requires inventory module access
   - Estimated: 2–3 days
   - **Blocker:** Inventory data source clarification needed

### Technical Debt
- Remove unused `WARRANTY_AGGREGATES` reference data object once all live queries complete
- Consolidate static constant definitions (WR_* objects) into separate reference file for future cleanup

---

## Design System Compliance Checklist

✅ All components use design-system classes (no Tailwind utilities)  
✅ Icon integration complete (Icon component)  
✅ Color tokens use CSS variables (var(--accent), var(--danger), etc.)  
✅ Typography uses design tokens (fontSize, fontWeight, margins)  
✅ Responsive layout via CSS Grid (grid-2, grid layout)  
✅ Card component for section grouping  
✅ Badge components for status indicators  
✅ Table styling via tbl classes

---

## File References

- **Active:** [src/pages/reports/warranty/WarrantyOverviewReport.tsx](src/pages/reports/warranty/WarrantyOverviewReport.tsx)
- **Reference:** [local_folder/Reference/WebVersionRedesignReference/docs/WARRANTY_REFERENCE.md](local_folder/Reference/WebVersionRedesignReference/docs/WARRANTY_REFERENCE.md)
- **Extraction Contract:** [docs/Implementation_plans/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md](docs/Implementation_plans/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md)
- **Extraction Utilities:** [src/lib/warranty/jsonExtraction.ts](src/lib/warranty/jsonExtraction.ts)

---

## Next Steps

1. **Confirm Back Order Data Source:** Is ZSOR/ZPGO in inventory table or reference data?
2. **Complete TR-035 Phase 2:** Wire financial tab revenue components
3. **Operations Tab Sprint:** Batch implement pending claims + PDI + top parts wiring
4. **Cleanup:** Remove reference data constants after full live wiring completion
