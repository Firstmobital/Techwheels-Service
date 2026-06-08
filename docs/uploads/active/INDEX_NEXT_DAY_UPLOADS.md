# Next-Day Upload Feature Documentation

## Overview
This feature enables seamless re-uploads of data on subsequent days. When users upload the same data with updates or additions, the system intelligently updates existing records instead of creating duplicates.

**Status:** Feature designed, ready for implementation  
**Effort:** ~8 hours total (start with VAS table: ~2 hours)  
**Priority:** HIGH (impacts daily operations)

---

## 📚 Documentation Index

### Start Here
1. **[README_NEXT_DAY_UPLOADS.md](README_NEXT_DAY_UPLOADS.md)** ⭐
   - TL;DR summary
   - 3 key fixes explained
   - Implementation timeline
   - Success criteria

### For Understanding
2. **[VISUAL_GUIDE.md](../evidence/VISUAL_GUIDE.md)**
   - Problem vs. solution diagrams
   - How natural keys work
   - Flow diagrams
   - Before/after comparison

3. **[NEXT_DAY_UPLOAD_GUIDE.md](../runbooks/NEXT_DAY_UPLOAD_GUIDE.md)**
   - Quick start guide
   - 3 key components deep-dive
   - Real-world example
   - FAQ

### For Implementation
4. **[COPY_PASTE_CODE.md](../runbooks/COPY_PASTE_CODE.md)** ⭐⭐
   - Ready-to-use code
   - Copy from PART 1-6
   - Where to place each change
   - Line numbers provided
   - Validation checklist

5. **[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)**
   - Priority order (5 tables)
   - Effort per table
   - Testing strategy
   - Migration notes

### For Reference
6. **[UPLOAD_TEMPLATE_CODE.md](../evidence/UPLOAD_TEMPLATE_CODE.md)**
   - Generic template pattern
   - Step-by-step functions
   - Type definitions
   - Best practices

7. **[UPLOAD_LOGIC_REFACTOR.md](../evidence/UPLOAD_LOGIC_REFACTOR.md)**
   - Detailed comparison
   - Current vs. fixed
   - Why each change needed
   - Architecture patterns

---

## 🎯 Quick Start (5 minutes)

### Read These in Order
1. [README_NEXT_DAY_UPLOADS.md](README_NEXT_DAY_UPLOADS.md) - 2 min
2. [VISUAL_GUIDE.md](../evidence/VISUAL_GUIDE.md) - 3 min

### Then
- Understand: Problem is INSERT duplicates on Day 2
- Solution: UPSERT with natural keys + date fallback
- Start with: VAS table (most critical)

---

## 💻 Implementation (8 hours)

### Phase 1: VAS Table (2 hours)
```
1. Read: COPY_PASTE_CODE.md PART 1-2
2. Add: applyDateFallback() + UPSERT_CONFIG
3. Update: VAS table handling
4. Test: Day 1 + Day 2 upload
```

### Phase 2: Invoice Table (2 hours)
```
1. Read: COPY_PASTE_CODE.md PART 3
2. Update: Invoice table handling
3. Test: Day 1 + Day 2 upload
```

### Phase 3: Parts Tables (2-3 hours)
```
1. Read: COPY_PASTE_CODE.md PART 4-6
2. Update: Parts Order, Consumption, Stock
3. Test: Multi-day upload scenarios
```

### Phase 4: Validation (1 hour)
```
1. npm run build ✓
2. npm run lint ✓
3. Manual testing ✓
```

---

## 🧪 Testing Checklist

### Test Case 1: Day 1 Upload
```
File: 5 records
Result: 5 rows inserted ✓
```

### Test Case 2: Day 2 Re-upload (Same + Updates)
```
File: Same 5 records with 2 updated amounts + 3 new
Result: 8 total rows (5 original + 3 new, 2 updated) ✓
```

### Test Case 3: Partial Re-upload
```
File: 3 of original 5 with updates
Result: Still 8 total rows, 3 updated ✓
```

### Test Case 4: Date Fallback
```
File: Rows with missing invoice_date
Result: Dates filled from fallback fields ✓
```

### Test Case 5: Employee Lookup
```
File: Rows with employee code
Result: Matched and populated ✓
```

---

## 📊 Natural Keys by Table

| Table | Natural Key Fields | Use Case |
|-------|---|---|
| job_card_closed_data | (job_card_number, branch, closed_date_time) | PSF Revenue |
| service_vas_jc_data | (job_card_number, branch, sr_type) | VAS Revenue |
| service_invoice_data | (job_card_number, branch, invoice_date) | Invoice Data |
| service_parts_order_data | (part_number, branch, order_date, source_row_hash) | Parts Orders |
| service_parts_consumption_data | (part_number, branch, transaction_date, source_row_hash) | Parts Usage |
| service_parts_stock_snapshot_data | (part_number, branch, portal, snapshot_date) | Inventory |

---

## 🔑 Implementation Files

### New/Modified Files
- `src/pages/ImportPage.tsx` - Main implementation (6 sections to update)
- `src/lib/vasColumnMapperV2.ts` - Create (if enhancing VAS mapping)
- `src/lib/invoiceColumnMapperV2.ts` - Create (if enhancing Invoice mapping)

### Reference Implementation
- `src/lib/jcClosedColumnMapper.ts` - Already done, copy pattern from here

