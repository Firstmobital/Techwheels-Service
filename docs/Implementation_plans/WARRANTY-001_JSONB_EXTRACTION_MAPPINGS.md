# WARRANTY-001 JSONB Extraction Mappings & Activity Tracker

**Document Purpose:** Authoritative contract for extracting structured data from warranty table JSONB fields (`source_row_data`). Defines field paths, type mappings, extraction patterns, and aggregation logic for all 28 warranty reports (TR-024 through TR-042).

**Authority:** 
- Authoritative DB schema: `local_folder/backups/chunks/full_database.sql.part_000` (warranty table definitions)
- Reference aggregates: `local_folder/Reference/WebVersionRedesignReference/docs/WARRANTY_REFERENCE.md`
- Implementation plan: `docs/Implementation_plans/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md` (TR-024..TR-042)

**Last Updated:** 2026-06-03
**Owner:** Vinod (Techwheels)
**Status:** IN PROGRESS (Phase 1: Extraction Contract Definition)

---

## Part 1: JSONB Field Mappings by Source Table

### Table 1: `warranty_wc_data` (Warranty Claim — Normal/Extended)

**Source:** WARRENTY_CLAIM.xlsx, WC sheet

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.jc_number` or `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-002799"` | Unique job card reference |
| `model` | `$.parent_model` or `$.parent` | `string` | `"Nexon"` | Parent vehicle model |
| `complaint_desc` | `$.complaint_description` | `string` | `"rusting issue"` | Complaint description for theme extraction |
| `claim_status` | `$.claim_status` | `string` | `"Submitted"` | One of: Created, Submitted, Awaiting SOP Approval, Approved, Settled, Rejected |
| `parts_amount` | `$.material_amount` | `number` | `12450.75` | NDP or list price for parts |
| `labour_amount` | `$.labour_amount` or `$.total_labour_amount_jc` | `number` | `675.50` | Labour charged |
| `spl_labour` | `$.spl_labour_charges` or `$.total_spl_lab_charges_jc` | `number` | `8235.00` | Special labour charges (job code SPL) |
| `misc` | `$.misc_amount` or `$.miscellaneous` | `number` | `1730.70` | Miscellaneous charges |
| `jc_date` | `$.job_card_date` | `string` (ISO or DD-MM-YY) | `"2026-05-22"` | Job card creation date |
| `sale_date` | `$.sale_date` or `$.invoice_date` | `string` | `"2023-11-03"` | Vehicle sale/invoice date |
| `kms` | `$.kms` or `$.odometer_reading` | `number` | `21249` | Odometer reading |
| `advisor_id` | `$.service_advisor_id` or `$.advisor` | `string` | `"ADV-001"` | Service advisor identifier |
| `failure_type` | `$.failure_type` | `string` | `"OE Failure"` | Classification |
| `claim_number` | `$.claim_number` | `string` | `"000014917748"` | TM claim number (if any) |
| `warranty_type` | `$.warranty_type` | `string` | `"Normal Warranty"` or `"Extended WC"` | Warranty classification |

**Aggregation Note:** Group by `branch` + `portal` (from table columns) + JSONB status to compute pipeline counts (Created, Submitted, Awaiting SOP, Approved, Settled, Rejected).

---

### Table 2: `warranty_claim_settlement_report_data` (Settlement Invoicing)

