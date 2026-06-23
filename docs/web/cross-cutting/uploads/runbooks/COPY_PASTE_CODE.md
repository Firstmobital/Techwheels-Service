# Copy-Paste Implementation Code

## PART 1: Add Helper Functions to ImportPage.tsx (Around Line 800)

```typescript
// ─── Date Fallback Helper ─────────────────────────────────────────────────────

interface DateFallbackConfig {
  targetField: string
  fallbackFields: string[]
}

function applyDateFallback(
  row: Record<string, unknown>,
  config: DateFallbackConfig,
): void {
  const currentValue = row[config.targetField]
  const hasValue = currentValue && String(currentValue).trim() !== ''

  if (hasValue) return

  // Try each fallback field in order
  for (const fallbackField of config.fallbackFields) {
    const fallbackValue = row[fallbackField]
    if (fallbackValue && String(fallbackValue).trim() !== '') {
      row[config.targetField] = fallbackValue
      return
    }
  }

  // Final fallback: today's date (YYYY-MM-DD format)
  row[config.targetField] = new Date().toISOString().split('T')[0]
}

// ─── Upsert Configuration ─────────────────────────────────────────────────────

const UPSERT_CONFIG: Record<string, string[][]> = {
  service_vas_jc_data: [
    ['job_card_number', 'branch', 'sr_type'],
    ['job_card_number', 'sr_type'],
    ['job_card_number'],
  ],
  service_invoice_data: [
    ['job_card_number', 'branch', 'invoice_date'],
    ['job_card_number', 'invoice_date'],
    ['job_card_number'],
  ],
  service_parts_order_data: [
    ['part_number', 'branch', 'order_date', 'source_row_hash'],
    ['part_number', 'branch', 'order_date'],
    ['part_number', 'branch'],
  ],
  service_parts_consumption_data: [
    ['part_number', 'branch', 'transaction_date', 'source_row_hash'],
    ['part_number', 'branch', 'transaction_date'],
    ['part_number', 'branch'],
  ],
  service_parts_stock_snapshot_data: [
    ['part_number', 'branch', 'portal', 'snapshot_date'],
    ['part_number', 'branch', 'snapshot_date'],
    ['part_number', 'branch'],
  ],
}
```

---

## PART 2: Update VAS Table Handling (Around Line 1006)

**BEFORE:**
```typescript
if (isVasTable) {
  // ... existing parsing code ...
  totalInserted += await insertRowsInChunks(insertRows)
}
```

**AFTER:**
```typescript
if (isVasTable) {
  // ... existing parsing code ...
  
  // NEW: Apply date fallback for next-day uploads
  for (const row of insertRows) {
    applyDateFallback(row, {
      targetField: 'jc_closed_date_time',
      fallbackFields: ['created_date_time'],
    })
  }

  // NEW: Use upsert instead of plain insert
  const config = UPSERT_CONFIG['service_vas_jc_data']
  let inserted = 0
  
  for (const keyFields of config) {
    const { error } = await supabase.from('service_vas_jc_data').upsert(insertRows, {
      onConflict: keyFields.join(','),
    })
    
    if (!error) {
      inserted = insertRows.length
      break
    }
  }
  
  // Fallback to insert if upsert fails on all keys
  if (inserted === 0) {
    inserted = await insertRowsWithDuplicateSkip(insertRows)
  }
  
  totalInserted += inserted
}
```

---

## PART 3: Update Invoice Table Handling (Around Line 1210)

**BEFORE:**
```typescript
if (isInvoiceTable) {
  // ... parsing ...
  totalInserted += await insertRowsInChunks(insertRows)
}
```

**AFTER:**
```typescript
if (isInvoiceTable) {
  // ... parsing ...
  
  // NEW: Apply date fallback for next-day uploads
  for (const row of insertRows) {
    applyDateFallback(row, {
      targetField: 'invoice_date',
      fallbackFields: ['closed_date_time', 'created_date_time'],
    })
  }

  // NEW: Use upsert
  const config = UPSERT_CONFIG['service_invoice_data']
  let inserted = 0
  
  for (const keyFields of config) {
    const { error } = await supabase.from('service_invoice_data').upsert(insertRows, {
      onConflict: keyFields.join(','),
    })
    
    if (!error) {
      inserted = insertRows.length
      break
    }
  }
  
  if (inserted === 0) {
    inserted = await insertRowsWithDuplicateSkip(insertRows)
  }
  
  totalInserted += inserted
}
```

---

## PART 4: Update Parts Order Handling (Around Line 1053)

**BEFORE:**
```typescript
if (isPartsOrderTable && partsOrderHeaderMapping) {
  // ... parsing ...
  totalInserted += await upsertOrInsertRows(
    insertRows,
    partsOrderOnConflictCandidates.length > 0
      ? partsOrderOnConflictCandidates
      : ['part_number,branch,order_date'],
  )
}
```

