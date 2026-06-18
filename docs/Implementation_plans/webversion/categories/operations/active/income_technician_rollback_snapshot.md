# Technician Tracker: Full Business Logic & UX Snapshot (PRE-REFACTOR)

**Snapshot Date:** 2026-06-15  
**Version:** Current production (before invoice_date refactor)  
**Purpose:** Complete reference for rollback if future changes need to be reverted

---

## 📐 Data Structures

### Primary Types

```typescript
type TechnicianAssignmentRow = {
  id: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string           // ISO timestamp
  assigned_by: string | null
  bay_no: string | null         // e.g., "PV-01", "EV-02" (first 3 chars determine fuel type)
  work_status: string | null    // "completed", "hold", "work inprocess", etc.
  out_ts: string | null         // Out timestamp (when work completed)
  time_diff: string | null
  remark: string | null
  created_at?: string | null
  updated_at?: string | null
  reg_number?: string | null    // Vehicle registration number (from floor_incharge or reception)
  branch?: string | null        // Branch location
  fuel_type?: string | null     // PV or EV (from floor_incharge/reception or inferred from bay_no)
  gross_labour_amount?: number  // Labour amount from job_card_closed_data
  technician_income?: number    // Calculated income (PV % or EV % of labour)
  invoice_date?: string | null  // [NEW - added in refactor] From job_card_closed_data
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null      // JC closure timestamp
  invoice_date: string | null          // Invoice billing date (PREFERRED DATE SOURCE)
  final_labour_amount: number | string | null  // Labour amount
}

type TechnicianSummaryCard = {
  code: string                  // Technician code
  name: string                  // Technician name
  rowCount: number              // Total JCs assigned
  dayCount: number              // Number of distinct days worked
  totalIncome: number           // Sum of technician_income across all JCs
}

type DayWiseCard = {
  dateKey: string               // YYYY-MM-DD format (IST timezone)
  label: string                 // Human-readable date (e.g., "15 Jun 2026")
  rowCount: number              // JCs on that day
  completedCount: number        // Completed JCs on that day
  totalIncome: number           // Total income on that day
}

type VehicleOnDayCard = {
  regKey: string                // Registration number or "UNREG-{jc_number}"
  label: string                 // Registration or "(No Reg)" label
  rowCount: number              // JCs for that vehicle
  completedCount: number        // Completed JCs for that vehicle
  totalIncome: number           // Income from that vehicle
}

type YesterdayRow = {
  technician_name: string
  technician_code: string
  job_card_number: string
  reg_number: string
  branch: string
  fuel_type: string
  bay_no: string
  gross_labour_amount: number
  technician_income: number
  work_status: string
}
```

---

## 🔄 State Management

### Primary State Variables

| State | Type | Initial Value | Purpose |
|-------|------|---------------|---------|
| `loading` | boolean | true | Loading indicator during data fetch |
| `dateRange` | DateRange | currentMonthRange() | Primary date filter (Period) |
| `error` | string \| null | null | Error message display |
| `reportEmailState` | {type, message} \| null | null | Email report status (success/error) |
| `sendingReportEmail` | boolean | false | Email report sending state |
| `generatingReport` | boolean | false | Yesterday report generation state |
| `yesterdayReport` | {rows, date, waText} \| null | null | Yesterday's report modal data |
| `showPivotReport` | boolean | false | Pivot report modal visibility |
| `assignments` | TechnicianAssignmentRow[] | [] | Primary data (all assignments + enriched fields) |
| `canEditSharePercent` | boolean | false | Permission flag for editing share percentages |
| `pvSharePercent` | number | 20 | PV technician income share % |
| `evSharePercent` | number | 25 | EV technician income share % |
| `draftPvSharePercent` | string | "20" | Draft PV % (for edit UI) |
| `draftEvSharePercent` | string | "25" | Draft EV % (for edit UI) |
| `selectedTechnicianCode` | string | '' | Selected technician for drill-down |
| `selectedDayKey` | string | '' | Selected day for technician detail |
| `selectedVehicleOnDayKey` | string | '' | Selected vehicle for that day |
| `fromDate` | string | '' | Custom range start date (YYYY-MM-DD) |
| `toDate` | string | '' | Custom range end date (YYYY-MM-DD) |
| `branchFilter` | string | 'all' | Branch location filter |
| `fuelTypeFilter` | string | 'all' | Portal/Fuel type filter (PV/EV) |

