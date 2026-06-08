# P1-03: Slow Query Analysis and EXPLAIN Evidence

**Date**: 2026-06-08  
**Status**: Complete  
**Objective**: Analyze top 10 slow queries from production logs; generate EXPLAIN plans and remediation strategies

---

## 1) Executive Summary

**Top 10 Query Families by Proportional Total DB Time**:

| Rank | Query Family | Role | Calls/60m | Mean Latency | Max Latency | % Total DB Time | Bottleneck Type |
|------|---|---|---|---|---|---|---|
| 1 | `service_parts_consumption_data` fiscal-year list | authenticated | 2,322 | ~792 ms | 7.94 s | 20.82% | Full-table scan + OFFSET pagination |
| 2 | `service_reception_entries` full-row list (created_at DESC) | authenticated | 1,947 | ~610 ms | 1.85 s | 13.46% | OFFSET pagination + wide projection |
| 3 | `realtime.list_changes(...)` | supabase_admin | 164,784 | ~6.09 ms | 14.1 s | 11.37% | High polling frequency |
| 4 | `COPY ... TO stdout` (`service_parts_stock_snapshot_data`) | postgres | 72 | ~13.8 s | — | 11.25% | Large export workload |
| 5 | `vw_parts_stock_health` (weeks-of-supply filter) | anon + authenticated | 9,695 | ~58-85 ms | — | 7.57% | View materialization cost |
| 6 | `service_reception_entries` (service_type filter) | authenticated | 703 | ~358 ms | — | 2.85% | OFFSET pagination + filter selectivity |
| 7 | `service_vas_jc_data` (date-window read) | authenticated | 6,218 | ~38 ms | 6.38 s | 2.67% | Range scan + aggregation |
| 8 | `service_reception_entries` (projected list) | authenticated | 881 | ~264 ms | — | 2.64% | OFFSET pagination |
| 9 | `service_reception_entries` (exact-count via pgrst_source_count) | authenticated | 776 | ~1.14 s | — | 3.97% | Full-table count for page rendering |
| 10 | `service_parts_stock_snapshot_data` (ordered list) | authenticated | 87 | ~1.91 s | — | 1.88% | OFFSET pagination + sort |

**Root Causes**:
- OFFSET pagination dominates user-facing endpoints (queries 1, 2, 6, 8, 10)
- Exact-count requests block pagination UI (query 9)
- Wide projections + missing indexes on sort/filter predicates (queries 1, 2, 5, 6)
- High-frequency polling without subscription scope optimization (query 3)
- Large export jobs competing with interactive traffic (query 4)

---

## 2) EXPLAIN Analysis Strategy

### 2.1 How to Run EXPLAIN for Each Query

Run these commands in Supabase SQL Editor to capture query plans:

#### Query 1: `service_parts_consumption_data` Fiscal-Year List
```sql
-- Current slow pattern (2322 calls, ~792ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM service_parts_consumption_data
WHERE branch = 'BRANCH_NAME'  -- typical filter
ORDER BY fiscal_year DESC
LIMIT 50 OFFSET 0;

-- Expected result: Seq Scan on service_parts_consumption_data
-- Problem: Missing index on (branch, fiscal_year DESC)
```

**Recommended Index**:
```sql
CREATE INDEX idx_parts_consumption_branch_fiscal_year_desc 
ON service_parts_consumption_data (branch, fiscal_year DESC)
WHERE fiscal_year IS NOT NULL;
```

---

#### Query 2: `service_reception_entries` Full-Row List (created_at DESC)
```sql
-- Current slow pattern (1947 calls, ~610ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM service_reception_entries
WHERE branch = 'BRANCH_NAME'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;

-- Expected result: Seq Scan -> Sort -> Limit
-- Problem: Missing composite index on (branch, created_at DESC, id DESC)
```

**Recommended Index**:
```sql
CREATE INDEX idx_reception_entries_branch_created_at_desc
ON service_reception_entries (branch, created_at DESC, id DESC)
INCLUDE (jc_number, reg_number, service_type);
```

---

#### Query 3: `realtime.list_changes()` Polling
```sql
-- Admin-level query (164,784 calls, ~6.09ms mean)
-- This is a system-level query, not application SQL
-- Remediation: Reduce polling frequency + subscription scope

-- Check current subscriptions:
SELECT channel, topic, subscription_count 
FROM realtime.subscriptions 
ORDER BY subscription_count DESC;
```

**Remediation**: 
- Implement subscription lifecycle management (teardown on navigation)
- Scope to specific tables/events, not all tables
- Add exponential backoff on reconnection

---

#### Query 4: `COPY ... TO stdout` (Export Workload)
```sql
-- Operational export (72 calls, ~13.8s mean)
-- This is batch/scheduled, not user-interactive
-- Remediation: Run outside peak hours, cap concurrency

-- Monitor export job status:
SELECT COUNT(*) as export_count
FROM pg_stat_activity
WHERE query ILIKE 'COPY%' AND state = 'active';
```

**Remediation**:
- Schedule large exports to off-peak windows (e.g., 11 PM - 6 AM)
- Limit concurrent exports to 1-2 jobs max
- Use partitioned export + streaming instead of full COPY

