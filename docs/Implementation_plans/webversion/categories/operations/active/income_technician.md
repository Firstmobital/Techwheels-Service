# Implementation Plan: Income Technician Date Filter Refactor

**Plan ID:** income_technician  
**Created:** 2026-06-15  
**Objective:** Replace technician earnings date range filter to use authoritative `job_card_closed_data.invoice_date` column instead of fallback logic from `technician_assignments`.

---

## 📋 Schema Authority

**Authoritative Source:** `/local_folder/backups/full_database.sql` (or chunks mirror)

### Schema Constraints & FK Reality

**IMPORTANT:** `technician_assignments` and `job_card_closed_data` are **NOT linked by foreign key** in the schema.
- Both tables have `job_card_number` field (text, not constrained)
- No FK constraint between them
- This prevents using Supabase `.select()` join syntax

**Solution:** Use separate queries + in-app mapping (see Change 3 above)

### Source Tables

#### 1. **job_card_closed_data**
- **Column Used:** `invoice_date` (type: `date`)
- **Source:** Migrated from JC Revenue data, represents invoice billing date
- **Authority:** Primary source of truth for job card financial records
- **Constraint:** Unique on `(job_card_number, branch)`

#### 2. **technician_assignments**
- **Relation:** Links technicians to job cards via `job_card_number`
- **Current Columns:** `assigned_at`, `out_ts` (being phased out for date filtering)
- **New Role:** Only provides technician income assignment data

---

## 🎯 Changes Required

### 1. Data Retrieval Strategy

| Aspect | Old Approach | New Approach |
|--------|-------------|------------|
| **Primary Date Source** | `technician_assignments.out_ts` (with fallback to `assigned_at`) | `job_card_closed_data.invoice_date` (no fallback) |
| **Join Logic** | No join; date from same table | JOIN `technician_assignments` → `job_card_closed_data` on `job_card_number` |
| **Date Range Filter** | Applied to `assigned_at`, `out_ts` | Applied to `invoice_date` after join |
| **NULL Handling** | Rows with missing dates filtered out | Rows with NULL `invoice_date` excluded |

### 2. Frontend Code Changes

**File:** [src/pages/TechnicianPage.tsx](src/pages/TechnicianPage.tsx)

