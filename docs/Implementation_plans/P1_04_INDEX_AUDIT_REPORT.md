# P1-04: Index Migration Audit Report (Authoritative Dump Verified)

**Date**: 2026-06-08  
**Authority**: Local full_database.sql (53 MB) + chunks mirror (part_000, part_001, part_002)  
**Status**: ✅ VERIFIED - All 4 indexes audited and migration files created  

---

## 1) Audit Methodology

Per governance rules R7-R10:
- ✅ Authority source: `local_folder/backups/full_database.sql` (authoritative, never downgrades)
- ✅ Mirror used: `local_folder/backups/chunks/full_database.sql.part_*` (for large-file access)
- ✅ Scope: Verify 4 target tables + all index columns exist in current schema
- ✅ Conflict rule: Prefer local dump without reconciliation
- ✅ No invention rule: Only create indexes on existing tables/columns

---

## 2) Table Existence Verification

### ✅ Table 1: service_parts_consumption_data
**Location in dump**: `full_database.sql.part_000:5986`  
**Status**: EXISTS

**Columns Verified**:
```
id (bigint, PRIMARY KEY)
branch (text, NOT NULL)
fiscal_year (integer, NOT NULL) ✓
created_at (timestamp, DEFAULT now())
updated_at (timestamp, DEFAULT now())
part_number (text, NOT NULL)
transaction_date (date)
portal (text, DEFAULT 'EV')
month_name (text, NOT NULL)
... 11 more columns
```

**Existing Indexes in Dump**:
- `idx_parts_consumption_branch_date` (branch, transaction_date)
- `idx_parts_consumption_branch_portal_fiscal` (branch, portal, fiscal_year, month_name)
- `idx_parts_consumption_period` (branch, portal, fiscal_year, month_name, part_number)
- `idx_parts_consumption_part` (part_number)
- `idx_parts_consumption_part_portal` (part_number, branch, portal)

**New Index**: `idx_parts_consumption_branch_fiscal_year_desc (branch, fiscal_year DESC)`
**Conflict Status**: ✅ NO CONFLICT — complementary to portal-based indexes; optimizes fiscal_year DESC without portal filter

---

### ✅ Table 2: service_reception_entries
**Location in dump**: `full_database.sql.part_000:6146`  
**Status**: EXISTS

**Columns Verified**:
```
id (bigint, PRIMARY KEY)
created_at (timestamp, DEFAULT now()) ✓
branch (text) ✓
service_type (text) ✓
jc_number (text) ✓
reg_number (text, NOT NULL) ✓
dealer_code (text, FK)
sa_employee_code (text)
... 20+ more columns
```

**Existing Indexes in Dump**:
- `idx_service_reception_entries_dealer_created` (dealer_code, created_at DESC) — ⚠️ Uses dealer_code, NOT branch
- `idx_service_reception_entries_jc_number` (jc_number)
- `idx_service_reception_entries_reg_number` (reg_number)
- `idx_service_reception_entries_sa_name_norm` (lower(btrim(sa_name)))
- `idx_service_reception_sa_display` (dealer_code, sa_display_name)
- `idx_service_reception_sa_lookup` (dealer_code, sa_employee_code, created_at DESC)

**New Index**: `idx_reception_entries_branch_created_at_desc (branch, created_at DESC, id DESC) INCLUDE (jc_number, reg_number, service_type)`
**Conflict Status**: ✅ **NO CONFLICT — CRITICAL GAP IDENTIFIED**
- Slow query (Query 2: 1,947 calls, 610 ms) filters on `WHERE branch = '...'`
- Existing dealer_created index is on `dealer_code`, not `branch`
- This new index is ESSENTIAL for fast branch-scoped pagination

---

### ✅ Table 3: service_vas_jc_data
**Location in dump**: `full_database.sql.part_000:6325`  
**Status**: EXISTS

**Columns Verified**:
```
id (bigint, PRIMARY KEY)
branch (text, NOT NULL) ✓
created_at (timestamp, DEFAULT now()) ✓
employee_code (text) ✓
sr_type (text) ✓
job_card_number (text) ✓
... 20 more columns
```

**Existing Indexes in Dump**:
- `idx_service_vas_jc_data_employee_code` (employee_code)
- `idx_service_vas_jc_data_job_card_branch` (job_card_number, branch)
- `idx_service_vas_jc_data_sr_type` (sr_type)
- `idx_service_vas_lookup` (job_card_number, branch, sr_type)

**New Index**: `idx_vas_jc_data_branch_created_at_desc (branch, created_at DESC) INCLUDE (employee_code, sr_type, job_card_number)`
**Conflict Status**: ✅ **NO CONFLICT — CRITICAL GAP IDENTIFIED**
- Slow query (Query 7: 6,218 calls, 38 ms) filters on `WHERE branch = '...' AND created_at >= NOW() - INTERVAL '7 days'`
- Existing indexes on employee_code, job_card_branch, sr_type but NONE on (branch, created_at)
- This new index is ESSENTIAL for date-windowed filtering by branch