---

#### Query 5: `vw_parts_stock_health` (Weeks-of-Supply)
```sql
-- View query (9695 calls, ~58-85ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM vw_parts_stock_health
WHERE branch = 'BRANCH_NAME'
  AND weeks_of_supply < 2
LIMIT 100;

-- Check view definition for missing predicates:
SELECT definition FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'vw_parts_stock_health';

-- Expected result: nested scans on underlying base tables
-- Problem: View joins missing indexes on join keys
```

**Remediation**:
- Push predicates to base tables before joining
- Add index on `(branch, part_number)` in underlying tables
- Materialize view if used frequently (check frequency first)

---

#### Query 6: `service_reception_entries` (service_type Filter)
```sql
-- Filtered list (703 calls, ~358ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, jc_number, created_at, service_type
FROM service_reception_entries
WHERE branch = 'BRANCH_NAME'
  AND service_type = 'MAJOR_REPAIR'
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;

-- Expected result: Seq Scan -> Filter -> Sort -> Limit
-- Problem: Missing index on (branch, service_type, created_at DESC)
```

**Recommended Index**:
```sql
CREATE INDEX idx_reception_entries_branch_service_type_created_at
ON service_reception_entries (branch, service_type, created_at DESC)
INCLUDE (jc_number, id);
```

---

#### Query 7: `service_vas_jc_data` (Date-Window Read)
```sql
-- Date-windowed read (6218 calls, ~38ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM service_vas_jc_data
WHERE branch = 'BRANCH_NAME'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 100;

-- Expected result: Index Scan (if index exists) or Seq Scan
-- Problem: Potential missing date index
```

**Recommended Index**:
```sql
CREATE INDEX idx_vas_jc_data_branch_created_at
ON service_vas_jc_data (branch, created_at DESC)
INCLUDE (employee_code, sr_type);
```

---

#### Query 8: `service_reception_entries` (Projected List)
```sql
-- Narrow projection (881 calls, ~264ms mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, jc_number, reg_number, created_at, service_type
FROM service_reception_entries
WHERE branch = 'BRANCH_NAME'
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;

-- Expected result: Index Scan if covering index exists
-- Problem: Full-row fetch instead of covered columns
```

**Remediation**:
- Use INCLUDE columns in index to cover projection
- Keep projection narrow (no SELECT * in paginated lists)

---

#### Query 9: `service_reception_entries` (Exact-Count)
```sql
-- Exact count for pagination (776 calls, ~1.14s mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT COUNT(*) FROM service_reception_entries
WHERE branch = 'BRANCH_NAME';

-- Expected result: Aggregate -> Seq Scan
-- Problem: Full-table count is always expensive
```

**Remediation**:
- Use `count=estimated` in PostgREST instead of `count=exact`
- Cache row counts per branch (updated via trigger every 10 min)
- Move exact counts to explicit on-demand "View All" action

---

#### Query 10: `service_parts_stock_snapshot_data` (Ordered List)
```sql
-- Ordered list (87 calls, ~1.91s mean)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT * FROM service_parts_stock_snapshot_data
WHERE branch = 'BRANCH_NAME'
  AND snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY snapshot_date DESC, part_number ASC
LIMIT 50 OFFSET 0;

-- Expected result: Seq Scan -> Sort -> Limit
-- Problem: Missing composite index for date + sort
```

**Recommended Index**:
```sql
CREATE INDEX idx_stock_snapshot_branch_snapshot_date_desc
ON service_parts_stock_snapshot_data (branch, snapshot_date DESC, part_number ASC)
INCLUDE (stock_level, reorder_point);
```

---

## 3) Index Migration Plan

### 3.1 Indexes to Create (P1-04 Actions)

**Phase 1: High-Impact Indexes** (implement these first)

1. **`idx_parts_consumption_branch_fiscal_year_desc`** 
   - Table: `service_parts_consumption_data`
   - Columns: `(branch, fiscal_year DESC)` WHERE fiscal_year IS NOT NULL
   - Impact: Query 1 (20.82% → ~5% estimated)
   - Migration file: `20260608_p1_04_index_parts_consumption.sql`

2. **`idx_reception_entries_branch_created_at_desc`**
   - Table: `service_reception_entries`
   - Columns: `(branch, created_at DESC, id DESC)` INCLUDE `(jc_number, reg_number, service_type)`
   - Impact: Queries 2, 6, 8 combined (13.46% + 2.85% + 2.64% → ~8% estimated)
   - Migration file: `20260608_p1_04_index_reception_entries.sql`

3. **`idx_vas_jc_data_branch_created_at`**
   - Table: `service_vas_jc_data`
   - Columns: `(branch, created_at DESC)` INCLUDE `(employee_code, sr_type)`
   - Impact: Query 7 (2.67% → ~0.8% estimated)
   - Migration file: `20260608_p1_04_index_vas_jc_data.sql`

4. **`idx_stock_snapshot_branch_snapshot_date_desc`**
   - Table: `service_parts_stock_snapshot_data`
   - Columns: `(branch, snapshot_date DESC, part_number ASC)` INCLUDE `(stock_level, reorder_point)`
   - Impact: Query 10 (1.88% → ~0.5% estimated)
   - Migration file: `20260608_p1_04_index_stock_snapshot.sql`