#### Change 1: Update `getAssignmentDateKey()` Function
**Location:** [Line 240-249](src/pages/TechnicianPage.tsx#L240-L249)

**Current Logic:**
```typescript
function getAssignmentDateKey(row: TechnicianAssignmentRow): string | null {
  const dateSource = row.out_ts ?? row.assigned_at  // Fallback logic
  if (!dateSource) return null
  // ... format as YYYY-MM-DD in IST
}
```

**New Logic:**
```typescript
function getAssignmentDateKey(row: TechnicianAssignmentRow): string | null {
  const dateSource = row.invoice_date  // Only invoice_date, no fallback
  if (!dateSource) return null
  // ... format as YYYY-MM-DD in IST
}
```

**Implication:** `TechnicianAssignmentRow` type must now include `invoice_date: string | null` field.

#### Change 2: Update Type Definition
**Location:** [Line 10-26](src/pages/TechnicianPage.tsx#L10-L26)

Add to `TechnicianAssignmentRow`:
```typescript
invoice_date?: string | null  // From job_card_closed_data.invoice_date
```

#### Change 3: Update Data Fetch Query
**Location:** [Line 461-530](src/pages/TechnicianPage.tsx#L461-L530) in `loadData()` function

**Schema Reality:**
```
technician_assignments.job_card_number ←→ job_card_closed_data.job_card_number
```
⚠️ **NO FOREIGN KEY CONSTRAINT EXISTS** between these tables. Supabase Realtime requires explicit FK for joins, so we cannot use `.select()` join syntax.

**Solution: Separate Queries + In-App Mapping**

1. **Fetch technician_assignments** (paginated, 1000 rows/batch)
   ```typescript
   let assignQuery = supabase
     .from('technician_assignments')
     .select('*')
     .order('assigned_at', { ascending: false })
     .range(from, from + 1000 - 1)
   ```

2. **Build list of job_card_numbers from assignments**
   ```typescript
   const jcNumbers = Array.from(new Set(
     assignmentRowsRaw
       .map((row) => normalizeJobCardNumber(row.job_card_number))
       .filter(Boolean)
   ))
   ```

3. **Fetch invoice_date from job_card_closed_data** (single query, no pagination needed)
   ```typescript
   const invoiceRes = await supabase
     .from('job_card_closed_data')
     .select('job_card_number, invoice_date')
     .in('job_card_number', jcNumbers)
   ```

4. **Build invoiceDateMap** (job_card_number → invoice_date)
   ```typescript
   const invoiceDateMap = new Map<string, string | null>()
   invoiceRes.data.forEach(row => {
     const key = normalizeJobCardNumber(row.job_card_number)
     invoiceDateMap.set(key, row.invoice_date ?? null)
   })
   ```

5. **Map invoice_date to assignments + filter by date range**
   ```typescript
   const assignments = assignmentRowsRaw
     .map(row => ({
       ...row,
       invoice_date: invoiceDateMap.get(normalizeJobCardNumber(row.job_card_number)) ?? null
     }))
     .filter(row => {
       if (!row.invoice_date) return false
       if (row.invoice_date < dateRange.from) return false
       if (row.invoice_date > dateRange.to) return false
       return true
     })
   ```

**Advantages of Separate Queries:**
- ✅ No FK constraint required
- ✅ Efficient: Single pass through invoice_date data
- ✅ Works with Supabase (no schema modifications)
- ✅ Application-layer filtering is more flexible
- ✅ Reduces payload size (only need job_card_number + invoice_date)

---

## 📊 Implementation Phases

### Phase 1: Schema Verification ✅
- [x] Confirm `job_card_closed_data.invoice_date` exists in authoritative dump
- [x] Verify column type is `date` (not timestamp)
- [x] Confirm FK relationship via `job_card_number` is available

### Phase 2: Code Refactor
- [ ] Update `TechnicianAssignmentRow` type to include `invoice_date`
- [ ] Refactor `getAssignmentDateKey()` to use only `invoice_date`
- [ ] Update query in `loadData()` to fetch `invoice_date` via join
- [ ] Add filtering logic in application layer for date range

### Phase 3: Testing & Validation
- [ ] Verify technician cards render correctly with new date source
- [ ] Confirm date range filter works (This Month, Last Month, Custom)
- [ ] Validate earnings totals align with expected values
- [ ] Check for null/missing `invoice_date` edge cases

### Phase 4: Deployment
- [ ] Merge to production
- [ ] Monitor logs for any date-related anomalies
- [ ] Collect baseline metrics for 3 days

---

## ⚠️ Constraints & Governance

- **No Fallback:** Use ONLY `invoice_date`. If NULL, exclude row (no fallback to `assigned_at` or `out_ts`).
- **No Invention:** Never invent columns, tables, or functions not in authoritative dump.
- **Authority Lock:** If conflicts arise, prefer `local_folder/backups/full_database.sql` (chunked access if needed).
- **Schema Guard:** Before any query change, verify in authoritative source first.

---

## � Reference Documentation

**Rollback Reference:** See [income_technician_rollback_snapshot.md](income_technician_rollback_snapshot.md) for complete PRE-REFACTOR business logic, UX, state management, calculations, and user journeys. Use this if rollback is needed.
**Snapshot Includes:**
- Full type definitions & state variables (15+ states)
- Complete data fetching & enrichment logic
- All calculation engines (income, date keys, aggregations)
- Data scoping pipeline (4-step filtering)
- All UI components & interactive features
- API integrations & error handling
- Edge cases & special handling
- Complete user journeys & happy paths
- Performance characteristics
- Rollback checklist with test commands

**Related Records:**
- **Authoritative Dump:** `/local_folder/backups/full_database.sql` (or chunks mirror)
- **Mobile Variant:** `mobile/src/lib/reportQueries.ts` (may need same refactor)
- **Integration Tests:** Pivot report, email generation, excel exports
---

**Status:** Ready for Phase 2 (Code Refactor)  
**Reviewer:** Pending  
**Last Updated:** 2026-06-15