---

### ✅ Table 4: service_parts_stock_snapshot_data
**Location in dump**: `full_database.sql.part_000:6096`  
**Status**: EXISTS

**Columns Verified**:
```
id (bigint, PRIMARY KEY)
part_number (text, NOT NULL) ✓
branch (text, NOT NULL) ✓
snapshot_date (date, NOT NULL) ✓
created_at (timestamp, DEFAULT now())
updated_at (timestamp, DEFAULT now())
on_hand_quantity (numeric)
inventory_value (numeric)
portal (text, DEFAULT 'EV')
... 13 more columns
```

**Existing Indexes in Dump**:
- `idx_parts_stock_branch_date` (branch, snapshot_date)
- `idx_parts_stock_branch_portal_date` (branch, portal, snapshot_date DESC)
- `idx_parts_stock_location` (location_1, inventory_location)
- `idx_parts_stock_part` (part_number)
- `idx_parts_stock_part_branch_portal` (part_number, branch, portal)

**New Index**: `idx_stock_snapshot_branch_snapshot_date_desc (branch, snapshot_date DESC, part_number ASC) INCLUDE (on_hand_quantity, inventory_value)`
**Conflict Status**: ✅ NO CONFLICT — complementary to portal-based index; lower priority since idx_parts_stock_branch_portal_date already covers this

---

## 3) Migration Files Created

### File 1 (CRITICAL): 20260608_p1_04_index_reception_entries_branch_created.sql
**Priority**: 🔴 HIGH — Missing branch+created index for Query 2 (13.46% DB time)  
**Expected Impact**: 610 ms → 200 ms (67% reduction)  
**Status**: ✅ Created and verified  

### File 2 (CRITICAL): 20260608_p1_04_index_vas_jc_data_branch_created.sql
**Priority**: 🔴 HIGH — Missing branch+created index for Query 7 (2.67% DB time)  
**Expected Impact**: 38 ms baseline, max 6.38s → optimized  
**Status**: ✅ Created and verified  

### File 3 (OPTIONAL): 20260608_p1_04_index_parts_consumption_fiscal.sql
**Priority**: 🟡 MEDIUM — Complementary to existing portal-based indexes  
**Expected Impact**: 5-20% additional reduction for non-portal queries  
**Status**: ✅ Created and verified  

### File 4 (OPTIONAL): 20260608_p1_04_index_stock_snapshot_date.sql
**Priority**: 🟡 MEDIUM — Complementary to existing portal-based index  
**Expected Impact**: 5-10% improvement if portal filter absent  
**Status**: ✅ Created and verified  

---

## 4) Execution Plan

### Step 1: Deploy CRITICAL Indexes (File 1 + File 2)
```bash
# Apply both critical migrations via Supabase SQL Editor
-- File 1: index_reception_entries_branch_created.sql
-- File 2: index_vas_jc_data_branch_created.sql
```

**Validation**:
```sql
-- After deployment, run EXPLAIN ANALYZE for sample queries
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, jc_number, created_at FROM service_reception_entries
WHERE branch = 'Sitapura EV'
ORDER BY created_at DESC LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM service_vas_jc_data
WHERE branch = 'Ajmer Road' AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC LIMIT 100;

-- Expected: Index Scan using new indexes (not Seq Scan)
```

### Step 2: Deploy OPTIONAL Indexes (File 3 + File 4)
```bash
# Apply optional complementary indexes
-- File 3: index_parts_consumption_fiscal.sql
-- File 4: index_stock_snapshot_date.sql
```

### Step 3: Measure Performance
- Re-run Supabase Query Performance logs after 1-2 hours
- Compare Query 1, 2, 7, 10 latencies against baseline
- Confirm combined reduction in proportional DB time

---

## 5) Rollback Plan

Each migration file includes rollback SQL (DROP INDEX statements).  
If any index causes performance regression:
```sql
DROP INDEX IF EXISTS idx_reception_entries_branch_created_at_desc;
DROP INDEX IF EXISTS idx_vas_jc_data_branch_created_at_desc;
DROP INDEX IF EXISTS idx_parts_consumption_branch_fiscal_year_desc;
DROP INDEX IF EXISTS idx_stock_snapshot_branch_snapshot_date_desc;
```

---

## 6) Authority Compliance Summary

✅ **Rule R7**: Authority source = local_folder/backups/full_database.sql (verified)  
✅ **Rule R8**: Mirror chunks used for large-file access (part_000, part_001, part_002)  
✅ **Rule R9**: No invented tables/columns/indexes (all verified in dump)  
✅ **Rule R10**: No reconciliation; dump authority is final  

**Conclusion**: All 4 indexes have been audited against the authoritative schema and are safe to deploy. 2 indexes are CRITICAL for performance; 2 are optional complements.

**Next Step**: Execute P1-04 migrations in Supabase, then proceed with P1-05 query rewrites (keyset pagination, count=estimated, narrow projections).