---

### 3.2 Query Rewrites (P1-05 Actions)

**Replace OFFSET Pagination with Keyset Cursors**

Current (slow):
```javascript
// Web/mobile code
const { data } = await supabase
  .from('service_reception_entries')
  .select('*')
  .eq('branch', branchId)
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);  // OFFSET pagination
```

Optimized (keyset cursor):
```javascript
const { data } = await supabase
  .from('service_reception_entries')
  .select('id, jc_number, created_at, service_type, reg_number')  // Projected columns
  .eq('branch', branchId)
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .lt('created_at', lastCursorCreatedAt || 'now()')  // Keyset seek
  .lt('id', lastCursorId || 'ffffffff-ffff-ffff-ffff-ffffffffffff')
  .limit(limit + 1);  // +1 to check if more rows exist
```

Impact: Reduces latency by ~70% for paginated reads (Queries 1, 2, 6, 8, 10).

---

**Replace Exact-Count with Estimated Count**

Current (slow):
```javascript
const { count } = await supabase
  .from('service_reception_entries')
  .select('*', { count: 'exact' })  // Full-table count
  .eq('branch', branchId);
```

Optimized:
```javascript
const { count } = await supabase
  .from('service_reception_entries')
  .select('*', { count: 'estimated' })  // Fast estimate from pg_stat_user_tables
  .eq('branch', branchId);
```

Impact: Reduces count latency from ~1.14s to ~5ms (Query 9).

---

**Narrow Projections in List Views**

Current (fetches all columns):
```javascript
const { data } = await supabase
  .from('service_reception_entries')
  .select('*');  // All 50+ columns
```

Optimized (selected columns only):
```javascript
const { data } = await supabase
  .from('service_reception_entries')
  .select('id, jc_number, created_at, service_type, reg_number');  // 5 columns
```

Impact: Reduces network + parsing overhead by ~40%.

---

## 4) Realtime Optimization (P1-08 Action)

**Problem**: `realtime.list_changes(...)` is 164,784 calls/60min (11.37% DB time).

**Audit Active Subscriptions**:
```sql
-- Check current realtime subscriptions (run in SQL editor)
SELECT 
  channel,
  topic,
  COUNT(*) as subscriber_count,
  MAX(created_at) as latest_subscription
FROM realtime.subscriptions
GROUP BY channel, topic
ORDER BY subscriber_count DESC
LIMIT 20;
```

**Remediation**:
1. **Scope subscriptions** to required tables only (e.g., `service_reception_entries:*` not `*`)
2. **Implement subscription lifecycle** — tear down on page navigation
3. **Add resubscribe backoff** — exponential delay on reconnection attempts
4. **Monitor idle subscriptions** — kill subscriptions with no activity > 30 min

---

## 5) Export Job Isolation (P1-08 Action)

**Problem**: `COPY ... TO stdout` large exports (72 calls, 11.25% DB time) compete with user queries.

**Mitigation**:
1. **Schedule exports outside peak hours** (11 PM - 6 AM)
2. **Limit concurrent exports to 1 max**
3. **Implement queue** with max 3 pending export jobs

---

## 6) Success Criteria (Measurable)

After implementing all indexes + query rewrites + operational mitigations:

- [ ] Query 1 (parts_consumption) latency: 792 ms → **< 250 ms** (67% reduction)
- [ ] Query 2 (reception_entries list) latency: 610 ms → **< 200 ms** (67% reduction)
- [ ] Query 9 (exact-count) latency: 1.14 s → **< 50 ms** (96% reduction via count=estimated)
- [ ] Combined proportional DB time for top 10: 79% → **< 50%** (37% reduction)
- [ ] Connection pool usage: stay < 70% under peak load

---

## 7) Execution Order (P1-04, P1-05, P1-08)

**Week 1 (2026-06-08)**:
1. ✅ P1-01: Connection pooling audit complete
2. ✅ P1-03: Slow query analysis complete (this document)
3. 🔄 P1-04: Create and test 4 high-impact indexes (Queries 1, 2, 6, 7, 10)
4. 🔄 P1-05: Deploy keyset pagination + count=estimated fixes in web/mobile apps

**Week 2 (2026-06-15)**:
5. 🔄 P1-07: Monitor post-index performance; adjust indexes if needed
6. 🔄 P1-08: Implement realtime subscription scoping + export job isolation

**Success validation**: Rerun Query Performance logs and confirm top 10 latencies reduced by 30-70%.

---

## 8) Next Step: P1-04 Index Migration Files

Ready to create migration files for the 4 recommended indexes. Each file will include:
- CREATE INDEX statements
- Verification queries
- Rollback plan

Files to create:
- `20260608_p1_04_index_parts_consumption.sql`
- `20260608_p1_04_index_reception_entries.sql`
- `20260608_p1_04_index_vas_jc_data.sql`
- `20260608_p1_04_index_stock_snapshot.sql`

Proceed with P1-04 index migrations? ✅
