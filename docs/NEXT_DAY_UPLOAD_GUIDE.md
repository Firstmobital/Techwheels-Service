# Next-Day Upload Logic: Quick Start

## Problem You're Solving

**Current Issue:**
- Day 1: Upload VAS data → Records inserted ✓
- Day 2: Upload SAME data (updated) → Fails with duplicate error or appears twice ✗
- Result: Manual cleanup needed, data conflicts

**Solution:**
- Use **natural keys** + **UPSERT** logic (like `job_card_closed_data`)
- Apply to ALL tables: VAS, Invoice, Parts Order, etc.

---

## The 3 Key Components

### 1. Header Mapping with Aliases
**What:** Match flexible Excel column names to DB columns

```
Excel Column      →  DB Column
"JC #"            →  job_card_number
"Job Card Number" →  job_card_number
"Job Card #"      →  job_card_number
```

**How:** Use `mapXxxxHeaders()` function with alias lists
**Why:** Users have different Excel formats from different dealers

---

### 2. Date Fallback (For Next-Day Uploads)
**What:** Fill missing dates from related fields

```
If invoice_date is missing:
  Try: closed_date_time
  Else: created_date_time  
  Else: today's date
```

**Code:**
```typescript
applyDateFallback(row, {
  targetField: 'invoice_date',
  fallbackFields: ['closed_date_time', 'created_date_time'],
});
```

**Why:** Files uploaded Day 2 often missing some Day 1 fields

---

### 3. Upsert with Natural Keys
**What:** Update if record exists, insert if new

```
Natural Key = (job_card_number, branch, closed_date_time)

Day 1 Upload: (12345, Ajmer, 2026-05-27) → INSERT
Day 2 Upload: (12345, Ajmer, 2026-05-27) → UPDATE (same key)
Day 2 Upload: (12345, Ajmer, 2026-05-28) → INSERT (different key)
```

**Code:**
```typescript
await supabase.from('job_card_closed_data').upsert(rows, {
  onConflict: 'job_card_number,branch,closed_date_time',
});
```

**Why:** Allows Day 2 re-uploads without data conflicts

---

## Natural Keys Per Table

```
job_card_closed_data
  → (job_card_number, branch, closed_date_time)

service_vas_jc_data
  → (job_card_number, branch, sr_type)

service_invoice_data
  → (job_card_number, branch, invoice_date)

service_parts_order_data
  → (part_number, branch, order_date, source_row_hash)

service_parts_consumption_data
  → (part_number, branch, transaction_date, source_row_hash)

service_parts_stock_snapshot_data
  → (part_number, branch, portal, snapshot_date)
```

---

## Implementation in 3 Steps

### Step 1: Create Header Mapper
```typescript
// src/lib/vasColumnMapperV2.ts
const VAS_TABLE_SPECS = [
  {
    dbCol: 'job_card_number',
    required: true,
    aliases: ['Job Card #', 'JC #', 'Job Card Number'],
    type: 'text',
  },
  {
    dbCol: 'job_value',
    required: true,
    aliases: ['Job Value', 'Total Amount'],
    type: 'numeric',
  },
  // ... more columns
];

export function mapVasHeaders(excelHeaders: string[]): Record<string, string> {
  // Returns mapping like: { 'job_card_number': 'Job Card #', ... }
}
```

### Step 2: Add Date Fallback
```typescript
// In ImportPage.tsx, after building row:
applyDateFallback(row, {
  targetField: 'jc_closed_date_time',
  fallbackFields: ['created_date_time'],
});
```

### Step 3: Change to Upsert
```typescript
// Instead of:
totalInserted += await insertRowsInChunks(insertRows);

// Use:
const keyFields = ['job_card_number', 'branch', 'sr_type'].join(',');
totalInserted += await upsertOrInsertRows(insertRows, [keyFields]);
```

---

## Code Locations

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/vasColumnMapperV2.ts` | CREATE | Header mapping + parsing |
| `src/lib/invoiceColumnMapperV2.ts` | CREATE | Invoice-specific logic |
| `src/pages/ImportPage.tsx` (line 800) | ADD | Helper functions |
| `src/pages/ImportPage.tsx` (line 1006) | MODIFY | VAS table handling |
| `src/pages/ImportPage.tsx` (line 1210) | MODIFY | Invoice table handling |

---

## Testing (Quick Check)

### Day 1
1. Create `test_data.xlsx` with 5 records
2. Upload → See 5 rows inserted

### Day 2  
1. Modify 2 rows in same file (update amounts)
2. Add 3 new rows
3. Upload → See:
   - 5 total records (not 8)
   - 2 rows updated with new amounts
   - 3 new rows added

If you see 10 rows instead of 5, upsert isn't working.

---

## Real-World Example

**File 1 (Day 1):**
```
JC#   | Job Value | Closed Date  
12345 | 5000      | 2026-05-27
12346 | 8000      | 2026-05-27
12347 | 3000      | (missing)
```

**File 2 (Day 2 - Same 3 + 2 new):**
```
JC#   | Job Value | Closed Date   
12345 | 5500      | 2026-05-27   (UPDATED amount)
12346 | 8000      | 2026-05-27
12347 | 3000      | 2026-05-28   (Date filled)
12348 | 6000      | 2026-05-28   (NEW)
12349 | 4500      | 2026-05-28   (NEW)
```

**Result:**
- Record 12345: Amount updated 5000 → 5500
- Record 12346: Unchanged
- Record 12347: Date filled (2026-05-28)
- Record 12348: New
- Record 12349: New
- **Total: 5 records (not 8)**

---

## FAQ

**Q: How long does this take?**
A: ~2 hours per table × 5 tables = 10 hours total. Start with VAS (most critical).

**Q: Do existing records get deleted?**
A: No. Existing data stays, future uploads just update based on natural key.

**Q: What if the date is still missing after fallback?**
A: Falls back to today's date automatically. This is safe for operations data.

**Q: Can I test this without affecting production?**
A: Yes. Create test branch, deploy to staging, run test uploads.

**Q: Why not just delete old record before inserting?**
A: Because if upload fails mid-way, you lose all data. Upsert is atomic & safer.

---

## See Also

- [Full Implementation Guide](./UPLOAD_TEMPLATE_CODE.md)
- [Detailed Roadmap](./IMPLEMENTATION_ROADMAP.md)
- [Current Logic Reference](./UPLOAD_LOGIC_REFACTOR.md)
- Existing Code: [jcClosedColumnMapper.ts](../src/lib/jcClosedColumnMapper.ts)
