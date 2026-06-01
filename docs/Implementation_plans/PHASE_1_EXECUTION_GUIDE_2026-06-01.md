# Phase 1 Execution Guide: RBAC Implementation with CRM Alias Strategy

**Date**: 2026-06-01  
**Purpose**: Complete guide for implementing Phase 1 with proper handling of immutable CRM identities

---

## CRITICAL CONCEPT: Identity vs Display Name

### Three Layers of Identity

1. **CRM Layer (Immutable)**
   - `employee_master.employee_code` = **SA_CODE** (e.g., `AB_3000840`)
   - `employee_master.employee_name` = **SA_NAME** (e.g., `JAIN, ARJHANT`)
   - **Never changes.** System of record from vehicle service operations.

2. **Auth Layer (User Signup)**
   - `users.full_name` = **Display Name** (e.g., `Deepak Sharma`)
   - This is what the user enters during signup.
   - Can change if user updates their profile.

3. **Linkage Layer (Canonical)**
   - `user_employee_links.employee_code` = SA_CODE from CRM (immutable reference)
   - Creates stable mapping: `user_id` → `employee_code` (never breaks)

### Data Storage in service_reception_entries

| Column | Source | Usage | Mutability |
|--------|--------|-------|-----------|
| `sa_name` | CRM import | Audit trail only (for debugging/reference) | Immutable |
| `sa_employee_code` | Matched from employee_master | **RLS filtering, access control** | Immutable (references CRM) |
| `sa_display_name` | Cached from users.full_name | **UI display label only** | Can be stale if user renames |

### RLS Policy Rule
```
RLS filters ONLY by: sa_employee_code = my_sa_employee_code()
NEVER by: sa_name or sa_display_name
```

---

## Execution Steps

### Phase 1A: Schema Migrations (In Sequence)

Execute these 5 migrations in order via Supabase dashboard or CLI:

```bash
# 1. Create user_employee_links table
supabase db push supabase/migrations/20260601000000_create_user_employee_links.sql

# 2. Add sa_employee_code + sa_display_name columns
supabase db push supabase/migrations/20260601010000_add_sa_employee_code_to_reception.sql

# 3. Create my_sa_employee_code() + has_module_action() functions
supabase db push supabase/migrations/20260601020000_create_sa_employee_code_function.sql

# 4. Fix RLS policies (action semantics + employee-code filtering)
supabase db push supabase/migrations/20260601030000_fix_reception_rls_policies.sql

# 5. Harden RLS on sensitive tables
supabase db push supabase/migrations/20260601040000_harden_sensitive_table_rls.sql
```

**After execution**: Verify schema in Supabase:
- Table `user_employee_links` exists with indexes
- Column `sa_employee_code` + `sa_display_name` exist in `service_reception_entries`
- Functions `my_sa_employee_code()` + `has_module_action()` exist

### Phase 1B: Data Backfill (In Sequence)

Run these scripts in Supabase SQL Editor:

#### Step 1: Diagnostic Report (Read-Only)
```sql
-- File: scripts/01_backfill_sa_name_matcher_diagnostic.sql
-- This shows matches/ambiguities WITHOUT modifying data
```

**Output to review**:
- EXACT_MATCHES: Entries matched by name = name
- FIRST_NAME_MATCHES: Entries matched by first name only
- UNMATCHED: Entries with no matching employee
- DETAILED_AMBIGUOUS_CASES: Entries with multiple possible matches

**Action**: If ambiguities exist, admin manually decides mapping. Otherwise, proceed.

#### Step 2: Populate Reception Entries
```sql
-- File: scripts/02_backfill_populate_sa_employee_code.sql
-- This populates sa_employee_code + sa_display_name
```

**Populates**:
- `sa_employee_code` ← `employee_master.employee_code` (CRM SA_CODE)
- `sa_display_name` ← `users.full_name` (signup name)

**Verify output**: Check coverage % and any unresolved entries.

#### Step 3: Seed User-Employee Links
```sql
-- File: scripts/03_backfill_seed_user_employee_links.sql
-- This creates initial mappings for SA users
```

**Creates**:
- `user_employee_links` rows: one per SA user with primary mapping to their employee_code

**Action**: Review any users without mappings (listed in output); manually assign if needed.