### Configuration
- Add `UPSERT_CONFIG` constant (defines natural keys)
- Add `applyDateFallback()` function (handles missing dates)

---

## 📋 Natural Key Design Decisions

### Why Include Branch?
- Same JC can exist in multiple branches (Ajmer, Sitapura PV, Sitapura EV)
- Each branch is independent operational unit
- Prevents cross-branch data confusion

### Why Include Type/Date?
- Same JC can have multiple service types (General, AC, Major)
- Same part can be ordered multiple times
- Date creates temporal uniqueness

### Why Include source_row_hash for Parts?
- Exact row identification (prevents partial duplicates)
- Ensures same row in same file matches correctly
- Hash generated from part_number + branch + date

---

## ⚠️ Important Notes

### Database Constraints
For UPSERT to work, database must have UNIQUE constraints on natural key fields:
```sql
CREATE UNIQUE INDEX idx_table_natural_key ON table_name (
  field1,
  field2,
  field3
);
```

### Fallback Priority
Date fallback tries in order:
1. Explicit field value
2. Related date field 1
3. Related date field 2
4. Today's date

### Duplicate Detection
- If same natural key exists: UPDATE (not duplicate error)
- If different natural key: INSERT (new record)
- If neither exists: INSERT (new record)

---

## 🚀 Deployment Checklist

- [ ] Code changes reviewed
- [ ] Tests pass (manual + automated)
- [ ] npm run build successful
- [ ] No TypeScript errors
- [ ] Backward compatible (existing data unchanged)
- [ ] Rollback plan documented
- [ ] Monitoring in place
- [ ] User documentation updated
- [ ] Stakeholder approval
- [ ] Deploy to staging first
- [ ] Deploy to production

---

## 📖 Current Implementation Reference

**Already Done (Learn from this):**
- Job Card Closed Data: `src/lib/jcClosedColumnMapper.ts`
  - Lines 1-100: Column specs with aliases
  - Lines 120-150: Type parsing (numeric, date, text)
  - Lines 262-369: Header mapping function

**Current Upload Logic:**
- `src/pages/ImportPage.tsx`
  - Line 800-900: Upload processing
  - Line 929-960: Current upsert attempt
  - Line 1006-1052: VAS table handling (needs update)
  - Line 1150-1210: Date handling (example to follow)
  - Line 1210-1270: Invoice table handling (needs update)

---

## 🎓 Learning Resources

### Within This Codebase
- Read: [jcClosedColumnMapper.ts](../src/lib/jcClosedColumnMapper.ts)
- Understand: Specs → Mapping → Parsing → Insertion
- Pattern: Copy this for other tables

### In Docs
- [UPLOAD_TEMPLATE_CODE.md](../evidence/UPLOAD_TEMPLATE_CODE.md) - Generic template
- [VISUAL_GUIDE.md](../evidence/VISUAL_GUIDE.md) - Diagrams
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) - Step-by-step

---

## ❓ FAQ

**Q: Do I need to implement all 5 tables at once?**
A: No. Start with VAS (most used), then Invoice. Others can wait.

**Q: Will this break existing data?**
A: No. Only affects future uploads. Existing records untouched.

**Q: What if database doesn't have UNIQUE constraint?**
A: Upsert falls back to plain INSERT (still better than current).

**Q: How do I test this locally?**
A: Upload same file on Day 1, re-upload on Day 2 with edits, check results.

**Q: Can I rollback if something breaks?**
A: Yes. Revert code changes. Existing records remain unaffected.

**Q: Why not just delete old records first?**
A: Because if upload fails mid-way, you lose all data. Upsert is atomic.

---

## 📞 Support

### If Stuck
1. Read: [VISUAL_GUIDE.md](../evidence/VISUAL_GUIDE.md) - Understand the concept
2. Read: [COPY_PASTE_CODE.md](../runbooks/COPY_PASTE_CODE.md) - See exact code placement
3. Check: Line numbers provided in code comments
4. Test: Day 1 + Day 2 upload manually

### Common Issues
- Build fails → Check for syntax errors in PART 1
- Upsert doesn't work → Verify natural key matches database
- Duplicates still appear → Check onConflict field names
- Date fallback fails → Check field names in config

---

## 📝 Summary

**What:** Enable Day 2+ uploads to update existing records instead of creating duplicates

**Why:** Users need to re-upload data when:
- New information arrives
- Amounts or quantities are corrected
- Additional columns are available

**How:** 
1. Map flexible Excel column names to DB columns
2. Fill missing dates from related fields
3. Use UPSERT with natural keys (update if exists, insert if new)

**Result:** Seamless multi-day data uploads with automatic conflict resolution

**Timeline:** 2 weeks if starting fresh, 2 days if using this guide

---

## 📚 Document Navigation

```
START HERE
    ↓
README_NEXT_DAY_UPLOADS.md (5 min read)
    ↓
VISUAL_GUIDE.md (diagrams & examples)
    ↓
Choose your path:
    ├─→ Understanding: NEXT_DAY_UPLOAD_GUIDE.md
    ├─→ Coding: COPY_PASTE_CODE.md ⭐⭐
    ├─→ Planning: IMPLEMENTATION_ROADMAP.md
    ├─→ Reference: UPLOAD_TEMPLATE_CODE.md
    └─→ Deep Dive: UPLOAD_LOGIC_REFACTOR.md
```

---

Last Updated: 27 May 2026  
Status: Ready for Implementation  
Priority: HIGH
