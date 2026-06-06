# Validation: Completed Cases with Zero Earnings

## Summary
When technician cases show "Completed" but earnings are $0.00, the root cause is that `job_card_closed_data.final_labour_amount` is either NULL, zero, or missing a matching record.

---

## Authoritative Schema References

### Table: `technician_assignments`
**Source**: `local_folder/backups/full_database.sql`

```sql
CREATE TABLE public.technician_assignments (
    id bigint NOT NULL,
    job_card_number text NOT NULL,
    technician_code text NOT NULL,
    technician_name text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bay_no text,
    work_status text DEFAULT 'work_inprocess'::text NOT NULL,
    out_ts timestamp with time zone,
    remark text,
    time_diff interval GENERATED ALWAYS AS (
        CASE WHEN (out_ts IS NULL) THEN NULL::interval
             ELSE (out_ts - assigned_at) END
    ) STORED,
    CONSTRAINT technician_assignments_work_status_check 
        CHECK (lower(btrim(work_status)) = ANY (ARRAY['work_inprocess'::text, 'hold'::text, 'completed'::text]))
);
```

**Key Facts**:
- `work_status` must be in: `'work_inprocess'`, `'hold'`, or `'completed'`
- `out_ts` is auto-set when work_status = `'completed'`
- When completed, system expects matching record in `job_card_closed_data`

---

### Table: `job_card_closed_data`
**Source**: `local_folder/backups/full_database.sql`

```sql
CREATE TABLE public.job_card_closed_data (
    id bigint NOT NULL,
    branch text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_card_number text,
    sr_type text,
    chassis_number text,
    final_labour_amount numeric,           -- KEY: This drives earnings
    final_spares_amount numeric,
    total_invoice_amount numeric,
    parent_product_line text,
    product_line text,
    created_date_time timestamp with time zone,
    closed_date_time timestamp with time zone,  -- KEY: Groups earnings by date
    first_name text,
    last_name text,
    sr_assigned_to text,
    vehicle_registration_number text,
    vehicle_sale_date date,
    account_phone_number text,
    employee_code text,
    kms_run numeric,
    last_service_km numeric,
    last_service_date date,
    lubs_revenue numeric DEFAULT 0,
    "Invoice_date" date,                   -- Alt date field
    merged_job_cards text[] DEFAULT '{}'::text[],
    invoice_date date,
    UNIQUE (job_card_number, branch)
);
```

**Key Facts**:
- Populated via PSF Revenue Report import (jcClosedColumnMapper.ts)
- `final_labour_amount` is REQUIRED in import spec (marked as `required: true`)
- `closed_date_time` is REQUIRED in import spec
- Must have either `closed_date_time` OR `invoice_date` to group earnings by day

---

## Root Cause: Why Earnings = $0.00

