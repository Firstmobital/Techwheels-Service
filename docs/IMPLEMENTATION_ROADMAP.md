# Implementation Roadmap: Apply JC Closed Logic to All Tables

## PRIORITY ORDER (Do in this sequence)

### PRIORITY 1: service_vas_jc_data (VAS Revenue Data)
**Why First:** Already has employee lookup, just needs better validation
**Effort:** 2-3 hours
**Changes Needed:**
- [ ] Create `mapVasHeaders()` with all column aliases (currently uses generic mapping)
- [ ] Create `buildVasInsertRow()` to validate numeric/date fields
- [ ] Add numeric parsing for: `job_value`, `labour_revenue`, `spare_parts_revenue`
- [ ] Add date parsing for: `jc_closed_date_time`, `created_date_time`
- [ ] Add date fallback logic (if JC closed date missing, use created date or today)
- [ ] Update upsert strategy: use `[job_card_number, branch, sr_type]` as natural key
- [ ] Test: Upload VAS data Day 1, then re-upload same data Day 2 with updates

**Files to Create/Modify:**
- [ ] New: `src/lib/vasColumnMapperV2.ts` (or enhance existing)
- [ ] Modify: `src/pages/ImportPage.tsx` (lines 1006-1052)

---

### PRIORITY 2: service_invoice_data (Invoice Data)
**Why Second:** Most important for revenue reconciliation
**Effort:** 2 hours
**Changes Needed:**
- [ ] Create `mapInvoiceHeaders()` with column aliases
- [ ] Create `buildInvoiceInsertRow()` with numeric parsing
- [ ] Add numeric parsing for amounts
- [ ] Add date parsing and fallback (invoice_date → jc_closed_date → today)
- [ ] Add upsert strategy: `[job_card_number, branch, invoice_date]`
- [ ] Optional: Add employee lookup if `employee_code` column exists

**Files to Create/Modify:**
- [ ] New: `src/lib/invoiceColumnMapperV2.ts` (or enhance existing)
- [ ] Modify: `src/pages/ImportPage.tsx` (lines 1210-1270)

---