---

## 📊 Data Fetching & Enrichment

### loadData() Function Flow

**Entry Triggers:**
- On mount (via useEffect)
- When `dateRange` changes (Primary Period filter)

**Process:**

1. **Auth Check**
   - Get current user from Supabase Auth
   - If no user, return early with empty assignments
   - Check admin permission via user metadata

2. **Fetch Technician Assignments**
   ```
   Query: supabase.from('technician_assignments')
     .select('*')
     .gte('assigned_at', dateRange.from + 'T00:00:00+05:30')
     .lte('assigned_at', dateRange.to + 'T23:59:59+05:30')
     .order('assigned_at', { ascending: false })
     .range(from, from + 1000 - 1)
   
   Pagination: 1000 rows per page, loop until batch < 1000
   Date Filter: assigned_at (BEFORE REFACTOR)
                invoice_date (AFTER REFACTOR - from job_card_closed_data)
   ```

3. **Deduplicale Latest Assignments per JC**
   - Group by `job_card_number`
   - Keep latest per JC (by `updated_at` → `out_ts` → `assigned_at` → `created_at` → `id`)

4. **Identify Completed Assignments**
   - Filter: `work_status === 'completed'`
   - Keep latest per JC (dedupe by recency)

5. **Enrich from Floor Incharge & Reception**
   - Fetch `floor_incharge_entries` for all JCs
   - Extract: `reg_number`, `branch`, `fuel_type`
   - For unresolved, fetch `reception_entries`
   - Fallback: Infer branch from technician_code pattern

6. **Fetch Revenue Data**
   ```
   Query: supabase.from('job_card_closed_data')
     .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
     .in('job_card_number', completedJcNumbers)
   ```
   - Dedupe per JC: keep latest by `closed_date_time` OR `invoice_date`

7. **Set Assignments State**
   - Map enriched data with: `reg_number`, `branch`, `fuel_type`, `gross_labour_amount`
   - Final assignment rows = all assignments (not just completed)

---

## 🧮 Calculation Engines

### calculateTechnicianIncome()

```typescript
function calculateTechnicianIncome(
  grossLabourAmount: number,
  bayNo: string | null,
  pvSharePercent: number,
  evSharePercent: number
): number
```

**Logic:**
1. If `grossLabourAmount <= 0` → return 0
2. Determine portal type from `bayNo`:
   - If starts with "PV-" → use `pvSharePercent`
   - If starts with "EV-" → use `evSharePercent`
   - Default: use `pvSharePercent` (20%)
3. Calculate: `income = grossLabourAmount × (percent / 100)`
4. Return rounded value

**Default Constants:**
- PV Share: 20%
- EV Share: 25%

### getAssignmentDateKey()

**BEFORE REFACTOR:**
```typescript
const dateSource = row.out_ts ?? row.assigned_at  // FALLBACK LOGIC
```

**AFTER REFACTOR:**
```typescript
const dateSource = row.invoice_date  // NO FALLBACK
```

**Process (same for both):**
1. If no dateSource → return null
2. Parse date and format to IST timezone
3. Return: YYYY-MM-DD (en-CA locale)

### getIncomeDateKey()

**Priority Order (for ledger grouping):**
1. `revenue.closed_date_time` (JC closure timestamp)
2. `revenue.invoice_date` (Invoice date) ← PREFERRED
3. `assignment.out_ts` (Work completion timestamp)
4. `assignment.assigned_at` (Assignment timestamp)

**Purpose:** Group income by date for pivot reports

---

## 🔍 Data Scoping Pipeline

**Sequential Filtering:**

```
assignments (raw)
    ↓
assignmentsWithIncome (add calculated income)
    ↓
dateScopedAssignmentsWithIncome
    │ Filter: Custom range (fromDate, toDate) if set
    │ [Bypassed if both empty]
    ↓
branchScopedAssignmentsWithIncome
    │ Filter: Branch location (branchFilter)
    │ [Bypassed if 'all']
    ↓
filteredAssignmentsWithIncome
    │ Filter: Fuel type/Portal (fuelTypeFilter)
    │ [Bypassed if 'all']
    ↓
technicianCards (aggregated by technician)
```

