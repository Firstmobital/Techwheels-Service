# Upload Logic Summary: Next-Day Re-uploads

## TL;DR

**Problem:** When you upload the same data on Day 2 (with updates), it either fails with duplicate error or appears as duplicate rows.

**Solution:** Use UPSERT with natural keys instead of INSERT.

**Result:** Day 2 re-uploads automatically update existing records instead of creating duplicates.

---

## The 3 Fixes

### Fix 1: Header Mapping
**Before:** Hardcoded column names
**After:** Match flexible column variations (e.g., "JC #", "Job Card Number", "JC #")
**Effort:** Already done for job_card_closed_data ✓
**Todo:** Apply same pattern to VAS, Invoice, Parts tables

### Fix 2: Date Fallback  
**Before:** Fails if some dates missing
**After:** Fill from related fields or use today's date
**Code:** `applyDateFallback(row, { targetField: 'invoice_date', fallbackFields: ['closed_date_time'] })`

### Fix 3: UPSERT Strategy
**Before:** `INSERT` - fails on duplicate
**After:** `UPSERT` - update if exists, insert if new
**Code:** `supabase.from(table).upsert(rows, { onConflict: 'job_card_number,branch,closed_date_time' })`

---

## Which Table Gets Which Fix?

| Table | Header Mapping | Date Fallback | UPSERT |
|-------|---|---|---|
| job_card_closed_data | ✓ Done | ✓ Done | ✓ Done |
| service_vas_jc_data | ✗ TODO | ✗ TODO | ✗ TODO |
| service_invoice_data | ✗ TODO | ✗ TODO | ✗ TODO |
| service_parts_order_data | ~ Partial | ✗ TODO | ~ Partial |
| service_parts_consumption_data | ~ Partial | ✗ TODO | ✗ TODO |
| service_parts_stock_snapshot_data | ✗ TODO | ✗ TODO | ✗ TODO |

---

## Implementation Steps

### Step 1: Add Helper Functions (5 min)
Add to `src/pages/ImportPage.tsx` around line 800:
```typescript
function applyDateFallback(row, { targetField, fallbackFields }) {
  // Fill missing dates from fallback fields
}

const UPSERT_CONFIG = {
  service_vas_jc_data: [['job_card_number', 'branch', 'sr_type'], ...],
  // ... other tables
}
```

### Step 2: Update Each Table Handler (5 min each)
For each table section (VAS, Invoice, Parts):
- Add: `applyDateFallback(row, config)`
- Change: `INSERT` → `UPSERT` with natural keys

### Step 3: Test (15 min)
- Day 1: Upload 5 records → Verify 5 inserted
- Day 2: Upload same 5 + 2 updates → Verify 5 total, 2 updated
- Day 2: Upload subset (3 of 5) with updates → Verify 5 total, 3 updated

---

## Code Files to Read/Modify

```
Already Done:
  src/lib/jcClosedColumnMapper.ts      ← Reference implementation

Need Header Mapping:
  src/lib/vasColumnMapper.ts           ← Create mapVasHeaders()
  src/lib/invoiceColumnMapper.ts       ← Enhance existing
  src/lib/partsOrderColumnMapper.ts    ← Already started
  src/lib/partsConsumptionColumnMapper.ts  ← Already started

Main Changes:
  src/pages/ImportPage.tsx             ← Add helpers + update 5 table handlers
```

---

## Natural Keys (Critical!)

Each table's unique identifier:

```
job_card_closed_data
  (job_card_number, branch, closed_date_time)
  
service_vas_jc_data
  (job_card_number, branch, sr_type)
  
service_invoice_data
  (job_card_number, branch, invoice_date)
  
service_parts_order_data
  (part_number, branch, order_date, source_row_hash)
  
service_parts_consumption_data
  (part_number, branch, transaction_date, source_row_hash)
  
service_parts_stock_snapshot_data
  (part_number, branch, portal, snapshot_date)
```

**These are the keys for UPSERT. Must match database constraints.**

---

## Example: VAS Table

### Current Behavior
```typescript
// Day 1: Insert
INSERT INTO service_vas_jc_data (job_card_number, sr_type, job_value, ...)
VALUES (12345, 'General Service', 5000, ...)
// Result: 1 row

// Day 2: Same data with job_value updated to 5500
INSERT INTO service_vas_jc_data (job_card_number, sr_type, job_value, ...)
VALUES (12345, 'General Service', 5500, ...)
// Result: Error (duplicate) OR 2 rows
```