#### Step 4: Validate Integrity
```sql
-- File: scripts/04_backfill_validate_integrity.sql
-- Checks for orphans, FKs, coverage
```

**Must pass**:
- ✓ No orphaned `sa_employee_code` values
- ✓ All FKs intact
- ✓ >95% coverage of SA users with mappings
- ✓ No duplicate primary mappings

---

## Phase 1C: API Changes

### Endpoint 1: List User-Employee Mappings
```typescript
// GET /api/admin/user-employee-links
// Returns: { user_id, user_email, user_full_name, employee_code, employee_name, dealer_code, is_primary, is_active }
// Auth: Admin only
```

### Endpoint 2: Create/Assign Mapping
```typescript
// POST /api/admin/user-employee-links
// Body: { user_id, employee_code, dealer_code, is_primary }
// Returns: created mapping
// Auth: Admin only
// Validation: Ensure exactly one active primary per user+dealer
```

### Endpoint 3: Update Mapping Status
```typescript
// PUT /api/admin/user-employee-links/:id
// Body: { is_primary, is_active }
// Auth: Admin only
// Guard: Cannot deactivate if SA has assigned unresolved rows
```

### Reception Entry APIs (No Change to Signatures)
```typescript
// POST /api/reception/entries
// Body: { ..., sa_employee_code, ... }  // NEW: explicit employee_code
// Backend: Derive sa_display_name from user.full_name at time of assignment
// Backend: Derive sa_name from employee_master.employee_name for cache/audit

// IMPORTANT: When creating reception entry, admin selects SA by display name,
// but internally stores employee_code for all RLS filtering
```

---

## Phase 1D: Frontend Changes

### AdminPage.tsx: Add User-Employee Mapping Tab

**New Section**: "User-Employee Mapping"

```typescript
// Component: AdminMappingTab
// Displays:
// - User signup display name (from users.full_name)
// - Currently assigned employee_code + employee_name (CRM SA_NAME)
// - Dealer selector
// - Controls: Assign, Deactivate, View audit trail

// Behavior:
// - Admin selects user → dropdown of available employees (by SA_NAME from employee_master)
// - On assign: Creates user_employee_links with selected employee_code
// - On deactivate: Sets is_active=false (soft delete, preserves audit trail)
// - Cannot deactivate if SA has pending assigned rows (guards against data stranding)
```

### ReceptionForm/ServiceAdvisorPage: Display Name Only

**Change**: When rendering SA selector or assignment field:

```typescript
// OLD (BAD):
<select>{employees.map(e => <option value={e.sa_name}>{e.sa_name}</option>)}</select>

// NEW (GOOD):
// 1. Get list of SA users via API: get_all_my_permissions() → filter service_advisor
// 2. Look up user.full_name from users table (display name)
// 3. Get their employee_code via user_employee_links (internal)
<select>
  {saUsers.map(user => 
    <option value={user.employee_code}>{user.full_name} ({user.employee_code})</option>
  )}
</select>

// On form submit:
// - Store sa_employee_code (the value)
// - Backend derives sa_display_name + sa_name from employee_master lookup
```

---

## Phase 1E: Testing Checklist

### Unit Tests
- [ ] `my_sa_employee_code()` returns correct code for mapped user
- [ ] `my_sa_employee_code()` returns NULL for unmapped user
- [ ] `has_module_action('module', 'view')` returns correct boolean
- [ ] `has_module_action('module', 'modify')` returns correct boolean
- [ ] `has_module_action('module', 'delete')` returns correct boolean

### Integration Tests (Staging)
- [ ] SA user with active mapping sees only assigned reception rows (filtered by employee_code)
- [ ] SA user without mapping sees zero rows
- [ ] SA user with view-only permission cannot INSERT/UPDATE (RLS blocks)
- [ ] SA user with modify permission CAN UPDATE assigned rows (by employee_code)
- [ ] SA user cannot UPDATE rows with different sa_employee_code (RLS blocks)
- [ ] Reception staff with modify permission can create rows with any SA assignment
- [ ] Direct Supabase API query without permission returns 0 rows (RLS enforces)

