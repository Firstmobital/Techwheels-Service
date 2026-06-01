# Phase 1A: Execute Migrations - START HERE

**Date**: 2026-06-01  
**Objective**: Deploy 5 database migrations to staging environment  
**Time Estimate**: 15-20 minutes  
**Risk Level**: LOW (no data changes; schema-only)

---

## OPTION A: Quick Copy-Paste (Easiest)

### Step 1: Go to Supabase SQL Editor

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **SQL Editor** tab
3. Click **New Query**

### Step 2: Copy & Paste Consolidated SQL

1. Open file: `scripts/PHASE_1A_CONSOLIDATED_MIGRATIONS.sql`
2. Copy **ENTIRE** contents (from first `BEGIN;` to last comment)
3. Paste into Supabase SQL Editor
4. Click **Run** button

### Step 3: Verify Execution

```
Expected output at bottom:
✓ Query successful (X rows affected)
No errors
```

**If you see errors**:
- Note the error message
- Check the line number indicated
- Do NOT proceed; investigate before continuing

---

## OPTION B: Deploy Individual Migrations (Step-by-Step)

If you prefer to deploy one migration at a time:

### Migration 1: Create user_employee_links table

**File**: `supabase/migrations/20260601000000_create_user_employee_links.sql`

1. Go to SQL Editor → New Query
2. Copy contents of migration file
3. Paste and Run
4. Verify: In Schema Editor, look for table `user_employee_links` with 3 indexes ✓

### Migration 2: Add columns to service_reception_entries

**File**: `supabase/migrations/20260601010000_add_sa_employee_code_to_reception.sql`

1. Go to SQL Editor → New Query
2. Copy and Paste
3. Verify: Columns `sa_employee_code` + `sa_display_name` exist in service_reception_entries ✓

### Migration 3: Create helper functions

**File**: `supabase/migrations/20260601020000_create_sa_employee_code_function.sql`

1. Go to SQL Editor → New Query
2. Copy and Paste
3. Verify: Functions `my_sa_employee_code()` and `has_module_action()` exist ✓

### Migration 4: Fix RLS policies

**File**: `supabase/migrations/20260601030000_fix_reception_rls_policies.sql`

1. Go to SQL Editor → New Query
2. Copy and Paste
3. Verify: Old name-based policies removed; new employee-code policies created ✓

### Migration 5: Harden sensitive table RLS

**File**: `supabase/migrations/20260601040000_harden_sensitive_table_rls.sql`

1. Go to SQL Editor → New Query
2. Copy and Paste
3. Verify: RLS enabled on `employee_master` table ✓

---

## Verification Checklist (After Migrations)

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

| File | Purpose | Execution Method |
|------|---------|------------------|
| `PHASE_1A_CONSOLIDATED_MIGRATIONS.sql` | All 5 migrations combined | Copy-paste (easiest) |
| `20260601000000_create_user_employee_links.sql` | Linkage table | Individual |
| `20260601010000_add_sa_employee_code_to_reception.sql` | New columns | Individual |
| `20260601020000_create_sa_employee_code_function.sql` | Helper functions | Individual |
| `20260601030000_fix_reception_rls_policies.sql` | RLS policies | Individual |
| `20260601040000_harden_sensitive_table_rls.sql` | Sensitive table RLS | Individual |

---

**Status**: Ready to execute. No prerequisites needed.  
**Support**: If issues arise, check Troubleshooting section above.  
**After Completion**: Proceed to Phase 1B (Data Backfill).