### PRIORITY 3: service_parts_order_data (Parts Order Data)
**Why Third:** Needs source_row_hash for exact dedup
**Effort:** 1.5 hours
**Changes Needed:**
- [ ] Already has `mapPartsOrderHeaders()` and parsing
- [ ] Enhance date fallback for `order_date` field
- [ ] Verify upsert with `source_row_hash`: `[part_number, branch, order_date, source_row_hash]`
- [ ] No employee lookup needed (parts don't have SA)

**Files to Modify:**
- [ ] Modify: `src/pages/ImportPage.tsx` (lines 1053-1150)
- [ ] Enhance: `src/lib/partsOrderColumnMapper.ts`

---

### PRIORITY 4: service_parts_consumption_data (Parts Used Data)
**Why Fourth:** Similar to Parts Order
**Effort:** 1.5 hours
**Changes Needed:**
- [ ] Already has basic mapping
- [ ] Add date fallback for `transaction_date`
- [ ] Add quantity validation parsing
- [ ] Add upsert with `source_row_hash`: `[part_number, branch, transaction_date, source_row_hash]`

**Files to Modify:**
- [ ] Modify: `src/pages/ImportPage.tsx` (lines 1270-1330)
- [ ] Enhance: `src/lib/partsConsumptionColumnMapper.ts`

---

### PRIORITY 5: service_parts_stock_snapshot_data (Inventory Snapshots)
**Why Last:** Least critical, snapshot-based
**Effort:** 1 hour
**Changes Needed:**
- [ ] Create header mapping with aliases
- [ ] Add quantity parsing
- [ ] Date fallback for `snapshot_date`
- [ ] Upsert with: `[part_number, branch, portal, snapshot_date]`

**Files to Create/Modify:**
- [ ] New: `src/lib/partsStockColumnMapper.ts`
- [ ] Modify: `src/pages/ImportPage.tsx` (lines 1330-1410)

---

## KEY CHANGES TO ImportPage.tsx

### Add Helper Functions at Top

```typescript
// After line 800, add these helper functions:

interface DateFallbackConfig {
  targetField: string;
  fallbackFields: string[];
}

function applyDateFallback(
  row: Record<string, unknown>,
  config: DateFallbackConfig,
): void {
  const currentValue = row[config.targetField];
  const hasValue = currentValue && String(currentValue).trim() !== '';

  if (hasValue) return;

  for (const fallbackField of config.fallbackFields) {
    const fallbackValue = row[fallbackField];
    if (fallbackValue && String(fallbackValue).trim() !== '') {
      row[config.targetField] = fallbackValue;
      return;
    }
  }

  row[config.targetField] = new Date().toISOString().split('T')[0];
}

const UPSERT_CONFIG = {
  service_vas_jc_data: ['job_card_number', 'branch', 'sr_type'],
  service_invoice_data: ['job_card_number', 'branch', 'invoice_date'],
  service_parts_order_data: ['part_number', 'branch', 'order_date', 'source_row_hash'],
  service_parts_consumption_data: ['part_number', 'branch', 'transaction_date', 'source_row_hash'],
  service_parts_stock_snapshot_data: ['part_number', 'branch', 'portal', 'snapshot_date'],
};
```

### Update Each Table Block

**For VAS (around line 1006):**
```typescript
if (isVasTable && vasHeaderMapping) {
  const parseErrors: VasParseError[] = [];
  const insertRows: Record<string, unknown>[] = [];

  for (let rowIdx = 0; rowIdx < rawRows.length; rowIdx++) {
    const { row, errors } = buildVasInsertRow(
      rawRows[rowIdx],
      branch,
      'PV', // or get from UI
      vasHeaderMapping,
      rowIdx + 2,
    );

    if (errors.length > 0) {
      parseErrors.push(...errors);
      continue;
    }

    if (row) {
      // NEW: Apply date fallback for next-day uploads
      applyDateFallback(row, {
        targetField: 'jc_closed_date_time',
        fallbackFields: ['created_date_time'],
      });

      // Employee lookup...
      if (employeeLookup) {
        const matched = resolveEmployeeForSr(row.sr_assigned_to, employeeLookup);
        row.employee_code = matched.employeeCode;
        row.branch = matched.employeeBranch ?? branch;
      }

      insertRows.push(row);
    }
  }

  if (parseErrors.length > 0) {
    throw new Error(
      `VAS Data parse errors:\n${formatVasParseErrors(parseErrors.slice(0, 10))}`,
    );
  }

  // NEW: Use upsert instead of plain insert
  const keyFields = UPSERT_CONFIG['service_vas_jc_data'].join(',');
  totalInserted += await upsertOrInsertRows(
    insertRows,
    [keyFields, 'job_card_number'], // Fallback to JC number only
  );
}
```

---

## Testing Strategy

### Test Case 1: Day 1 Upload
1. Create file: `vas_day1.xlsx` with 10 VAS records
2. Upload to ImportPage
3. Verify: All 10 records inserted, `import_metadata` updated
4. Note: Record a specific JC# with incomplete data (e.g., missing revenue)

### Test Case 2: Day 2 Re-upload (Same Data + Updates)
1. Create file: `vas_day2.xlsx` with:
   - Same 10 records with **updated** revenue amounts
   - 5 new records
2. Upload same file to ImportPage
3. Verify:
   - [ ] Old 10 records **updated** (not duplicated)
   - [ ] New 5 records added
   - [ ] Total: 15 records (not 20)
   - [ ] Revenue values are from Day 2 file

### Test Case 3: Partial Day 2 Upload
1. Create file with only 3 of the Day 1 records + updated data
2. Upload
3. Verify: Original 10 records exist, but 3 are updated, 7 unchanged

### Test Case 4: Date Fallback
1. Create file where some rows have **no** `jc_closed_date_time` but have `created_date_time`
2. Upload
3. Verify: Missing dates filled from fallback fields

---

## Example: Before vs After

### BEFORE (Current Behavior)
```
Day 1: Upload JC# 12345 → Inserted ✓
Day 2: Upload JC# 12345 (updated) → Duplicate Error ✗ OR data appears twice ✗
Result: Data conflict, manual cleanup needed
```

### AFTER (With Natural Keys + Upsert)
```
Day 1: Upload JC# 12345 (job_card_number, branch, closed_date_time) → Inserted ✓
Day 2: Upload JC# 12345 (same natural key) → Updated ✓
Result: Latest data automatically preserved, no conflicts
```

---

## Validation Checklist

- [ ] Header mapping works for all column variations
- [ ] Numeric fields parse correctly (strip Rs., commas)
- [ ] Date fields parse and convert to ISO format
- [ ] Date fallback applies when fields missing
- [ ] Employee lookup still works (for VAS/Invoice)
- [ ] Upsert uses correct natural key
- [ ] Duplicate rows don't appear on re-upload
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] Tests pass: Manual day 1 + day 2 uploads

---

## Migration Path (For Existing Data)

Once new logic deployed, existing records:
- Remain unaffected (no data loss)
- Future uploads will update based on natural key
- Optional: One-time cleanup of true duplicates if any

---

## Questions?

1. **Q: What if user uploads on Day 3 with different `closed_date_time`?**
   A: It will be a different natural key, so it inserts as new record. This is correct behavior (different date = different event).

2. **Q: What if employee lookup returns null?**
   A: Falls back to `sr_assigned_to` field, same as current behavior. Logs mapping issue for reconciliation.

3. **Q: What about invoice_date being required for JC Closed but optional for Invoice?**
   A: Date fallback handles both - if truly missing, uses today's date as last resort.

4. **Q: Why include `branch` in upsert key?**
   A: Because same JC can exist in multiple branches (Ajmer Road, Sitapura PV, Sitapura EV). Each is distinct.

5. **Q: When to use `source_row_hash` in parts tables?**
   A: When same part can be ordered multiple times in same date. Hash ensures exact row match.
