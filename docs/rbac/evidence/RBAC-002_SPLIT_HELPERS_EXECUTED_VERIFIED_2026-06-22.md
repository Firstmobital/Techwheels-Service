# RBAC-002 Split Helpers Executed/Verified Evidence

Date: 2026-06-22
Status: VERIFIED
Scope: service_reception_entries floor-incharge split helper contract
Authority: local_folder/backups/full_database.sql (audited via chunk mirror local_folder/backups/chunks/full_database.sql.part_*)

## Executed Artifact

1. supabase/migrations/20260622104000_split_service_bodyshop_floor_incharge_reception_helpers.sql

## Verification Artifact

1. supabase/sql_checks/20260622104000_split_service_bodyshop_floor_incharge_reception_helpers_checks.sql

## Authoritative Dump Audit Results

### 1) Split helper functions present

Source: local_folder/backups/chunks/full_database.sql.part_000

1. public.user_has_bodyshop_floor_incharge_scope_for_sa_code(text) present.
2. public.user_has_service_floor_incharge_scope_for_sa_code(text) present.

### 2) Reception policies re-pointed correctly

Source: local_folder/backups/chunks/full_database.sql.part_004

1. service_reception_select_floor_incharge uses:
   - public.user_has_service_floor_incharge_scope_for_sa_code(sa_employee_code)
2. service_reception_select_bodyshop_floor_incharge_v1 uses:
   - public.user_has_bodyshop_floor_incharge_scope_for_sa_code(sa_employee_code)

### 3) Admin bypass preserved

Source: local_folder/backups/chunks/full_database.sql.part_004

1. Both policies include public.is_admin() OR (...)

### 4) Module mapping verified

Source: local_folder/backups/chunks/full_database.sql.part_001

1. id=13, module=floor_incharge, display=Floor Incharge
2. id=18, module=bodyshop_floor, display=Bodyshop Floor

## Conclusion

The split helper migration contract is executed and verified in the authoritative fresh dump. Service and Bodyshop floor-incharge reception visibility are now independently scoped by dedicated helpers and dedicated policy predicates, with admin bypass intact.