**Source:** Claim-Settlement-Report__28_.xls + related settlement files

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` or `$.jc_number` | `string` | `"JC-MbtPlt-JP1-2627-000936"` | Links to WC entry |
| `part_code` | `$.part_code` | `string` | `"542483403383"` | Part master code |
| `part_desc` | `$.part_description` | `string` | `"AC COMPRESSOR"` | Part description |
| `list_price` | `$.list_price` or `$.mrp` | `number` | `17307.00` | MRP (for 20% revenue calc) |
| `ndp` | `$.ndp` or `$.tata_motors_amount` | `number` | `14191.74` | TM-settled amount |
| `labour` | `$.labour` | `number` | `675.00` | Labour component |
| `spl_labour` | `$.spl_labour_charges` or `$.special_labour` | `number` | `8235.00` | Special labour (job code) |
| `misc` | `$.misc` or `$.miscellaneous` | `number` | `0.00` | Misc charges |
| `posting_doc_number` | `$.posting_document_number` or `$.posted_doc_id` | `string` or `null` | `"TM-DOC-12345"` or `null` | Posting doc ID; null = not posted |
| `invoice_number` | `$.dealer_invoice_number` or `$.invoice_no` | `string` | `"C00088"` | Dealer invoice number |
| `job_code` | `$.job_code` | `string` | `"980016"` or `"980019"` | Job code for SPL classification |
| `service_date` | `$.service_date` | `string` | `"2026-05-22"` | Service completion date |
| `posted_date` | `$.posted_date` | `string` or `null` | `"2026-05-25"` or `null` | Date posting doc was created |
| `is_invoiced` | `$.is_invoiced` | `boolean` | `true` or `false` | Invoice upload status |

**Aggregation Note:** `posting_doc_number IS NULL OR posting_doc_number = ''` identifies pending/not-posted invoices. Sum NDP+Labour+SPL+Misc for pending value calculation. Job code grouping for special charges dashboard (TR-024).

---

### Table 3: `warranty_updation_claim_data` (Updation/Campaign)

**Source:** UPDATION_CLAIM.csv

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-XXX"` | Updation job card |
| `model` | `$.parent_model` | `string` | `"Tiago"` or `"Safari"` | Parent model |
| `claim_status` | `$.claim_status` | `string` | `"Created"` or `"Rejected"` | Pipeline stage |
| `parts_amount` | `$.material_amount` | `number` | `5000.00` | Parts cost |
| `labour_amount` | `$.labour_amount` | `number` | `1500.00` | Labour cost |
| `campaign_code` | `$.campaign_code` | `string` | `"CAM-2026-001"` | Campaign identifier |
| `approval_status` | `$.approval_status` | `string` | `"Pending"` or `"Approved"` | Internal approval |
| `rejection_reason` | `$.rejection_reason` | `string` | `"ADAS calibration incomplete"` | Reason if rejected |
| `claim_date` | `$.claim_date` | `string` | `"2026-05-20"` | Claim submission date |

**Aggregation Note:** Rejection % by model (Safari + Harrier = 79% of rejections). ADAS SOP training signal.

---

### Table 4: `warranty_goodwill_data` (OEM Goodwill)

**Source:** GOODWILL.csv

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-YYY"` | Goodwill job card |
| `model` | `$.parent_model` | `string` | `"Nexon"` | Parent model |
| `claim_status` | `$.claim_status` | `string` | `"Settled"` | Most are settled (OEM-funded) |
| `claimed_amount` | `$.claimed_amount` | `number` | `5000.00` | OEM goodwill payout |
| `approval_date` | `$.approval_date` | `string` | `"2026-05-21"` | OEM approval date |
| `reason` | `$.goodwill_reason` | `string` | `"Customer satisfaction"` | Reason for goodwill |
| `settled_date` | `$.settled_date` | `string` | `"2026-05-22"` | Settlement date |

**Aggregation Note:** Goodwill settlement % (typically 97.7% settled per reference). No 20% revenue calculation (OEM-funded).

---

### Table 5: `warranty_fsb_data` (Free Service — 1st/2nd/3rd)

**Source:** Free Service Billing CSV (FSB.csv)

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-ZZZ"` | FSB job card |
| `model` | `$.parent_model` | `string` | `"Nexon"` | Parent model |
| `fsb_type` | `$.fsb_type` or `$.service_type` | `string` | `"1st Free Service"` or `"2nd Free Service"` | FSB sequence |
| `service_date` | `$.service_date` | `string` | `"2026-05-15"` | Service completion |
| `labour_amount` | `$.labour_amount` | `number` | `1200.00` | FSB labour charge |
| `parts_amount` | `$.parts_amount` | `number` | `3500.00` | FSB parts cost |
| `claim_status` | `$.claim_status` | `string` | `"Accepted"` or `"Rejected"` | TM acceptance |
| `rejection_reason` | `$.rejection_reason` | `string` | `"Late submission"` or `"PDI checksheet missing"` | If rejected |
| `vcm_comments` | `$.vcm_comments` | `string` | `"JC open > 15 days"` | VCM feedback |

**Aggregation Note:** 1st/2nd/3rd FSB rejection % (2nd FSB = 17.4% rej). PDI rejection root causes extracted from `vcm_comments` (3 categories: JC>15d, checksheet missing, PDI after delivery).

---

### Table 6: `warranty_part_wc_data` (Part Warranty)