**AFTER:**
```typescript
if (isPartsOrderTable && partsOrderHeaderMapping) {
  // ... parsing ...
  
  // NEW: Apply date fallback for next-day uploads
  for (const row of insertRows) {
    applyDateFallback(row, {
      targetField: 'order_date',
      fallbackFields: ['order_received_date', 'order_created_date'],
    })
  }

  // Update existing upsert call with new config
  const config = UPSERT_CONFIG['service_parts_order_data']
  let inserted = 0
  
  for (const keyFields of config) {
    const { error } = await supabase.from('service_parts_order_data').upsert(insertRows, {
      onConflict: keyFields.join(','),
    })
    
    if (!error) {
      inserted = insertRows.length
      break
    }
  }
  
  if (inserted === 0) {
    inserted = await insertRowsWithDuplicateSkip(insertRows)
  }
  
  totalInserted += inserted
}
```

---

## PART 5: Update Parts Consumption Handling (Around Line 1270)

**BEFORE:**
```typescript
if (isPartsConsumptionTable && partsConsumptionHeaderMapping) {
  // ... parsing ...
  totalInserted += await upsertOrInsertRows(insertRows, [/* ... */])
}
```

**AFTER:**
```typescript
if (isPartsConsumptionTable && partsConsumptionHeaderMapping) {
  // ... parsing ...
  
  // NEW: Apply date fallback for next-day uploads
  for (const row of insertRows) {
    applyDateFallback(row, {
      targetField: 'transaction_date',
      fallbackFields: ['consumption_date', 'transaction_created_date'],
    })
  }

  const config = UPSERT_CONFIG['service_parts_consumption_data']
  let inserted = 0
  
  for (const keyFields of config) {
    const { error } = await supabase.from('service_parts_consumption_data').upsert(insertRows, {
      onConflict: keyFields.join(','),
    })
    
    if (!error) {
      inserted = insertRows.length
      break
    }
  }
  
  if (inserted === 0) {
    inserted = await insertRowsWithDuplicateSkip(insertRows)
  }
  
  totalInserted += inserted
}
```

---

## PART 6: Update Parts Stock Handling (Around Line 1330)

**BEFORE:**
```typescript
if (isPartsStockTable && partsStockHeaderMapping) {
  // ... parsing ...
  totalInserted += await upsertOrInsertRows(insertRows, [/* ... */])
}
```

**AFTER:**
```typescript
if (isPartsStockTable && partsStockHeaderMapping) {
  // ... parsing ...
  
  // NEW: Apply date fallback for next-day uploads
  for (const row of insertRows) {
    applyDateFallback(row, {
      targetField: 'snapshot_date',
      fallbackFields: ['stock_date', 'snapshot_created_date'],
    })
  }

  const config = UPSERT_CONFIG['service_parts_stock_snapshot_data']
  let inserted = 0
  
  for (const keyFields of config) {
    const { error } = await supabase.from('service_parts_stock_snapshot_data').upsert(insertRows, {
      onConflict: keyFields.join(','),
    })
    
    if (!error) {
      inserted = insertRows.length
      break
    }
  }
  
  if (inserted === 0) {
    inserted = await insertRowsWithDuplicateSkip(insertRows)
  }
  
  totalInserted += inserted
}
```

---

## VALIDATION CHECKLIST

- [ ] Copy `applyDateFallback()` function (PART 1)
- [ ] Copy `UPSERT_CONFIG` constant (PART 1)
- [ ] Update VAS table handling (PART 2)
- [ ] Update Invoice table handling (PART 3)
- [ ] Update Parts Order handling (PART 4)
- [ ] Update Parts Consumption handling (PART 5)
- [ ] Update Parts Stock handling (PART 6)
- [ ] Run `npm run build` → Should pass with no errors
- [ ] Test Day 1 upload
- [ ] Test Day 2 re-upload with updates
- [ ] Verify no duplicate rows appear
- [ ] Verify updated records have new data from Day 2

---

## How to Apply These Changes

### Option A: Manual (Recommended for first time)
1. Open `src/pages/ImportPage.tsx`
2. Find line ~800, add PART 1 code there
3. Find each table section (lines 1006, 1210, 1053, 1270, 1330)
4. Copy relevant code from PARTS 2-6

### Option B: Automated (For future updates)
```bash
# After changes, run:
npm run build
npm run lint
```

---

## What Each Change Does

| Part | What | Why |
|------|------|-----|
| 1 | Helper + Config | Shared logic, no duplication |
| 2 | VAS date fallback + upsert | Day 2 uploads work correctly |
| 3 | Invoice date fallback + upsert | Revenue data updates smoothly |
| 4 | Parts Order date fallback | Parts can be ordered same/next day |
| 5 | Consumption date fallback | Usage data aligns with uploads |
| 6 | Stock date fallback | Inventory snapshots stay current |

---

## Troubleshooting

### Build fails after changes
```
→ Check for missing commas
→ Verify all braces match
→ Run: npm run lint
```

### Upsert doesn't work (duplicates appear)
```
→ Check natural key is correct for table
→ Verify key fields exist in database schema
→ Check source_row_hash is being generated for parts tables
```

### Date fallback doesn't work
```
→ Verify fallback field names match actual database columns
→ Check if field is actually in the parsed row
→ Add console.log before/after to debug
```

---

## Questions?

Refer to:
- [Quick Start Guide](NEXT_DAY_UPLOAD_GUIDE.md)
- [Full Implementation Roadmap](../active/IMPLEMENTATION_ROADMAP.md)
- [Template Code](../evidence/UPLOAD_TEMPLATE_CODE.md)
