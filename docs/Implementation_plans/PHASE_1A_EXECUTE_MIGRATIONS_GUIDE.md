# Phase 1A: Execute Migrations - START HERE

**Date**: 2026-06-01  
**Objective**: Deploy 5 database migrations to staging environment  
**Time Estimate**: 10-15 minutes (5 migrations, 2-3 min each)  
**Risk Level**: LOW (no data changes; schema-only)

---

## IMPORTANT: Source of Truth

**The 5 individual migration files in `supabase/migrations/20260601*.sql` are the ONLY authoritative source.**

These files:
- Are tracked in version control
- Are applied automatically by Supabase CLI
- Define the exact schema changes
- Must NOT be duplicated in other locations (prevents drift)

---

## Deploy Individual Migrations (Recommended)

If you prefer to deploy one migration at a time (recommended for clarity):

### In Supabase SQL Editor

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **SQL Editor** tab
3. Click **New Query**

### Migration 1: Create user_employee_links table

**File**: `supabase/migrations/20260601000000_create_user_employee_links.sql`

1. Copy entire contents from file
2. Paste into SQL Editor
3. Click **Run**
4. Expected: ✓ Query successful
5. Verify: In Schema Editor, look for table `user_employee_links` with 3 indexes ✓

### Migration 2: Add columns to service_reception_entries

**File**: `supabase/migrations/20260601010000_add_sa_employee_code_to_reception.sql`

1. Click **New Query** (fresh query)
2. Copy and paste contents
3. Click **Run**
4. Expected: ✓ Query successful
5. Verify: Columns `sa_employee_code` + `sa_display_name` exist in service_reception_entries ✓

### Migration 3: Create helper functions

**File**: `supabase/migrations/20260601020000_create_sa_employee_code_function.sql`

1. Click **New Query**
2. Copy and paste
3. Click **Run**
4. Expected: ✓ Query successful
5. Verify: Functions `my_sa_employee_code()` and `has_module_action()` in Functions list ✓

### Migration 4: Fix RLS policies

**File**: `supabase/migrations/20260601030000_fix_reception_rls_policies.sql`

1. Click **New Query**
2. Copy and paste
3. Click **Run**
4. Expected: ✓ Query successful
5. Verify: In Schema Editor → service_reception_entries → Policies: see new SA policies ✓

### Migration 5: Harden sensitive table RLS

**File**: `supabase/migrations/20260601040000_harden_sensitive_table_rls.sql`

1. Click **New Query**
2. Copy and paste
3. Click **Run**
4. Expected: ✓ Query successful
5. Verify: In Schema Editor → employee_master → RLS is **enabled** ✓

---

## Verification Checklist (After All 5 Migrations)

Run these checks in Supabase SQL Editor to confirm all migrations succeeded:

### Check 1: Verify Tables

```sql
-- Should return: 1 row with user_employee_links
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'user_employee_links' AND table_schema = 'public';
```

**Expected**: One row: `user_employee_links`

### Check 2: Verify Columns

```sql
-- Should return: 2 rows (sa_employee_code, sa_display_name)
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'service_reception_entries' 
AND column_name IN ('sa_employee_code', 'sa_display_name')
AND table_schema = 'public';
```

**Expected**: Two rows with column names

### Check 3: Verify Functions

```sql
-- Should return: 2 rows (my_sa_employee_code, has_module_action)
SELECT proname FROM pg_proc 
WHERE proname IN ('my_sa_employee_code', 'has_module_action') 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
```

**Expected**: Two rows with function names

### Check 4: Verify RLS Policies

```sql
-- Should return: 6 rows (reception policies + SA policies)
SELECT policyname FROM pg_policies 
WHERE tablename = 'service_reception_entries' 
AND schemaname = 'public';
```

**Expected**: Policies like `service_reception_select_rbac`, `service_reception_select_sa`, etc.

### Check 5: Test Functions

```sql
-- Test 1: my_sa_employee_code() should return NULL (no mapping yet)
SELECT my_sa_employee_code();

-- Test 2: has_module_action() should work
SELECT has_module_action('service_advisor', 'view');

-- Test 3: Check user_employee_links table count (should be 0)
SELECT COUNT(*) FROM public.user_employee_links;
```

**Expected Results**:
- Test 1: `NULL`
- Test 2: `true` or `false` (not error)
- Test 3: `0`

---

## Troubleshooting

### Error: "Relation already exists"
**Cause**: Attempting to create table/function twice  
**Fix**: Migration already succeeded in a previous run. You can:
- Ignore the error (it's safe)
- OR restart from a fresh backup of the database

### Error: "Foreign key violation"
**Cause**: Missing referenced table  
**Fix**: 
- Ensure `employee_master` table exists
- Run migrations in order (1→2→3→4→5)

### Error: "Function already exists"
**Cause**: Attempting to create function twice  
**Fix**: Drop function first:
```sql
DROP FUNCTION IF EXISTS public.my_sa_employee_code() CASCADE;
DROP FUNCTION IF EXISTS public.has_module_action(text, text) CASCADE;
```

Then run migration 3 again.

---

## Next Steps (After Verification Passes)

Once all checks ✓ pass:

1. **Go to Phase 1B: Data Backfill**
   - File: `docs/Implementation_plans/PHASE_1_EXECUTION_GUIDE_2026-06-01.md` (Phase 1B section)
   - Run: `scripts/01_backfill_sa_name_matcher_diagnostic.sql` (diagnostic report)
   - Review report and identify unmapped users

2. **Update Master Plan**
   - Update Activity Tracker section 4.1 → mark migration tasks as ✓ Done
   - Mark section 4.2 → mark backfill tasks as 🟡 In Progress

---

## Rollback (If Needed)

If migrations fail or need to be undone, restore from backup:

```bash
# Restore pre-migration backup
psql -U postgres -h aws-1-ap-south-1.pooler.supabase.com -d postgres \
  < local_folder/backups/pre_phase1_migration_[TIMESTAMP].sql
```

Then troubleshoot and re-run migrations.

---

## Quick Reference

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20260601000000_create_user_employee_links.sql` | Create linkage table + 3 indexes |
| 2 | `supabase/migrations/20260601010000_add_sa_employee_code_to_reception.sql` | Add sa_employee_code + sa_display_name columns + 2 indexes |
| 3 | `supabase/migrations/20260601020000_create_sa_employee_code_function.sql` | Create my_sa_employee_code() + has_module_action() functions |
| 4 | `supabase/migrations/20260601030000_fix_reception_rls_policies.sql` | Drop old policies; create new employee-code-based policies |
| 5 | `supabase/migrations/20260601040000_harden_sensitive_table_rls.sql` | Enable RLS on employee_master; add admin-only policies |

**Note**: These 5 files in `supabase/migrations/` are the ONLY authoritative source. Execute them in order 1→2→3→4→5.

---

**Status**: Ready to execute. No prerequisites needed.  
**Support**: If issues arise, check Troubleshooting section above.  
**After Completion**: Proceed to Phase 1B (Data Backfill).
