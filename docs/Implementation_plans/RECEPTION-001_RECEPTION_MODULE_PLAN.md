# RECEPTION-001 Reception Module Plan

## Objective
Create a new web module named Reception for front-desk intake with RBAC-controlled access, dealer-scoped data, and upload support aligned to the provided template fields.

## Authoritative Audit Baseline

### Web module state (audited)
- Existing web modules are wired in src/App.tsx as Import, Reports, Settings, Admin, AutoDoc.
- Route access is controlled by ROUTE_MODULE_MAP + get_all_my_permissions() in src/App.tsx.
- Module permissions are maintained in public.modules and public.user_module_permissions, surfaced via Admin page.

### DB state (audited from authoritative dump)
- Authority source: local_folder/backups/full_database.sql.
- public.modules currently contains ids 1-9 with names:
  - job_cards, invoices, parts_inventory, parts_orders, parts_consumption, employees, reports, admin, autodoc.
- No existing Reception table/module row found in authoritative dump.
- Existing dealer-scoped policy pattern uses public.my_dealer_code() and RLS on core tables.

## Reception Data Contract
Fields based on shared reference:
- created_at (auto)
- created_by (auto)
- source (dropdown values such as Self, Driver Pickup)
- reg_number
- model
- service_type
- sa_name
- jc_number
- owner_name
- owner_phone (10 digits)

## Implementation Plan

### Phase 1: Database and Security
1. Create table public.service_reception_entries.
2. Add constraints for required fields and owner_phone 10-digit validation.
3. Add created_at and updated_at audit timestamps.
4. Enable RLS and enforce dealer scoping via public.my_dealer_code().
5. Restrict CRUD with module permission check public.has_module_view('reception') or admin.
6. Seed/Upsert public.modules row for reception.

### Phase 2: API Layer
1. Add typed Reception API helpers in src/lib/api/reception.ts.
2. Implement list/create/update/delete operations.
3. Implement bulk import helper for XLSX/CSV upload.
4. Implement SA name lookup from employee_master where role indicates SA.

### Phase 3: Web Module UI
1. Add new page src/pages/ReceptionPage.tsx.
2. Add intake form with required validation.
3. Add editable/deletable data grid with audit columns.
4. Add import button for XLSX/CSV using header mapping.
5. Support both DB-style and label-style column names from templates.

### Phase 4: App Integration
1. Add nav item Reception in src/App.tsx.
2. Add module name and route to ROUTE_MODULE_MAP.
3. Add protected route /reception with RequireAccess wrapper.
4. Add Reception mention to access-denied help text.

### Phase 5: Validation
1. Run project build to verify type and route integrity.
2. Validate unauthorized users cannot access /reception.
3. Validate authorized users can create, edit, delete, and import records.

## Execution Status
- Phase 1: Completed (migration added)
- Phase 2: Completed
- Phase 3: Completed
- Phase 4: Completed
- Phase 5: In progress (build validation pending)

## Files Added/Updated for RECEPTION-001
- supabase/migrations/20260530195500_create_reception_module.sql
- src/lib/api/reception.ts
- src/lib/api/index.ts
- src/pages/ReceptionPage.tsx
- src/App.tsx