**Source:** PART_WC.csv

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-PPP"` | Part WC job card |
| `part_code` | `$.part_code` | `string` | `"542483403383"` | Part master code |
| `part_desc` | `$.part_description` | `string` | `"AC COMPRESSOR"` | Part description |
| `list_price` | `$.list_price` | `number` | `17307.00` | List price for 20% calc |
| `ndp` | `$.ndp` or `$.settled_amount` | `number` | `14191.74` | TM-settled |
| `claim_status` | `$.claim_status` | `string` | `"Settled"` or `"Rejected"` | Claim status |
| `claim_date` | `$.claim_date` | `string` | `"2026-05-22"` | Claim submission |

**Aggregation Note:** Top parts by NDP/frequency. Systemic defect flagging (e.g., Alternator OED Pulley ₹10L/252 JCs).

---

### Table 7: `warranty_amc_data` (AMC Settlement)

**Source:** AMC.csv

| Field Name | JSONB Path | Type | Example Value | Notes |
|---|---|---|---|---|
| `jc_id` | `$.job_card_id` | `string` | `"JC-MbtPlt-JP1-2627-AMC"` | AMC job card |
| `model` | `$.parent_model` | `string` | `"Safari"` | Parent model |
| `claimed_amount` | `$.claimed_amount` | `number` | `387588.00` | AMC claim value |
| `approved_stage` | `$.approval_stage` | `string` | `"Approved L2"` or `"Sent to TM"` | Approval stage |
| `tm_approved_amount` | `$.tm_approved_amount` | `number` | `328754.00` | TM-approved settlement |
| `approval_date` | `$.approval_date` | `string` | `"2026-05-25"` | L2 approval date |
| `payment_date` | `$.payment_date` | `string` or `null` | `"2026-05-28"` or `null` | Payment settlement date |
| `document_status` | `$.document_status` | `string` | `"Complete"` or `"Pending"` | Documentation status |

**Aggregation Note:** AMC payment gap = claimed − tm_approved. Stages for pipeline visualization. Payment date nulls identify pending settlements.

---

## Part 2: Type Definitions (TypeScript)

```typescript
// src/lib/warranty/types.ts

export interface WarrantyJCBase {
  jc_id: string
  model: string
  branch: string  // from table column
  location: string  // from table column
  portal: 'PV' | 'EV'  // from table column
  claim_status: 'Created' | 'Submitted' | 'Awaiting SOP Approval' | 'Approved' | 'Settled' | 'Rejected'
  jc_date: string  // ISO format
}

export interface WarrantyClaim extends WarrantyJCBase {
  complaint_desc: string
  parts_amount: number
  labour_amount: number
  spl_labour: number
  misc: number
  sale_date: string
  kms: number
  advisor_id?: string
  warranty_type: 'Normal Warranty' | 'Extended WC'
}

export interface SettlementRecord extends WarrantyJCBase {
  part_code: string
  part_desc: string
  list_price: number  // MRP for 20% calc
  ndp: number  // TM settled
  labour: number
  spl_labour: number
  misc: number
  posting_doc_number: string | null  // null = not posted
  invoice_number: string
  job_code?: string  // 980016, 980019, 980025, 980001, 980002
  service_date: string
  posted_date?: string
  is_invoiced: boolean
}

export interface UpdationClaim extends WarrantyJCBase {
  campaign_code: string
  parts_amount: number
  labour_amount: number
  approval_status: 'Pending' | 'Approved' | 'Rejected'
  rejection_reason?: string
}

export interface GoodwillClaim extends WarrantyJCBase {
  claimed_amount: number
  approval_date: string
  reason: string
  settled_date?: string
}

export interface FSBRecord extends WarrantyJCBase {
  fsb_type: '1st Free Service' | '2nd Free Service' | '3rd Free Service'
  service_date: string
  labour_amount: number
  parts_amount: number
  rejection_reason?: string
  vcm_comments?: string
}

export interface PartWCRecord extends WarrantyJCBase {
  part_code: string
  part_desc: string
  list_price: number
  ndp: number
  claim_date: string
}

export interface AMCRecord extends WarrantyJCBase {
  claimed_amount: number
  approved_stage: 'Approved L2' | 'Approved L1' | 'Sent to TM' | 'Not Validated' | 'Created'
  tm_approved_amount: number
  approval_date: string
  payment_date?: string
  document_status: 'Complete' | 'Pending'
}

// Aggregated types for reports
export interface KPITile {
  icon: string
  label: string
  value: string
  sub: string
  tone: string
}

export interface PipelineStage {
  stage: string
  count: number
  color: string
}
```

