# Admin Bypass in RLS Policies — Governance Rule

**Effective Date:** 2026-06-08  
**Authority:** RBAC Implementation Master Plan  
**Applies To:** All new and modified RLS policies in supabase/migrations/

## Rule: Every RLS Policy Must Include Admin Bypass

### Core Principle
**Admin users must never be blocked by role-specific or module-specific RLS checks.**

When a policy includes `has_module_*()` or role-specific scope checks, it MUST also include `is_admin() OR (original_logic)`.

### Pattern

**❌ WRONG** — Missing admin bypass:
```sql
CREATE POLICY policy_name ON table_name
FOR SELECT TO authenticated
USING (
  public.has_module_view('some_module')
  AND other_scope_check
);
```

**✅ CORRECT** — With admin bypass:
```sql
CREATE POLICY policy_name ON table_name
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('some_module')
    AND other_scope_check
  )
);
```

### When to Apply This Pattern

**ALWAYS add admin bypass when:**
- Policy uses `has_module_view()`, `has_module_modify()`, `has_module_delete()`, `has_module_action()` 
- Policy uses role-specific scope checks like `user_has_floor_incharge_scope_for_sa_code()` 
- Policy uses `user_has_employee_code()`, `user_has_technician_code()`, or similar identity checks
- Policy restricts access based on a specific module permission

**You CAN skip admin bypass when:**
- Policy is for public/unauthenticated read-only data (e.g., published content, reference tables)
- Policy is for tables with no sensitive data (e.g., lookup tables, enums)
- Policy checks `auth.uid()` for self-owned records (not module-based)

### Rationale

1. **Admin users need full access for testing, debugging, and management.**
   - They must validate flows across all modules without being blocked.
   - Without admin bypass, admin users are trapped by policies requiring module assignments.

2. **Prevents circular dependencies.**
   - Admin users can't be pre-assigned all modules at signup (defeats the purpose of RBAC).
   - Admin bypass lets them access everything immediately after authentication.

3. **Matches historical precedent.**
   - 2026-06-03 admin bypass migration applied admin bypass to dealer-bound policies.
   - This rule extends that pattern to ALL role-based policies.

### Migration Template

When creating or modifying policies, use this checklist:

```sql
-- 1. Identify the original policy logic
-- 2. Check if it has any has_module_* or role-specific checks
-- 3. If yes, wrap in: public.is_admin() OR (original_logic)
-- 4. If no, leave as-is

DROP POLICY IF EXISTS policy_name ON table_name;

CREATE POLICY policy_name ON table_name
FOR SELECT TO authenticated
USING (
  public.is_admin()  -- <-- ADD THIS FIRST
  OR (               -- <-- Add parens
    [original condition here]
  )
);
```

### Scope of Existing Policies

Policies updated with admin bypass (2026-06-08):
- `service_reception_select_floor_incharge` (Floor Incharge scoped rows)
- `service_reception_select_crm_dealer_scope` (CRM dealer scoped rows)
- `technician_assignments_select_rbac` (Floor Incharge module)
- `technician_assignments_insert_rbac` (Floor Incharge module)
- `technician_assignments_update_rbac` (Floor Incharge module)
- `technician_assignments_delete_rbac` (Floor Incharge module)
- `technician_assignments_select_sa_own_jobs` (Service Advisor scope)
- `technician_assignments_select_technician` (Technician self-view)

### Questions to Ask Before Creating a Policy

1. **Does this policy use `has_module_*()` or role-specific checks?** → Add admin bypass
2. **Can an admin need to debug/test this flow?** → Add admin bypass
3. **Is this a public/unauthenticated policy?** → Likely no bypass needed
4. **Is this a self-owned record (auth.uid() check)?** → Consider the context; if module-based enforcement too, add bypass

### Enforcement

- **Code Review:** Every migration adding/modifying an RLS policy must be reviewed for this pattern.
- **Validation:** Run `docs/Implementation_plans/rbac/runbooks/RLS_POLICY_AUDIT.sql` (TBD) to verify admin bypass coverage.
- **Testing:** Test admin user access on new/modified screens immediately after deploying policies.

---

**Maintained By:** Engineering Lead  
**Last Reviewed:** 2026-06-08  
**Next Review:** After next major RBAC tightening phase