### Fixed Behavior
```typescript
// Day 1: Upsert (on conflict do nothing → acts like insert)
UPSERT INTO service_vas_jc_data
  ON CONFLICT (job_card_number, branch, sr_type)
  DO UPDATE SET job_value = 5000
// Result: 1 row

// Day 2: Upsert (on conflict update)
UPSERT INTO service_vas_jc_data
  ON CONFLICT (job_card_number, branch, sr_type)
  DO UPDATE SET job_value = 5500  ← Updated!
// Result: 1 row with new value
```

---

## Documentation Files Created

1. **NEXT_DAY_UPLOAD_GUIDE.md** ← Start here
   - Quick overview
   - 3 key components
   - Real-world example

2. **COPY_PASTE_CODE.md** ← Implementation guide
   - Ready-to-use code
   - Where to place each part
   - Validation checklist

3. **IMPLEMENTATION_ROADMAP.md** ← Project planning
   - Priority order
   - Effort estimates
   - Testing strategy

4. **UPLOAD_TEMPLATE_CODE.md** ← Reference
   - Generic template
   - Pattern to follow
   - Best practices

5. **UPLOAD_LOGIC_REFACTOR.md** ← Deep dive
   - Current vs. fixed behavior
   - Why each change needed
   - Architecture explanation

---

## Timeline

| Task | Time | Priority |
|------|------|----------|
| Apply to VAS | 2h | HIGH |
| Apply to Invoice | 2h | HIGH |
| Apply to Parts Order | 1.5h | MEDIUM |
| Apply to Parts Consumption | 1.5h | MEDIUM |
| Apply to Parts Stock | 1h | LOW |
| **Total** | **~8 hours** | - |

**Recommended:** Start with VAS (most used), then Invoice.

---

## Key Principles

1. **Natural Key = Identity**
   - Same natural key → Same record → UPDATE on re-upload
   - Different natural key → Different record → INSERT

2. **Date Fallback = Safety**
   - Missing dates don't break upload
   - Uses sensible defaults (related date or today)

3. **Upsert = No Duplicates**
   - No need to delete old records
   - No data loss if upload fails mid-way
   - Atomic operation (all or nothing)

4. **Branch in Key = Multi-location Safe**
   - Same JC can exist in multiple branches
   - Each branch gets own record
   - Prevents cross-branch confusion

5. **source_row_hash = Exact Dedup**
   - For parts: Same part, same date, but different row
   - Hash ensures exact row identification
   - Prevents partial duplicate issues

---

## What Happens After Implementation

### For End Users
- Day 1: Upload file → Data appears ✓
- Day 2: Upload updated file → New data replaces old ✓
- No errors, no duplicates, no manual cleanup needed ✓

### For Data Quality
- Same JC never appears twice (if same natural key)
- Latest data from Day 2 overrides Day 1
- Historical changes can be tracked (if audit table created)

### For Developers
- Consistent pattern across all tables
- Easier to add new tables in future
- Less customer support for "duplicate" issues

---

## Rollback Plan

If something breaks:
1. This doesn't affect existing data (only future uploads)
2. Simply don't use UPSERT, revert to INSERT
3. Existing records unaffected

---

## Next Steps

1. **Read:** [NEXT_DAY_UPLOAD_GUIDE.md](./NEXT_DAY_UPLOAD_GUIDE.md)
2. **Copy:** Code from [COPY_PASTE_CODE.md](./COPY_PASTE_CODE.md)
3. **Plan:** Timeline from [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)
4. **Test:** Day 1 + Day 2 upload scenario
5. **Deploy:** To production

---

## Questions Answered

**Q: What if I don't implement this?**
A: Day 2 uploads fail or create duplicates. Manual cleanup required.

**Q: Do I need to change all tables at once?**
A: No. Start with VAS (most important), then Invoice. Other tables can wait.

**Q: Will existing data break?**
A: No. Only affects future uploads. Existing records stay unchanged.

**Q: How do I test this?**
A: Upload same file on Day 1, then again on Day 2 with different amounts. Should update, not duplicate.

**Q: What if the natural key doesn't exist in database?**
A: Upsert falls back to plain INSERT. Still better than current behavior.

---

## Reference: Current Logic Location

All existing logic in:
- `src/lib/jcClosedColumnMapper.ts` ← Copy this pattern
- `src/pages/ImportPage.tsx` ← Where to make changes
- Line 1150-1210 ← Date handling example
- Line 929-960 ← Current upsert attempt

---

## Success Criteria

- [ ] Day 1 upload: 5 records inserted
- [ ] Day 2 re-upload: 5 records total (not 10)
- [ ] Record amounts updated from Day 2 file
- [ ] No error messages
- [ ] Database has correct final data
- [ ] `npm run build` passes
- [ ] No TypeScript errors

✓ All criteria met = Ready for production