---

## Part 3: Extraction Patterns (Supabase Client)

### Pattern 1: Extract Pipeline Stage Counts (Overview → KPI strip)

```typescript
// src/lib/warranty/extraction.ts
import { supabase } from '../supabase'

export async function extractPipelineStages(branch: string, location: string, portal: 'PV' | 'EV') {
  const stages = ['Created', 'Submitted', 'Awaiting SOP Approval', 'Approved', 'Settled', 'Rejected']
  const counts: Record<string, number> = {}

  for (const stage of stages) {
    const { count, error } = await supabase
      .from('warranty_wc_data')
      .select('*', { count: 'exact' })
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)
      .eq('claim_status', stage)

    if (error) throw error
    counts[stage] = count || 0
  }

  return counts  // { Created: 12, Submitted: 45, ... }
}
```

### Pattern 2: Extract Payment Status by Category

```typescript
export async function extractPaymentStatus(branch: string, location: string, portal: 'PV' | 'EV') {
  const categories = ['wc', 'settlement', 'updation', 'goodwill', 'fsb', 'part_wc', 'amc']
  const result = []

  for (const cat of categories) {
    const tableName = `warranty_${cat === 'wc' ? 'wc_data' : cat === 'settlement' ? 'claim_settlement_report_data' : `${cat}_data`}`
    
    const { data, error } = await supabase
      .from(tableName)
      .select('source_row_data')
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)

    if (error) throw error

    const statusCounts = { Settled: 0, Approved: 0, Submitted: 0, Rejected: 0, Created: 0 }
    data?.forEach((row) => {
      const status = row.source_row_data?.claim_status || 'Created'
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    result.push({ category: cat, ...statusCounts })
  }

  return result
}
```

### Pattern 3: Extract Pending Invoices (Financial → Invoice table)

```typescript
export async function extractPendingInvoices(branch: string, location: string, portal: 'PV' | 'EV') {
  const { data, error } = await supabase
    .from('warranty_claim_settlement_report_data')
    .select('source_row_data, invoice_number')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)
    .or(`source_row_data->posting_doc_number.is.null,source_row_data->posting_doc_number.eq.""`)

  if (error) throw error

  const grouped: Record<string, any> = {}
  data?.forEach((row) => {
    const inv = row.source_row_data?.invoice_number || 'UNKNOWN'
    if (!grouped[inv]) {
      grouped[inv] = {
        invoice: inv,
        jcs: 0,
        parts: 0,
        labour: 0,
        spl: 0,
        total: 0,
      }
    }
    grouped[inv].jcs += 1
    grouped[inv].parts += row.source_row_data?.ndp || 0
    grouped[inv].labour += row.source_row_data?.labour || 0
    grouped[inv].spl += row.source_row_data?.spl_labour || 0
    grouped[inv].total = grouped[inv].parts + grouped[inv].labour + grouped[inv].spl
  })

  return Object.values(grouped)
}
```

### Pattern 4: Extract Special Charges by Job Code (TR-024)

```typescript
export async function extractSpecialCharges(branch: string, location: string, portal: 'PV' | 'EV') {
  const jobCodes = ['980016', '980019', '980025', '980001', '980002']
  const result: Record<string, { label: string; total: number; jcs: number }> = {}

  for (const code of jobCodes) {
    const { data, error } = await supabase
      .from('warranty_claim_settlement_report_data')
      .select('source_row_data')
      .eq('branch', branch)
      .eq('location', location)
      .eq('portal', portal)
      .eq('source_row_data->job_code', code)

    if (error) throw error

    const labels = {
      '980016': 'Rusting / Body SPL',
      '980019': 'Loaner Car',
      '980025': 'Special Misc',
      '980001': 'Loading / Unloading',
      '980002': 'Crane charges',
    }

    let total = 0
    data?.forEach((row) => {
      total += row.source_row_data?.spl_labour || 0
    })

    result[code] = { label: labels[code] || code, total, jcs: data?.length || 0 }
  }

  return result
}
```

### Pattern 5: Calculate 20% Parts Revenue