### Custom Date Range (fromDate, toDate)

- **Activation:** Both values must be non-empty
- **Comparison:** Uses `getAssignmentDateKey()` (YYYY-MM-DD string comparison)
- **Logic:**
  ```
  if (fromDate && dateKey < fromDate) exclude
  if (toDate && dateKey > toDate) exclude
  ```
- **Scope:** Only applied to `dateScopedAssignmentsWithIncome`
- **Effect:** Narrows results within primary period

### Branch Filter (Location)

- **Options:** Dynamically populated from `dateScopedAssignmentsWithIncome`
- **Sort:** Alphabetical, "Unknown location" last
- **Count Display:** Shows JC count per branch
- **Sync:** Auto-resets to 'all' if selected branch disappears

### Fuel Type Filter (Portal)

- **Options:** Dynamically populated from `branchScopedAssignmentsWithIncome`
- **Logic:**
  - If `fuel_type` present: use directly
  - Else: infer from `bay_no` first 3 chars ("PV-" or "EV-")
  - Fallback: "Unknown" label
- **Sort:** Alphabetical, "Unknown" last
- **Sync:** Auto-resets to 'all' if selected type disappears

---

## 🎯 UI Components & Features

### 1. Top Control Bar

**Layout:**
- Technician Tracker title + JC count
- Period filter (date range selector)
- Location filter buttons (All, Ajmer Road, Sitapura, etc.)
- Portal filter buttons (All, PV, EV, etc.)
- Action buttons: Yesterday, Pivot, (Email if admin)

**Buttons:**
- **Yesterday**: Generates report for yesterday's completed jobs
  - Modal with table + Excel download + WhatsApp share
  - Uses `fetchYesterdayReportData()` RPC call
  - Disabled while generating (`generatingReport` state)

- **Pivot**: Opens pivot report modal
  - Dates (rows) × Technicians (columns) matrix
  - Values = technician income for that date
  - Includes day totals and technician totals

- **Email Report** (admin only):
  - Requires both `fromDate` AND `toDate` set
  - Calls `sendTechnicianDailyEarningsTestEmail()` 
  - Shows success/error toast

### 2. Technician Summary Cards

**Grid Layout:** Each technician gets a card showing:
- Technician name + code
- Row count (JCs assigned)
- Day count (distinct days)
- Total income (sum)

**Sorting:** By total income (descending), then row count

**Interaction:** Click to expand and show day-wise breakdown

**Selection State:** `selectedTechnicianCode`

### 3. Day-Wise Breakdown (Expanded Technician)

**Shows:** For selected technician, cards for each day worked
- Date label (formatted as "15 Jun")
- Row count on that day
- Completed count
- Day income total

**Interaction:** Click day to show vehicle-wise details

**Selection State:** `selectedDayKey`

### 4. Vehicle-Wise Details (Expanded Day)

**Shows:** For selected day, cards for each vehicle/job
- Registration number or "(No Reg)" label
- Row count
- Completed count
- Vehicle income

**Interaction:** Click to view full row details (job card, amount, etc.)

**Selection State:** `selectedVehicleOnDayKey`

### 5. Job Card Details Table

**Columns:**
- Technician name
- Job card number
- Registration number
- Branch
- Fuel type
- Labour amount (₹)
- Amount paid to technician (₹)

**Row Styling:**
- Group rows by technician (grey separator rows)
- Show subtotal per technician (labour + paid)
- Final total at bottom

**Interaction:**
- Grouped display (technician level)
- Sortable context (highest earners first)

### 6. Pivot Report Modal

**Structure:**
- Dates as rows
- Technicians as columns
- Values = income for that (date, technician)
- Sticky headers (both axes)
- Day totals (rightmost column)
- Technician totals (bottom row)
- Grand total (bottom-right)

**Formatting:**
- Currency display (₹)
- Alternating row backgrounds
- Emphasized grand total row (blue bg, large font)

**Actions:**
- Download as Excel

### 7. Yesterday Report Modal

**Header:** "Yesterday's Report — [date]" + job count