The earnings calculation in [TechnicianPage.tsx](src/pages/TechnicianPage.tsx#L280-L330) is:

```typescript
const revenueRes = await supabase
  .from('job_card_closed_data')
  .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
  .in('job_card_number', jcNumbers)

// For each completed assignment
const gross = Number(revenue.final_labour_amount ?? 0)
if (!Number.isFinite(gross) || gross <= 0) return  // ← SKIP IF 0 OR NULL

const dateKeySource = revenue.closed_date_time ?? revenue.invoice_date
if (!dateKeySource) return  // ← SKIP IF BOTH DATES NULL

const netBeforeShare = gross / 1.18
const shareRate = fuel === 'EV' ? 0.25 : 0.2
const technicianIncome = netBeforeShare * shareRate
```

**Earnings = $0.00 occurs when**:

| Condition | Impact |
|-----------|--------|
| No matching `job_card_closed_data` record for that job_card_number | Assignment is skipped entirely |
| `final_labour_amount IS NULL` | Treated as 0, assignment skipped |
| `final_labour_amount = 0` | Skipped (check fails: `gross <= 0`) |
| `closed_date_time IS NULL AND invoice_date IS NULL` | Cannot group by date, assignment skipped |
| Incomplete import (staging table only) | Record doesn't exist in final table |

---

## Validation Queries

### ❌ Query 1: Find Completed Assignments with NO Revenue Match

```sql
-- Cases marked completed but no final_labour_amount recorded
SELECT 
  ta.job_card_number,
  ta.technician_code,
  ta.technician_name,
  ta.assigned_at,
  ta.out_ts,
  'NO_REVENUE_RECORD' as issue
FROM public.technician_assignments ta
WHERE ta.work_status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.job_card_closed_data jc
    WHERE jc.job_card_number = ta.job_card_number
  )
ORDER BY ta.assigned_at DESC;
```

### ❌ Query 2: Completed with Revenue = NULL or ZERO

```sql
-- Cases completed but labour amount is missing/zero
SELECT 
  ta.job_card_number,
  ta.technician_code,
  ta.technician_name,
  ta.out_ts,
  jc.final_labour_amount,
  jc.closed_date_time,
  jc.invoice_date,
  CASE 
    WHEN jc.final_labour_amount IS NULL THEN 'LABOUR_NULL'
    WHEN jc.final_labour_amount = 0 THEN 'LABOUR_ZERO'
    WHEN jc.closed_date_time IS NULL AND jc.invoice_date IS NULL THEN 'DATE_NULL'
    ELSE 'UNKNOWN'
  END as issue
FROM public.technician_assignments ta
LEFT JOIN public.job_card_closed_data jc 
  ON jc.job_card_number = ta.job_card_number
WHERE ta.work_status = 'completed'
  AND (
    jc.final_labour_amount IS NULL 
    OR jc.final_labour_amount = 0
    OR (jc.closed_date_time IS NULL AND jc.invoice_date IS NULL)
  )
ORDER BY ta.out_ts DESC;
```

### ✓ Query 3: Completed with Valid Revenue (Should Show Earnings)

```sql
-- This is the subset that SHOULD have earnings
SELECT 
  ta.job_card_number,
  ta.technician_code,
  ta.technician_name,
  ta.bay_no,
  ta.out_ts,
  jc.final_labour_amount,
  jc.closed_date_time,
  CASE 
    WHEN ta.bay_no ILIKE '%EV%' THEN 0.25
    ELSE 0.2
  END as share_rate,
  (jc.final_labour_amount / 1.18) * 
    CASE WHEN ta.bay_no ILIKE '%EV%' THEN 0.25 ELSE 0.2 END as estimated_income
FROM public.technician_assignments ta
JOIN public.job_card_closed_data jc 
  ON jc.job_card_number = ta.job_card_number
WHERE ta.work_status = 'completed'
  AND jc.final_labour_amount > 0
  AND (jc.closed_date_time IS NOT NULL OR jc.invoice_date IS NOT NULL)
ORDER BY ta.out_ts DESC;
```

---

## Required Fields for Valid Earnings

For a completed case to generate earnings, ALL of these must be true:

| Field | Table | Requirement | Notes |
|-------|-------|-------------|-------|
| `job_card_number` | technician_assignments | ✓ Exists | Primary lookup key |
| `work_status` | technician_assignments | = 'completed' | Workflow state |
| Match in job_card_closed_data | n/a | ✓ Exists | By job_card_number |
| `final_labour_amount` | job_card_closed_data | > 0 | Must be positive number |
| `closed_date_time` OR `invoice_date` | job_card_closed_data | ✓ Not NULL | Needed to group by date |
| `bay_no` | technician_assignments | Optional | Determines share rate (EV=25%, PV=20%) |

---

## Import Specification

**Column mapping from source**: [src/lib/jcClosedColumnMapper.ts](src/lib/jcClosedColumnMapper.ts)

| Database Column | Required? | Source Aliases |
|-----------------|-----------|-----------------|
| `final_labour_amount` | **YES** | 'Final Labour Amount', 'Labour Revenue' |
| `closed_date_time` | **YES** | 'Closed Date Time', 'Job Card Closed Date' |
| `job_card_number` | **YES** | 'Job Card #', 'JC #' |
| `invoice_date` | NO | 'Invoice Date' |

**Common Import Failures**:
1. ❌ Excel column named "Labor Amount" → Not matched (strict alias matching)
2. ❌ `closed_date_time = NULL` → Row accepted but unusable (import not strict on optional)
3. ❌ CSV encoding issue → Silent parse failure, NULL values
4. ❌ Stale deduplication signatures → Trigger blocks legitimate re-imports

---

## Deduplication & Import History

**Migration**: [scripts/10_fix_jc_closed_import_signatures.sql](scripts/10_fix_jc_closed_import_signatures.sql)

If imports fail silently:
1. Check `public.job_card_closed_data_import_signatures` table
2. Run deduplication fix if stale signatures exist
3. Clear table: `TRUNCATE TABLE public.job_card_closed_data_import_signatures`
4. Re-import from PSF Revenue Report

---

## Action Items to Fix

### 1️⃣ Verify Data State
Use Query 1 & 2 above to identify which cases are problematic

### 2️⃣ Check Import Status
- Go to **Import Page** → **PSF Revenue Report** tab
- Review last upload date and success/failure count
- Check mapping issues if any

### 3️⃣ Fix Stale Data
If **Query 1** shows many missing records:
- Run [scripts/10_fix_jc_closed_import_signatures.sql](scripts/10_fix_jc_closed_import_signatures.sql)
- Re-upload PSF Revenue export

### 4️⃣ Backfill if Needed
- Use [scripts/11_backfill_reception_from_jc_closed_20260601_05.sql](scripts/11_backfill_reception_from_jc_closed_20260601_05.sql) as template
- Create custom backfill with date range for affected cases

---

## Summary Table

| Issue | Evidence | Fix |
|-------|----------|-----|
| Completed but no job_card_closed_data | Query 1 returns rows | Import missing PSF Revenue data |
| Completed but final_labour_amount = NULL | Query 2 returns rows | Check import mapping, re-import |
| Completed but final_labour_amount = 0 | Query 2 returns rows | Verify source Excel has labour amounts |
| No date (closed_date_time & invoice_date both NULL) | Query 2 returns rows | Update job_card_closed_data with invoice dates |
| Data exists but Query 3 still shows $0 | Check RLS policies | Verify technician has 'technician' module access |

---

**Authority**: Authoritative schema from `local_folder/backups/full_database.sql` (never downgrades to older snapshots)