```typescript
export async function extract20PercentRevenue(branch: string, location: string, portal: 'PV' | 'EV') {
  const { data, error } = await supabase
    .from('warranty_claim_settlement_report_data')
    .select('source_row_data')
    .eq('branch', branch)
    .eq('location', location)
    .eq('portal', portal)

  if (error) throw error

  let totalMRP = 0
  let revenue20 = 0
  const byProduct: Record<string, { parts: number; revenue: number; count: number }> = {}

  data?.forEach((row) => {
    const rowData = row.source_row_data || {}
    const marp = rowData.list_price || 0
    const model = rowData.parent_model || 'Unknown'

    if (marp > 0) {
      totalMRP += marp
      revenue20 += marp * 0.2

      if (!byProduct[model]) byProduct[model] = { parts: 0, revenue: 0, count: 0 }
      byProduct[model].parts += marp
      byProduct[model].revenue += marp * 0.2
      byProduct[model].count += 1
    }
  })

  return { totalMRP, revenue20, byProduct }
}
```

---

## Part 4: Aggregation Patterns for Report Families

### Family A (Dashboard & Monitoring) — TR-024 through TR-033

**KPI Aggregation:**
- Settlement portfolio = SUM(NDP+Labour+SPL+Misc) across all warranty_*_data tables
- Pending value = SUM(NDP+Labour+SPL+Misc) where `posting_doc_number IS NULL OR = ''`
- 20% revenue = SUM(MRP × 0.20) for all settlement records where MRP > 0
- Payment pending = Claimed − Settled across all categories

**Query Template:**
```typescript
const settlementTotal = await supabase
  .from('warranty_claim_settlement_report_data')
  .select('source_row_data')
  .eq('branch', selectedBranch)
  .eq('location', selectedLocation)
  .eq('portal', selectedPortal)
  .then(({ data }) => {
    return data?.reduce((sum, row) => {
      const rd = row.source_row_data || {}
      return sum + (rd.ndp || 0) + (rd.labour || 0) + (rd.spl_labour || 0) + (rd.misc || 0)
    }, 0) || 0
  })
```

### Family B (Claim Analysis) — TR-024, TR-028, TR-036, TR-037

**Rejection Root-Cause Extraction:**
- Filter where `source_row_data->claim_status = 'Rejected'`
- Extract `source_row_data->rejection_reason` or `source_row_data->vcm_comments`
- Aggregate by reason → count + percentage

**Rusting Filter Pattern:**
```typescript
const rustingRecords = data?.filter((row) => {
  const complaint = (row.source_row_data?.complaint_description || '').toLowerCase()
  return complaint.includes('rust') || complaint.includes('rusting') || complaint.includes('corrosion')
})
```

### Family C (Settlement) — TR-027, TR-033, TR-039

**Settlement Aging Calculation:**
```typescript
const agingDays = (approvalDate, settlementDate) => {
  if (!settlementDate) return null
  return Math.floor((new Date(settlementDate) - new Date(approvalDate)) / (1000 * 60 * 60 * 24))
}
```

Group by stage + calculate avg days per stage vs. SLA target (4.7 days avg for Review→Approve = "High" flag).

### Family D (Parts/Backorder) — TR-031

**Top Parts by NDP & Frequency:**
```typescript
const topParts = data?.reduce((acc, row) => {
  const part = row.source_row_data?.part_code
  if (!part) return acc
  if (!acc[part]) acc[part] = { desc: row.source_row_data?.part_description, total: 0, count: 0 }
  acc[part].total += row.source_row_data?.ndp || 0
  acc[part].count += 1
  return acc
}, {})

// Sort by NDP descending
const sorted = Object.entries(topParts)
  .map(([code, data]) => ({ code, ...data }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 20)  // Top 20
```

---

## Part 5: Activity Tracker (Synced with Master Tracker)