**Content:**
- Table of completed jobs from yesterday
- Columns: Technician, Job Card, Reg, Branch, Fuel, Labour, Paid
- Grouped by technician with subtotals

**Actions:**
- **Download Excel**: XLSX file with table data
- **Share on WhatsApp**: Opens wa.me with pre-formatted text
- **Copy Text**: Copies WhatsApp message to clipboard

**WhatsApp Message Format:**
```
🏆 Technician Earnings Report — [Date]

💼 Technicians: [count]
📊 Earnings: ₹[total]
📍 Jobs: [count]

[For each technician:]
  TECHNICIAN_NAME (Tech Code)
  [For each job:]
    🚗 Reg  Labour: ₹X  Paid: ₹Y
  Total Labour: ₹X | Paid: ₹Y

━━━━━━━━━━━━━━━━━━━━
🏆 Total Labour: ₹X
💰 Total Paid: ₹Y
```

### 8. Share Percentage Settings (Admin Only)

**Edit Mode:**
- Show draft input fields for PV % and EV %
- Validation: 0-100 range
- Apply/Cancel buttons
- Shows diff highlight if changed

**Display Mode:**
- PV: [20]% EV: [25]%
- Only editable by admin

---

## 🔐 Permission & Auth

### User Check
```typescript
const authRes = await supabase.auth.getUser()
const userId = authRes.data.user?.id
```

### Admin Detection
```typescript
const appMetadata = authRes.data.user?.user_metadata?.app_metadata ?? {}
const role = String(appMetadata.role ?? '').trim().toLowerCase()
const isAdmin = role === 'admin'
```

### Features Guarded by Admin:
- Edit share percentages
- Send email report
- View admin-specific data

---

## 🌐 API Integrations

### REST Queries

1. **fetchYesterdayReportData(pvPct, evPct)**
   - Returns: {rows: YesterdayRow[], date: string}
   - Fetches completed JCs from yesterday
   - Calculates income for each with given percentages
   - Sorts by technician name, then income desc

2. **listFloorInchargeEntries()**
   - Returns: {data?, error?}
   - Gets all floor incharge records
   - Used for branch/reg/fuel enrichment

3. **listReceptionEntries()**
   - Returns: {data?, error?}
   - Gets all reception records
   - Fallback for missing enrichment data

4. **sendTechnicianDailyEarningsTestEmail()**
   - Params: {runFromIst, runToIst}
   - Returns: {data: {reportLabel, rowCount, totalEarnings}}
   - Sends email report for date range

### Supabase RPC Calls
- Called via `supabase.from('table').select()` syntax

### Error Handling
- All errors caught in try/catch
- Error state set with message
- User shown error toast/message

---

## 📈 Aggregation & Pivot Logic

### technicianCards Computation

```typescript
const byTechnician = new Map<code, {
  code, name, rowCount, dayCount, totalIncome
}>

// Group assignments by technician_code
filteredAssignmentsWithIncome.forEach(row => {
  code = row.technician_code (normalized uppercase)
  Accumulate: rowCount, totalIncome (sum)
  Track unique dateKeys to compute dayCount
})

// Sort by totalIncome desc, then rowCount desc
```

### Pivot Report Computation

```typescript
const pivot = new Map<dateKey, Map<technicianCode, incomeAmount>>
const rowTotals = new Map<dateKey, totalIncome>
const colTotals = new Map<technicianCode, totalIncome>

// Group by date then technician
dataScopedRows.forEach(row => {
  dateKey = getIncomeDateKey(assignment, revenue)
  techCode = technician_code
  Accumulate income into pivot[dateKey][techCode]
  Update rowTotals[dateKey] += income
  Update colTotals[techCode] += income
})

grandTotal = sum of all incomes
```

---

## ⚠️ Edge Cases & Special Handling

### Missing Data
- No `invoice_date` → row excluded from custom date range
- No `reg_number` → shows "Unknown" or job card reference
- No `branch` → inferred from technician code pattern or marked "Unknown"
- No `fuel_type` → inferred from bay_no prefix or marked "Unknown"

### Null/Empty Handling
- Empty technician list → hide technician cards section
- No yesterday data → show "No completed jobs" message
- Invalid date format → show raw value or mark as error
- Negative amounts → treated as 0