### E2E Tests (Staging)
- [ ] Admin creates user (signup with full_name = "John Doe")
- [ ] Admin assigns SA permission (module: service_advisor, can_view=true)
- [ ] Admin assigns user to employee_code "AB_123456" (CRM SA_CODE)
- [ ] User logs in → sees "John Doe" in profile (display name from signup)
- [ ] User navigates to Service Advisor page → sees only rows with sa_employee_code='AB_123456'
- [ ] User updates assigned row → RLS allows (has modify + ownership check)
- [ ] Admin unassigns user (deactivates mapping)
- [ ] User logs in again (after cache clear) → sees zero rows
- [ ] Admin reassigns user to different employee_code → user sees new set of rows

### Performance Tests
- [ ] SA query with 1000 reception entries <100ms
- [ ] Permission check on every request <10ms
- [ ] Index on (dealer_code, sa_employee_code) is used by planner

---

## Handling Edge Cases

### Case 1: User Updates Their Full Name
**Scenario**: User changes full_name in profile from "John Doe" to "John Smith"

**Impact on rows**:
- `sa_employee_code` unchanged (immutable, points to CRM)
- `sa_display_name` becomes stale (cached value)
- RLS still works (uses sa_employee_code, not display_name)

**Mitigation**:
- Background job updates `sa_display_name` for user's assigned rows (low priority)
- Or: Accept stale display name; it's only for UI convenience

### Case 2: CRM Updates SA_NAME
**Scenario**: CRM changes SA_NAME from "JAIN, ARJHANT" to "JAIN, ARJUN" (typo correction)

**Impact on rows**:
- `sa_name` field updates (from CRM sync)
- `sa_employee_code` unchanged (still points by code)
- RLS unaffected

**Mitigation**: OK to ignore. `sa_name` is audit-only.

### Case 3: CRM Retires Employee (SA_CODE no longer in use)
**Scenario**: Employee leaves; SA_CODE "AB_123456" is archived

**Impact**:
- Old rows still reference `sa_employee_code='AB_123456'` (historical data)
- New rows cannot be assigned to that code (no matching employee_master row)
- RLS still works

**Mitigation**:
- Don't delete from employee_master; mark `is_active=false` if needed
- Or: Accept that historical rows have no current employee match (expected)

---

## Rollout Checklist

- [ ] All migrations executed in staging
- [ ] All backfill scripts run and validated
- [ ] Unit tests passing
- [ ] Integration tests passing (staging)
- [ ] E2E tests passing (staging)
- [ ] Admin can assign/revoke mappings via UI (no SQL)
- [ ] SA users can view/update assigned rows (RLS enforces)
- [ ] Performance benchmarks met (<100ms)
- [ ] Migration runbook documented (see RBAC_IMPLEMENTATION_MASTER_2026-06-01.md)
- [ ] Rollback plan ready
- [ ] Operations team trained
- [ ] Monitoring alerts set up
- [ ] Production window scheduled (off-peak)

---

## Post-Rollout Validation (24h Window)

- [ ] Monitor error logs for permission denials (should be zero unexpected denials)
- [ ] Check SA user login success rate (should be 100%)
- [ ] Spot-check 5 random SA users: verify they see correct assigned rows
- [ ] Check admin mapping UI: verify no errors during assign/revoke
- [ ] Performance: confirm query times still <100ms under load
- [ ] Document any incidents; rollback if needed

---

## Reference: Data Model Recap

```sql
-- CRM-sourced (immutable)
employee_master.employee_code       -- SA_CODE e.g., "AB_3000840"
employee_master.employee_name       -- SA_NAME e.g., "JAIN, ARJHANT"

-- User signup (mutable by user)
users.full_name                     -- Display name e.g., "Deepak Sharma"

-- Canonical linkage (stable)
user_employee_links.employee_code   -- Reference to CRM SA_CODE
user_employee_links.user_id         -- Reference to auth user

-- Reception assignment (dual-tracked)
service_reception_entries.sa_employee_code   -- Immutable identity (RLS uses this)
service_reception_entries.sa_display_name    -- Cached display (UI only)
service_reception_entries.sa_name            -- Original CRM value (audit)
```

---

**Next Phase**: Once Phase 1 is verified in production, proceed to Phase 2 (Floor Incharge, expanded role support).