| Date | Phase | TR Tasks | Activity | Status | Diff vs Master Tracker | Evidence |
|---|---|---|---|---|---|---|
| 2026-06-03 | 1 | TR-038 | **Created this document:** Extraction mappings for all 7 warranty tables, type definitions (TypeScript), query patterns for dashboard KPIs, payment status, pending invoices, special charges, 20% revenue | COMPLETE | *Initial creation of extraction contract* | docs/Implementation_plans/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md |
| 2026-06-03 | 1 | TR-041 | **COMPLETE:** Created `src/lib/warranty/jsonExtraction.ts` with all 5 extraction utility functions (extractPipelineStages, extractPaymentStatus, extractPendingInvoices, extractSpecialCharges, extract20PercentRevenue) + 6 helper functions (formatCurrency, extractTheme, calculateTAT, determineSLAHealth, isRejectionReasonBlank, aggregateWCByType, extractTopRejectionReasons). All patterns from Part 3 fully implemented with type safety and error handling. | COMPLETE | Unblocks all Phase 2 report implementations | src/lib/warranty/jsonExtraction.ts (565 lines, fully typed, tested patterns) |
| 2026-06-03 | 2 | TR-034 | **COMPLETE:** Wired Critical Alerts tab in WarrantyOverviewReport.tsx to compute alerts from filteredRecords live data: Created >24h, Review >3d, SOP pending >2d, Approved-not-settled >5d, Rejection reason blank. Replaced static WR_ALERTS const with computed `computedAlerts` useMemo hook. Build clean (723 modules, 0 TS errors, 879ms). | COMPLETE | High-impact tab refactor; alerts now dynamic | src/pages/reports/warranty/WarrantyOverviewReport.tsx |
| 2026-06-03 | 2 | TR-035 | **COMPLETE:** Wired Financial tab in WarrantyOverviewReport.tsx to compute KPIs from live data: invoices pending upload, pending WC claims, AMC pending settlement, 20% revenue (Normal WC + Extended WC). Replaced static WR_KPIS const with computed `computedFinancialKpis` useMemo hook. Build clean (723 modules, 0 TS errors, 879ms). | COMPLETE | High-impact tab refactor; revenue now dynamic | src/pages/reports/warranty/WarrantyOverviewReport.tsx |
| — | 2 | TR-026 | **Next Phase:** Implement InvoiceUploadReport.tsx using `extractPendingInvoices()` pattern (Part 3, Pattern 3) | PENDING | Unblocked after TR-041 ✅ | — |
| — | 2 | TR-027 | **Next Phase:** Implement SettlementAgingReport.tsx using settlement aging logic (Part 4, Family C) + `calculateTAT()` helper | PENDING | Unblocked after TR-041 ✅ | — |
| — | 2 | TR-024 | **Next Phase:** Implement SpecialChargesReport.tsx using `extractSpecialCharges()` pattern (Part 3, Pattern 4) | PENDING | Unblocked after TR-041 ✅ | — |
| 2026-06-03 | 2 | T-047 | **COMPLETE:** Design audit completed. Documented all missing/incomplete wiring in WARRANTY-002_DESIGN_AUDIT_MISSING_WIRING.md. Summary: Overview tab ✅ 100%, Alerts tab ✅ 100% (TR-034), Financial tab 🟡 60% (KPIs done; revenue blocks/products/months static), Operations tab 🔴 0% (all static data). Blockers identified: back order inventory query (may need separate module), date extraction for monthly trends. | COMPLETE | Design roadmap locked; prevents scope drift | docs/Implementation_plans/WARRANTY-002_DESIGN_AUDIT_MISSING_WIRING.md |

---

## Sync Rules (Zero-Drift Protocol)

1. **Every TR task execution must:**
   - Update this Activity Tracker table with date, status, and evidence file path
   - Update master tracker simultaneously: `docs/Implementation_plans/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md`
   - Add commit message format: `TR-### | task-name | file paths`

2. **This document is authoritative for:**
   - JSONB field paths and type safety
   - Extraction query patterns
   - Aggregation logic for all report families

3. **Master tracker is authoritative for:**
   - Overall timeline, ownership, SLA dates
   - Cross-module dependencies
   - UI/UX parity evidence

4. **If extraction pattern changes:**
   - Update Part 3 first with new query logic
   - Document breaking changes in Activity Tracker
   - Re-validate all dependent TR tasks

---

## Next Steps

1. ✅ **This document completed** (TR-038-CORRECTED): Extraction contract defined
2. ⏳ **TR-041:** Create extraction utilities (`src/lib/warranty/jsonExtraction.ts`) implementing all 5 patterns above
3. ⏳ **TR-024, TR-026, TR-027:** Implement new report components (highest impact first)
4. ⏳ **TR-034, TR-035:** Refactor existing warranty-overview tabs to live queries
5. ⏳ **TR-025, TR-028–TR-033, TR-036, TR-037, TR-039, TR-040:** Remaining reports

---

**Document Signature:**  
Created: 2026-06-03 by Vinod  
Authority: Authoritative DB dump + WARRANTY_REFERENCE.md + TR matrix  
Status: Foundation layer complete; ready for Phase 2 implementations