### Status Normalization
```
'completed' → 'completed'
'hold' → 'hold'
'work inprocess' or blank → 'work_inprocess'
```

### Fuel Type Extraction from bay_no
```
"PV-01", "PV-*" → 'PV'
"EV-01", "EV-*" → 'EV'
Anything else → null/fallback
```

### Branch Inference from Technician Code
```
If code contains '3000840' or '500A840' → 'Sitapura'
If code contains '3001440' → 'Ajmer Road'
Otherwise → null/unknown
```

---

## 🔄 Event Handlers

### handleGenerateYesterdayReport()
1. Set `generatingReport = true`
2. Call `fetchYesterdayReportData(pvPct, evPct)`
3. Set `yesterdayReport` with result
4. Set `generatingReport = false`

### handleSendRangeReportEmail()
1. Check: both `fromDate` AND `toDate` required
2. Set `sendingReportEmail = true`
3. Call `sendTechnicianDailyEarningsTestEmail({runFromIst: fromDate, runToIst: toDate})`
4. Show success/error toast
5. Set `sendingReportEmail = false`

### downloadExcel() & downloadPivotExcel()
1. Prepare sheet data (array of arrays)
2. Create workbook via XLSX.utils
3. Set column widths
4. Write file to browser download

### Date Range Input Handlers
```typescript
// fromDate change: if > toDate, update toDate to match
setFromDate(v) { if (toDate && v && v > toDate) setToDate(v) }

// toDate change: if < fromDate, update fromDate to match
setToDate(v) { if (fromDate && v && v < fromDate) setFromDate(v) }
```

---

## 📝 Formatting Utilities

| Function | Input | Output | Example |
|----------|-------|--------|---------|
| `formatDateTime()` | ISO string | "15 Jun, 02:30" | "2026-06-15T02:30:00Z" → "15 Jun, 02:30" |
| `formatCurrency()` | number | "₹1,00,000.00" | 100000 → "₹1,00,000.00" |
| `statusLabel()` | string | "Completed"/"Hold"/"Work Inprocess" | "completed" → "Completed" |
| `statusPill()` | string | "g"/"w"/"b" (color code) | "completed" → "g" |
| `getBranchLabel()` | string | trimmed or "Unknown location" | "Sitapura PV" → "Sitapura PV" |
| `getFuelTypeLabel()` | string | "PV"/"EV" or "Unknown" | "PV" → "PV" |

---

## 🔗 Related Supabase Functions

- `technician-daily-earnings-report` (Edge Function)
  - Triggers email generation for date range
  - Uses similar logic to calculate earnings

---

## 💾 Constants

```typescript
const QUERY_PAGE_SIZE = 1000              // Pagination batch size
const DEFAULT_PV_SHARE_PERCENT = 20       // Default PV technician share
const DEFAULT_EV_SHARE_PERCENT = 25       // Default EV technician share
const UNKNOWN_FUEL_TYPE = 'Unknown'       // Fallback fuel type label
const UNKNOWN_LOCATION = 'Unknown location' // Fallback branch label
```

---

## 🎬 User Journey / Happy Path

1. **Page Load**
   - Display current month data (Period filter default)
   - Show all technician cards sorted by income
   - Show control bar with filters

2. **View by Branch**
   - Click branch button
   - UI re-filters to show only that branch
   - Technician cards update

3. **View Technician Details**
   - Click technician card
   - Show day-wise breakdown for that technician
   - Show drilled-down job card table

4. **View Yesterday Report**
   - Click "Yesterday" button
   - Modal shows yesterday's completed jobs
   - Download Excel or share on WhatsApp

5. **View Pivot Report**
   - Click "Pivot" button
   - Modal shows dates × technicians matrix
   - Download pivot Excel

6. **Custom Date Range (Admin)**
   - Set `fromDate` and `toDate` in Range input
   - Narrows results within primary period
   - Can send email report for this range

---

## 🚀 Performance Characteristics

- **Initial Load:** ~1-2 seconds (depends on data volume)
- **Pagination:** 1000 rows per query, loops until exhausted
- **Memoization:** Heavy use of `useMemo` for re-render optimization
- **Filtering:** O(n) filtering per scope pipeline step
- **Sorting:** O(n log n) for technician cards and day cards

---

## 📱 Responsive Design

- **Layout:** Flex-based, wraps at small sizes
- **Modal:** Responsive max-width, scrollable content
- **Table:** Sticky headers + horizontal scroll for data tables
- **Buttons:** Text + icon, responsive font sizes

---

## ⚙️ Configuration & Settings

### Date Range (Period) Filter
- **Default:** Current month (`currentMonthRange()`)
- **Options:** This Month, Last Month, This Week, Last 7 Days, Last 30 Days, Custom
- **Impact:** Primary data source scope

### Branch Filter
- **Dynamic:** Populated from available branches in data
- **Default:** 'all'
- **Reset Behavior:** Auto-resets if selection no longer available

### Fuel Type Filter
- **Dynamic:** Populated from portal types in filtered data
- **Default:** 'all'
- **Inference:** From `fuel_type` field or bay_no prefix
- **Reset Behavior:** Auto-resets if selection no longer available

### Share Percentages (Admin)
- **Edit:** Draft input fields with validation
- **Validation:** 0-100 range, numeric only
- **Apply:** Updates state and recalculates all income values
- **Persistence:** In-session only (not persisted to DB in current impl)

---

## 🔄 State Sync & Dependencies

### useEffect Hooks

1. **Data Load Trigger**
   ```typescript
   useEffect(() => void loadData(), [dateRange])
   ```
   - Refetch whenever `dateRange` changes

2. **Share Percent Validation**
   ```typescript
   useEffect(() => {
     if (parsed !== pvSharePercent) setDraftPvSharePercent(String(pvSharePercent))
   }, [draftPvSharePercent, pvSharePercent])
   ```
   - Sync draft with actual on mount

3. **Branch Filter Sync**
   ```typescript
   useEffect(() => {
     if (!branches.includes(branchFilter)) setBranchFilter('all')
   }, [branchFilter, branches])
   ```
   - Reset if selected branch disappears

4. **Fuel Type Filter Sync**
   ```typescript
   useEffect(() => {
     if (!fuelTypeOptions.includes(fuelTypeFilter)) setFuelTypeFilter('all')
   }, [fuelTypeFilter, fuelTypeOptions])
   ```
   - Reset if selected type disappears

5. **Technician Selection Sync**
   ```typescript
   useEffect(() => {
     if (!technicianCards.some(c => c.code === selectedTechnicianCode)) {
       setSelectedTechnicianCode('')
       setSelectedDayKey('')
     }
   }, [selectedTechnicianCode, technicianCards])
   ```
   - Reset if selected technician disappears

---

## 🎯 Key Invariants

1. **Date Range Filtering:** Custom range (fromDate/toDate) operates WITHIN primary period
2. **Technician Grouping:** Deduplicate by job_card_number, keep latest by timestamp
3. **Income Calculation:** Always uses current pvSharePercent and evSharePercent
4. **Pagination:** Must loop until batch < 1000 (not when batch.length < 1000)
5. **Nullable Fields:** All optional fields (reg_number, branch, fuel_type) have fallbacks
6. **Status Normalization:** Always normalize to lowercase for comparison

---

## 📜 Version History

| Date | Change | Author | Notes |
|------|--------|--------|-------|
| 2026-06-15 | Initial snapshot (PRE-REFACTOR) | System | Before invoice_date-only refactor |
| TBD | POST-REFACTOR snapshot | TBD | After invoice_date refactor complete |

---

## 🔍 Rollback Checklist

**If rollback needed:**

- [ ] Revert `getAssignmentDateKey()` to use fallback: `row.out_ts ?? row.assigned_at`
- [ ] Remove `invoice_date` field from `TechnicianAssignmentRow` type
- [ ] Restore `loadData()` query to filter by `assigned_at` (not `invoice_date`)
- [ ] Update `getIncomeDateKey()` priority to old order
- [ ] Test data loads and filters work correctly
- [ ] Verify pivot report dates are correct
- [ ] Confirm yesterday report uses correct date

**Testing Commands:**
```bash
npm run build  # Check for TypeScript errors
npm run test   # Run unit tests (if available)
```

---

**Last Reviewed:** 2026-06-15  
**Status:** Ready for Reference
