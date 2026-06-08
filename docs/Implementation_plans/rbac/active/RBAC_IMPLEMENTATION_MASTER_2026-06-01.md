# RBAC Dynamic Access Control — Master Implementation Plan

**Version**: 2026-06-01  
**Status**: Phase 1C In Progress - Admin Unrestricted Access Hardening Verified (Targeted Policy Families)  
**Owner**: Engineering Lead / Copilot (TBD)  
**Last Updated**: 2026-06-08 08:20 UTC  
**Authority**: Single source of truth — supersedes all separate RBAC plan files

### Execution Update (2026-06-08)

- Security Advisor error-elimination track completed (Errors = 0) via four executed migrations:
  - `20260608100000_p0_fix1_enable_rls_job_card_closed_data.sql`
  - `20260608101500_p0_fix2_set_vw_parts_stock_health_security_invoker.sql`
  - `20260608103000_p0_fix3_enable_rls_user_links_audit_logs.sql`
  - `20260608104500_p0_fix4_enable_rls_remaining_tables_baseline.sql`
- Full pre-tightening compatibility audit completed across:
  - Web frontend query paths (`src/**`)
  - Mobile frontend query paths (`mobile/src/**`)
  - Authoritative database mirror (`local_folder/backups/chunks/full_database.sql.part_*`)

Authoritative findings (current mirror wins over older assumptions):
- All previously flagged RLS-disabled tables exist and are now RLS-enabled in mirror.
- Current mirror policy text now contains both families on the same table domains:
  - `admin_unrestricted_all_ops_v1` (admin bypass)
  - `p0_auth_select/insert/update/delete` (broad authenticated baseline)
- RBAC helper functions used by frontend remain present in mirror:
  - `is_admin`, `has_module_view`, `has_module_modify`, `has_module_delete`, `get_all_my_permissions`, `my_dealer_code`, `my_sa_employee_code`, `user_has_employee_code`.

No-break compatibility constraints locked before tightening:
- Do not remove authenticated read continuity for report-critical tables used in both web and mobile:
  - `service_vas_jc_data`, `service_invoice_data`, `service_invoice_order_data`, `warranty_*`.
- Preserve settings pendency resolver workflow rights:
  - `import_employee_mapping_issues` read/update
  - `service_vas_jc_data` targeted update for employee-code backfill.
- Preserve floor-incharge mobile listing continuity:
  - `open_job_cards` SELECT.
- Preserve auth/dealer-context linkage behavior:
  - `user_employee_links` must keep admin CRUD and self-scope read paths required by auth resolution logic.

Tightening execution contract (starting next phase):
- Replace `p0_auth_*` policies table-by-table, never all at once.
- For each table batch, create scoped replacement policy first, then remove broad policy.
- Validate impacted screens (web + mobile) immediately after each batch before continuing.
- If any conflict appears between docs and mirror policy text, mirror policy text is authoritative.

Progress update (2026-06-08, staged tightening):
- Step 1 (warranty domain) validated PASS.
- Step 2 (service domain) validated PASS with `p0_auth_delete` now constrained to `is_admin()` OR `has_module_delete('reports')` on:
  - `service_vas_jc_data`
  - `service_jc_parts_data`
  - `service_invoice_data`
  - `service_invoice_order_data`
- Step 3 (import/reconciliation domain) validated PASS:
  - `import_employee_mapping_issues` delete constrained to `is_admin()` OR `has_module_delete('employees')`
  - `pending_drive_uploads` delete constrained to `is_admin()` OR `has_module_delete('job_cards')`
  - `open_job_cards_import_staging` delete constrained to `is_admin()` OR `has_module_delete('job_cards')`
- Step 4 (operational/staging domain) executed:
  - `cancel_job_card` delete constrained to `is_admin()` OR `has_module_delete('reception')` OR `has_module_delete('job_cards')`
  - `closed_but_not_invoiced` delete constrained to `is_admin()` OR `has_module_delete('reports')` OR `has_module_delete('job_cards')`
  - `open_job_cards` delete constrained to `is_admin()` OR `has_module_delete('reception')` OR `has_module_delete('job_cards')`
  - `job_card_closed_data_duplicates_backup` delete constrained to `is_admin()` OR `has_module_delete('reports')` OR `has_module_delete('job_cards')`
  - Baseline policy continuity check passed (`p0_auth_select/insert/update` present on all 4 tables)
  - RLS confirmation passed (`rls_enabled = true`) on all 4 tables
- Staged `p0_auth_delete` tightening track status: COMPLETE (Step 1 through Step 4 validated)
- P0-04 anon-surface restriction complete (0/0/0 post-migration confirmation).
- P0-05 leaked-password protection rollout checklist prepared: `docs/Implementation_plans/supabase/runbooks/SUPABASE_P0_05_LEAKED_PASSWORD_ROLLOUT_CHECKLIST.md`; queued for auth validation
- P0-04 pre-check baseline captured (before dashboard restriction):
  - `public_policy_rows = 25`
  - `anon_table_grants = 322`
  - `anon_function_grants = 31`
  - Observed `{public}`-role policy families on: `documents`, `estimate_rows`, `job_cards`, `email_logs`, `panel_photos`, `panels`, `modules`, `users`, `user_module_permissions`, `vehicles`.
  - DB-level migration executed: `20260608182000_p0_04_restrict_anon_public_surface.sql`
  - Post-migration result: `0 / 0 / 0` (complete anon surface elimination from baseline 25/322/31)
  - Status: COMPLETE — anon policy paths re-scoped to `authenticated` only; all anon object grants revoked

### Execution Update (2026-06-01)

- All 5 Phase 1A migrations were executed successfully in Supabase SQL Editor (1→5 in order).
- Fresh post-migration dump created at local_folder/backups/full_database.sql.
- Authority advanced forward to local_folder/backups/full_database.sql and must never downgrade to older snapshots.
- Latest full_database.sql refresh remains authoritative after superadmin parity updates.
- Malformed admin user (id 1661d961-d73d-411e-9eab-cff26bbc048b) deleted and dump refreshed 2026-06-01.
- Authority: local_folder/backups/full_database.sql (post-cleanup, final state for Phase 1B).
- Multi-code ownership migration executed: 20260601154000_enable_multi_employee_code_visibility.sql.
- Reception app-layer migration to `sa_employee_code` implemented (web API/UI). Existing rows still require backfill/edit if code is null.
- Dealer-context mismatch root cause identified: `service_reception_entries.dealer_code` defaults to `my_dealer_code()` at insert time.
- Mitigation executed: 20260601170500_make_sa_visibility_dealer_agnostic.sql (dealer-agnostic SA visibility active).
- SA update blocker root cause identified: trigger function `enforce_service_reception_sa_update()` still used legacy `sa_name` ownership check.
- Mitigation executed: 20260601173000_fix_sa_update_guard_to_employee_code.sql (trigger guard now employee-code based).
- Floor Incharge technician assignment options are now restricted to Employee Master rows with `role = TECHNICIAN` (web + mobile parity).
- Floor Incharge visibility requirement clarified: screen rows must render by Floor Incharge role and fuel-type scope, with fuel-type differentiation derived from employee mapping (`SA CODE` -> role + fuel_type in Employee Master).
- Floor Incharge row-scope migration executed: 20260601194000_add_floor_incharge_fuel_scope_policy_scaffold.sql.
- Floor Incharge stage-column migration executed: 20260601200500_add_floor_incharge_stage_columns_and_harden_assignments.sql.
- Technician module app wiring completed (`/technician` route, sidebar visibility by module permission, protected route guard).
- Technician page implemented with super-admin selector: admin can choose any `TECHNICIAN` from Employee Master and view selected technician rows + day-wise earnings.
- Technician RBAC migration executed: 20260601212000_add_technician_module_and_visibility_policies.sql.
- Fresh full dump regenerated after Technician rollout; authority remains: local_folder/backups/full_database.sql (never downgrade).
- Admin Set Dealer popup contract clarified and locked: popup updates fallback dealer metadata only; it must not create/update `user_employee_links` mappings.
- Dealer scope precedence documented for frontend auth resolution: mapping first, then metadata fallback, then users-table fallback.
- Cross-layer precedence drift identified for follow-up: SQL `my_dealer_code()` may still resolve metadata before mapping depending on deployed migration order; this must be aligned before production hardening.

### Execution Update (2026-06-03)

- Migration executed in Supabase SQL Editor: `20260603170500_admin_unrestricted_rls_bypass.sql`.
- Policy hardening objective: active admin users should not be blocked by dealer-bound RLS predicates on touched tables.
- Tables/policy families touched by this execution include dealer-bound policies on:
  - `public.service_parts_order_data`
  - `public.service_reception_entries`
  - `public.settings_model_options`
  - `public.vehicles`
  - `storage.objects` (autodoc bucket policies)
- Frontend alignment completed for admin-unrestricted module/scope handling:
  - `src/lib/api/auth.ts` (admin scope source path)
  - `src/App.tsx` (admin module-access unblock for route guards)
  - `src/pages/ServiceAdvisorPage.tsx` (canonical admin detection via `users.role` + `is_active`)
- Post-execution verification completed using `20260603171500_admin_unrestricted_rls_bypass_verify.sql` with expected admin-bypass policy counts:
  - `public.service_parts_order_data` = 4
  - `public.service_reception_entries` = 4
  - `public.settings_model_options` = 4
  - `public.vehicles` = 3
  - `storage.objects` = 4
- Verification conclusion: targeted dealer-bound policy families now include explicit `public.is_admin()` bypass and are considered hardened for Phase 1C scope.
- Remaining governance step: include this verified state in the next authoritative dump refresh and policy text re-audit from `local_folder/backups/full_database.sql`.

### Execution Update (2026-06-05)

- Re-audited authoritative schema/policies from `local_folder/backups/full_database.sql` (mirror: `local_folder/backups/chunks/full_database.sql.part_*`).
- Confirmed active Service Advisor SELECT policy is currently employee-code scoped:
  - `service_reception_select_sa` uses `public.user_has_employee_code(sa_employee_code)`.
- Confirmed CRM exists as an Employee Master role value (`employee_master.role = CRM`) and CRM-linked users can have `service_advisor` module view/modify permissions.
- Identified access gap: CRM users are limited to self-mapped employee rows, not dealer-wide rows, which conflicts with operational requirement for dealer-scope visibility.
- **Migration executed 2026-06-05 (SQL Editor)** — Version 1 (initial dealer_code approach):
  - File: `supabase/migrations/20260605163000_add_crm_dealer_scope_for_service_advisor.sql`
  - Initial attempt: helper function `public.user_has_crm_dealer_scope(text)` checking row's dealer_code column.
  - Issue identified: rows don't have dealer_code reliably populated; policy failed to grant access.
  - Root cause: Reliance on `dealer_code` column (which may be NULL or misaligned) instead of proven pattern.
- **Migration executed 2026-06-05 (SQL Editor)** — Version 3 (Final - Both Format Support):
  - File: `supabase/migrations/20260605163000_add_crm_dealer_scope_for_service_advisor.sql`
  - Initial attempt (v1): Used `dealer_code` column approach (failed—column unreliable).
  - Second attempt (v2): Used role-based check only (security issue—org-wide access instead of dealer-scoped).
  - Final version (v3): Helper function `public.user_is_crm_for_dealer_sa()` checks both SA code formats:
    - Format 1: `500A840_131` → Extract dealer from position 1 (before underscore)
    - Format 2: `EPM_500A840` → Extract dealer from position 2 (after underscore)
  - Logic: User has CRM role AND dealer code matches either split position
  - Policy `service_reception_select_crm_dealer_scope`:
    - Condition: `has_module_view('service_advisor') AND sa_employee_code IS NOT NULL AND user_is_crm_for_dealer_sa(sa_employee_code)`
    - Semantic: CRM users see all SA-assigned rows in their dealer (dealer-scoped, not org-wide).
  - Verification script: `supabase/migrations/20260605165500_verify_crm_policy_update.sql`
- Safety boundary preserved:
  - Existing SA update policy remains employee-code scoped (`service_reception_update_sa`) — no broadening of write scope without explicit approval.
  - Existing admin bypass via `is_admin()` remains unchanged.
  - Receipt module policy `service_reception_select_rbac` remains unchanged (dealer-scoped for reception module users).
- Policy family count for service_reception_entries SELECT: now 4
  1. `service_reception_select_rbac` (reception module users, dealer-scoped)
  2. `service_reception_select_sa` (service_advisor module users, employee-code scoped — unchanged)
  3. `service_reception_select_crm_dealer_scope` (service_advisor module + CRM role, dealer-scoped — NEW)
  4. `service_reception_select_floor_incharge` (floor_incharge module users, fuel-type scoped)
- **Verification executed 2026-06-05**:
  - Both migrations executed in Supabase SQL Editor (20260605163000 Version 3, 20260605165500).
  - Data assessment: 437 total service_reception_entries rows; 266 have non-NULL `sa_employee_code`.
  - CRM policy pattern analysis: Identified two SA employee code formats:
    - Numeric first: `500A840_131` (dealer code before underscore)
    - Text first: `EPM_500A840` (dealer code after underscore)
  - CRM helper function `user_is_crm_for_dealer_sa()` updated to handle both formats:
    - Checks if dealer code matches `split_part(..., '_', 1)` OR `split_part(..., '_', 2)`
    - Ensures dealer-scoped visibility (not organization-wide)
  - CRM policy now grants visibility to all rows where SA employee code contains user's mapped dealer code
  - Frontend updated: [src/pages/ServiceAdvisorPage.tsx](src/pages/ServiceAdvisorPage.tsx) detects CRM dealer-wide access:
    - Shows "All dealer vehicles" when user sees multiple SA employee codes (CRM pattern).
    - Shows "My assigned vehicles" when user sees only self-assigned sa_employee_code (SA pattern).
    - Updated description reflects broader dealer-wide responsibility.
  - Status: ✓ COMPLETE — CRM dealer-scoped visibility enabled; both SA code formats supported; frontend labels updated.

### Execution Update (2026-06-06)

- Authoritative policy re-audit performed from `local_folder/backups/full_database.sql` and mirror `local_folder/backups/chunks/full_database.sql.part_*`.
- Confirmed production mismatch: `service_reception_select_crm_dealer_scope` granted dealer-scope visibility for CRM users, but `service_reception_update_sa` remained employee-code scoped only.
- Symptom reproduced in Service Advisor UI: rows visible under CRM dealer-scope could not be marked done (`invoice_done_at` update failed).
- Migration prepared to align UPDATE scope with visible-row semantics for users with `service_advisor` modify rights:
  - `supabase/migrations/20260606173000_align_service_advisor_update_with_visible_rows.sql`
  - Policy behavior after migration:
    - `service_reception_update_sa` allows UPDATE when `has_module_modify('service_advisor')` AND `sa_employee_code IS NOT NULL` AND (`user_has_employee_code(sa_employee_code)` OR `user_is_crm_for_dealer_sa(sa_employee_code)`).
- Frontend gating in `src/pages/ServiceAdvisorPage.tsx` was aligned with module modify permissions to avoid contradictory UI disablement for rows that are policy-eligible.
- Governance note: this is an intentional write-scope broadening for CRM dealer-scope operations and supersedes the 2026-06-05 "no broadening of write scope" note for Service Advisor UPDATE only.

### Superadmin Default Access Policy (Locked)

- Superadmin model in this project is users.role = admin with is_active = true.
- All active admin users must always have full permissions (view/modify/delete) on all active modules.
- Any newly created or newly activated module must be auto-granted to all active admins without manual action.
- Any user promoted to active admin must be auto-granted all active modules without manual action.

### Dealer-Code Business Semantics (Locked)

- Dealer code is the operational identity for branch + fuel-type context in this dealership setup.
- Current known semantics from CRM:
  - Dealer code containing `3000840` => Branch = Sitapura, Fuel Type = PV
  - Dealer code containing `500A840` => Branch = Sitapura, Fuel Type = EV
  - Dealer code containing `3001440` => Branch = Ajmer Road, Fuel Type = PV
- One signed-up user can legitimately map to multiple employee codes and multiple dealer codes.
- Mapping is not restricted to SA-only users; any employee role can be linked via `user_employee_links`.
- Future dealer codes (example: Ajmer Road + EV) must be handled as configuration data, not hardcoded logic.

### Documentation Governance (No Confusion Policy)

- This file is the canonical implementation and status tracker.
- Phase-1 split docs were removed after migration completion to prevent duplicate guidance.
- Do not create additional phase markdown files unless explicitly requested.

### Immediate Next Steps (Phase 1C)

1. Complete reception form migration to `sa_employee_code` selectors.
2. Add dynamic Dealer Code Profile catalog in Admin UI (branch/fuel metadata per dealer code pattern).
3. Enforce mapping validation against Dealer Code Profile rules (UI + API).
4. Run staging test matrix for multi-mapping users across multiple dealer codes.
5. Complete staging verification that Floor Incharge dropdowns exclude non-TECHNICIAN roles in web and mobile.
6. Validate Floor Incharge row-scope filter by (`role = Floor Incharge`) + matching `fuel_type` context resolved from mapped `SA CODE`.
7. Wire web/mobile UI to persist new stage fields (`bay_no`, `work_status`, `out_ts`, `time_diff`, `remark`) from technician_assignments.

---

## EXECUTIVE SUMMARY

### Current State
Phase 1B is complete (schema + backfill strategy + RLS + superadmin hardening). Current focus is Phase 1C application integration and dynamic controls:

1. **Dealer-code semantics locked** — Branch/fuel meaning now explicitly tied to CRM dealer-code patterns
2. **Multi-mapping model active** — One user may map to multiple employee codes/dealer codes, including cross fuel-type contexts
3. **Mapping UI/API baseline delivered** — Employee mapping tab and API layer are implemented; staging validation remains
4. **Reception UI migration pending** — Reception forms still need end-to-end `sa_employee_code` selection flow
5. **Dealer-code profile catalog pending** — Need dynamic Admin-managed rules for future dealer codes (no hardcoding)

**Risk**: Authenticated users can access/modify data outside intended scope if they bypass UI controls.

### Target State
- **One-way identity flow**: auth user → employee code (via `user_employee_links`) → module permissions → row ownership
- **Action-based RBAC**: view/modify/delete semantics enforced uniformly at DB + UI layers
- **Stable row ownership**: SA visibility guaranteed by employee_code, not mutable name
- **Dynamic module catalog**: Frontend consumes permissions from DB, not hardcoded maps
- **Centralized Admin control**: Single workspace for all governance (users, permissions, mappings, employee master)

### CRITICAL CONCEPT: Three-Layer Identity Model

**Problem**: CRM SA_CODE/SA_NAME are immutable but users have signup names; old system used name matching (fragile).

**Solution**: Separate concerns into three canonical layers:

| Layer | Source | Identity | Mutability | Usage |
|-------|--------|----------|-----------|-------|
| **CRM** | Imported from vehicle system | `employee_code` (SA_CODE), `employee_name` (SA_NAME) | Immutable | System of record; never changes |
| **Auth** | User signup form | `users.full_name` (Display Name) | Can change | UI display label for SA assignment |
| **Linkage** | Admin assignment | `user_employee_links.employee_code` | Immutable (FK to CRM) | **RLS filtering**: the canonical identity for row ownership |

**In service_reception_entries**:
- `sa_employee_code` = **Immutable CRM reference** (used in RLS policy)
- `sa_display_name` = **Cached signup name** (UI display only, can be stale)
- `sa_name` = **Original CRM value** (audit trail, never for logic)

**RLS Rule (Target)**: Filter by employee-code membership (`user_has_employee_code(sa_employee_code)`), never by name.

### Scope
- **Phase 1 (This Cycle)**: Service Advisor identity, reception row ownership, permission semantics hardening
- **Phase 2 (Future)**: Floor Incharge, Reception Staff, multi-role expansion
- **Phase 3 (Future)**: Time-bounded access, delegation, comprehensive audit trails

---

## PART 1: AUTHORITATIVE AUDIT FINDINGS

### 1.1 Codebase Audit (Frontend & API)

**File**: [src/App.tsx](src/App.tsx)
- **Hardcoded ROUTE_MODULE_MAP** (lines 120+): Maps routes to modules manually; adding modules requires code edit
- **Hardcoded NAV_ITEMS** (lines 24+): Navigation items hardcoded based on role enum, not dynamic from DB
- **RequireAccess component** (lines 190-205): Checks permission only at route level; per-action checks delegated to page components

**File**: [src/pages/AdminPage.tsx](src/pages/AdminPage.tsx)
- **Role enum hardcoded** (line 6): `UserRole = 'admin'|'manager'|'staff'|'viewer'`
- **Permission UI** (lines 714-718): Role values hardcoded in radio buttons; no dynamic role catalog
- **User-Employee mapping**: Completely absent; no UI to link users to employees

**File**: [src/pages/ServiceAdvisorPage.tsx](src/pages/ServiceAdvisorPage.tsx)
- **No per-action permission checks** (lines 91-140): Save/upload buttons always enabled; relies solely on RLS
- **Dependent on `my_sa_name()` function** for row filtering (RLS layer)

**File**: [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)
- **Employee role as free text** (line 114, 140): Role stored as arbitrary string (`"sa"`, `"service advisor"`, `"Service Advisor"` all treated equally)
- **SA discovery via string matching** (line 198-209): Lists employees by role field with loose case-insensitive comparison

**File**: [src/lib/api/reception.ts](src/lib/api/reception.ts)
- **`listServiceAdvisorEntries()`**: Uses generic `select('*')` with RLS filtering; no application-layer employee-code lookup
- **`listReceptionSaNames()`** (line 209): Matches SA names via lowercase role field comparison
- **No `sa_employee_code` column**: All SA assignments today via `sa_name` text field

### 1.2 Authoritative Dump Audit (Schema & Policies)

**Source**: local_folder/backups/full_database.sql (post-migration snapshot, refreshed 2026-06-01)

#### Schema Facts
| Table | Rows | Key Findings |
|-------|------|---|
| `public.users` | 8 | id, email, full_name, role (enum check), branch, is_active. **Missing**: no user_id in employee_master |
| `public.employee_master` | 41 | employee_code (unique), employee_name, location, department, fuel_type, role (freetext), timestamps. **Missing**: no user_id FK |
| `public.user_module_permissions` | 63 | user_id FK, module_id FK, can_view, can_modify, can_delete, granted_by FK, granted_at. Unique (user_id, module_id) |
| `public.modules` | — | name (unique), label, description, icon, route, sort_order, is_active, created_at |
| `public.service_reception_entries` | 2 | dealer_code, reg_number, model, sa_name, sa_employee_code, sa_display_name, jc_number, owner_name, owner_phone, source, created_by, created_at, updated_at, remark, estimate_* fields |
| `public.user_employee_links` | 0+ | Table now exists with user_id/employee_code/dealer_code mapping + active/primary flags |

#### Policy Semantics Status
| Policy | Current | Broken | Should Be |
|--------|---------|--------|-----------|
| `service_reception_entries` INSERT | `has_module_modify('reception')` | ✓ Fixed | `has_module_modify('reception')` |
| `service_reception_entries` UPDATE | `has_module_modify('service_advisor')` | ✓ Fixed | `has_module_modify('service_advisor')` |
| `service_reception_entries` DELETE | `has_module_delete('reception')` | ✓ Fixed | `has_module_delete('reception')` |

#### SA Identity Binding (Fragile)
- **`public.my_sa_name()` function** (dump line ~1353):
  - Derives from `auth.jwt()->>'full_name'` OR `users.full_name` OR email localpart
  - Returns name as string only (not stable ID)
- **RLS comparison** (dump line ~1400+):
  - SA policy: `service_reception_entries.sa_name = my_sa_name()`
  - Lowercase comparison: `LOWER(sa_name) = LOWER(my_sa_name())`
- **Risk**: Name changes, formatting differences, or lookup failures silently break visibility

#### Technician Assignment Identity (Current App-Layer Guard)
- Floor Incharge assignment dropdowns (web + mobile) now source users from `employee_master` where `role = 'TECHNICIAN'` (case-insensitive).
- Guard exists at app layer today and should remain aligned with future role-catalog normalization.
- This prevents accidental assignment to SA/CRM/other non-technician roles.

#### Floor Incharge Row Visibility Scope (Authoritative Requirement)
- Floor Incharge screen row rendering must be constrained by user scope: `role = Floor Incharge`.
- Fuel-type differentiation must be enforced for displayed rows based on Employee Master mapping resolved through `SA CODE`.
- Canonical identity path: `auth user -> user_employee_links.employee_code (SA CODE) -> employee_master(role, fuel_type)`.
- Operational rule: a Floor Incharge user should see only rows within their permitted fuel_type scope (for their mapped SA CODE context).
- This is separate from technician assignment dropdown filtering (which remains `role = TECHNICIAN`).

#### Privilege Posture
- Broad `GRANT ALL ON TABLE ... TO authenticated` on:
  - employee_master
  - users
  - modules
  - user_module_permissions
  - service_reception_entries
- **Implication**: Effective protection 100% dependent on RLS policies; no implicit deny at privilege layer
- **Status**: RLS policies exist but have semantic gaps (above table)

#### Functions Present
- `get_all_my_permissions()`: Returns available modules with permission bits
- `get_my_permissions(p_module)`: Returns specific module permission
- `is_admin()`: Checks users.role = 'admin' AND is_active
- `has_module_view/modify/delete(p_module)`: Action-based checks

#### Object Status
- **`user_employee_links` table**: Created
- **`sa_employee_code` + `sa_display_name` columns**: Added to service_reception_entries
- **`my_sa_employee_code()` + `has_module_action()`**: Created
- **employee_master RLS hardening**: Applied
- **Audit log table**: Not yet implemented (future enhancement)

### 1.3 Cardinality Gap Confirms Distinct Domains
From dump COPY sections:
- `employee_master`: 41 rows
- `users`: 8 rows  
- **Implication**: Many operational employees are not app-auth users. This is correct for service operations; forces us to distinguish security identity (users) from operational identity (employees).

---

## PART 2: TARGET ARCHITECTURE

### 2.1 Canonical Data Model

#### New Table: `public.user_employee_links`
```sql
CREATE TABLE public.user_employee_links (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_code text NOT NULL REFERENCES public.employee_master(employee_code) 
    ON UPDATE CASCADE ON DELETE RESTRICT,
  dealer_code text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Uniqueness constraints
  UNIQUE (user_id, employee_code, dealer_code)
);

CREATE INDEX idx_user_employee_links_user_id ON public.user_employee_links(user_id);
CREATE INDEX idx_user_employee_links_employee_code ON public.user_employee_links(employee_code);
CREATE UNIQUE INDEX uq_user_employee_links_primary_active_per_dealer
  ON public.user_employee_links(user_id, dealer_code)
  WHERE is_primary = true AND is_active = true;
```

**Purpose**: Stable 1:N mapping from auth user to employee identities; supports multi-dealer and multi-role users.

#### Modification: `public.service_reception_entries`
```sql
ALTER TABLE public.service_reception_entries
  ADD COLUMN sa_employee_code text REFERENCES public.employee_master(employee_code);

CREATE INDEX idx_service_reception_sa_lookup 
  ON public.service_reception_entries(dealer_code, sa_employee_code, created_at DESC);
```

**Purpose**: Replace mutable name-based assignment with stable employee code reference. Keep `sa_name` for backward compatibility/display.

#### New Helper Functions

**Function 1: `public.my_sa_employee_code()`**
```sql
CREATE OR REPLACE FUNCTION public.my_sa_employee_code()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT uel.employee_code
  FROM public.user_employee_links uel
  WHERE uel.user_id = auth.uid()
    AND uel.is_primary = true
    AND uel.is_active = true
    AND uel.dealer_code = public.my_dealer_code()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.my_sa_employee_code() IS 
  'Resolve current user''s primary SA employee code for their dealer. 
   Returns NULL if no active mapping exists.';
```

**Function 2: `public.has_module_action(p_module text, p_action text)`**
```sql
CREATE OR REPLACE FUNCTION public.has_module_action(p_module text, p_action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE LOWER(p_action)
    WHEN 'view' THEN public.has_module_view(p_module)
    WHEN 'modify' THEN public.has_module_modify(p_module)
    WHEN 'delete' THEN public.has_module_delete(p_module)
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.has_module_action(text, text) IS
  'Unified action-based permission check. p_action: view|modify|delete.';
```

#### Optional: `public.role_catalog`
```sql
CREATE TABLE public.role_catalog (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  scope text, -- 'user' or 'employee'
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT role_catalog_key_lower CHECK (key = LOWER(key))
);

INSERT INTO public.role_catalog (key, label, scope, is_active) VALUES
  ('admin', 'System Administrator', 'user', true),
  ('manager', 'Manager', 'user', true),
  ('staff', 'Staff', 'user', true),
  ('viewer', 'Viewer', 'user', true),
  ('sa', 'Service Advisor', 'employee', true),
  ('floor_incharge', 'Floor Incharge', 'employee', true),
  ('reception', 'Reception', 'employee', true);
```

**Purpose**: Govern employee and user role values; replace free-text role fields with catalog keys.

### 2.2 RLS Policy Standard

**For all module-backed tables**, follow this pattern:

```sql
-- SELECT: requires view permission
CREATE POLICY {table}_select_rbac ON {table}
  FOR SELECT TO authenticated
  USING (
    public.my_dealer_code() = {table}.dealer_code
    AND public.has_module_view('{module_name}')
  );

-- INSERT: requires modify permission
CREATE POLICY {table}_insert_rbac ON {table}
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_dealer_code() = {table}.dealer_code
    AND public.has_module_modify('{module_name}')
  );

-- UPDATE: requires modify permission (both USING and WITH CHECK)
CREATE POLICY {table}_update_rbac ON {table}
  FOR UPDATE TO authenticated
  USING (
    public.my_dealer_code() = {table}.dealer_code
    AND public.has_module_modify('{module_name}')
  )
  WITH CHECK (
    public.my_dealer_code() = {table}.dealer_code
    AND public.has_module_modify('{module_name}')
  );

-- DELETE: requires delete permission
CREATE POLICY {table}_delete_rbac ON {table}
  FOR DELETE TO authenticated
  USING (
    public.my_dealer_code() = {table}.dealer_code
    AND public.has_module_delete('{module_name}')
  );
```

**For SA-specific row ownership:**

```sql
-- SELECT: own assigned rows only
CREATE POLICY service_reception_select_sa ON public.service_reception_entries
  FOR SELECT TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_view('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );

-- UPDATE: own assigned rows only
CREATE POLICY service_reception_update_sa ON public.service_reception_entries
  FOR UPDATE TO authenticated
  USING (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  )
  WITH CHECK (
    dealer_code = public.my_dealer_code()
    AND public.has_module_modify('service_advisor')
    AND sa_employee_code = public.my_sa_employee_code()
  );
```

### 2.3 Frontend Dynamic Module Control

**Replace hardcoded ROUTE_MODULE_MAP with data-driven approach:**

1. **On auth**, frontend calls `get_all_my_permissions()` once → caches result
2. **Build nav**: Filter cached permissions by `can_view=true` → display menu items with label/icon from modules table
3. **Route guards**: Check permission in cache before navigating; RLS enforces final control at API
4. **Local registry**: Keep route-to-component mapping (technical, not permission logic)

**Benefits**:
- Adding/removing modules no longer requires code changes
- Permission changes take effect immediately on re-auth
- Semantic clarity: permission logic is data-driven, not hardcoded

### 2.4 Admin UX Enhancements

Add bounded sections inside Admin workspace:

1. **Users & Authentication** — Manage app login accounts (create, deactivate, reset password)
2. **Workforce / Employee Master** — Manage operational employees (import CSV, edit roles, manage branches/departments)
3. **Roles & Module Permissions** — Assign module permissions to users (checkboxes for view/modify/delete per user+module)
4. **User-Employee Mapping** — Link each user to their active primary employee code(s) per dealer
5. **Module Catalog** — Create/disable modules (technical: name, label, route, sort_order)
6. **Dealer Code Profiles** — Configure dealer code pattern -> branch + fuel type metadata (editable in Admin, used by mapping/reception forms)

---

## PART 3: IMPLEMENTATION PHASES

### Phase 1: Service Advisor Identity & Semantics (CURRENT CYCLE)

#### 1.1 Schema Migrations

**Authoritative Source**: Individual files in `supabase/migrations/20260601*.sql` (tracked in version control; executed in Supabase SQL Editor)

- **Migration 1** (`20260601000000_create_user_employee_links.sql`): Create `user_employee_links` table with 3 indexes
- **Migration 2** (`20260601010000_add_sa_employee_code_to_reception.sql`): Add `sa_employee_code` + `sa_display_name` columns + 2 indexes
- **Migration 3** (`20260601020000_create_sa_employee_code_function.sql`): Create `my_sa_employee_code()` + `has_module_action()` helper functions
- **Migration 4** (`20260601030000_fix_reception_rls_policies.sql`): Drop old name-based SA policies; create new employee-code-based policies with correct action semantics
- **Migration 5** (`20260601040000_harden_sensitive_table_rls.sql`): Enable RLS on `employee_master`; add admin-only policies
- **Migration 6** (`20260601154000_enable_multi_employee_code_visibility.sql`): Update SA policies to support multiple active employee-code mappings per user/dealer

**Important**: Do NOT create duplicate consolidated SQL files. Individual migration files are the single source of truth to prevent drift.

#### 1.2 Data Backfill & Validation
- **Script 1**: Match existing `sa_name` values to `employee_master.employee_name` (normalized: trim, lowercase, compare)
- **Script 2**: Produce report: matched / ambiguous / unmatched cases
- **Script 3**: Manual resolution of ambiguous cases (admin reviews and decides)
- **Script 4**: Populate `sa_employee_code` for resolved reception entries (unresolved → NULL)
- **Script 5**: Create `user_employee_links` seed from identified SA users + matched employee codes
- **Script 6**: Validate backfill (check FKs, no orphans, coverage %)

#### 1.3 RLS Policy Migration

Included in **Migration 4** (`20260601030000_fix_reception_rls_policies.sql`):
- Drop old name-based SA policies (`service_reception_select_sa_v1`, `service_reception_update_sa_v1`, old reception policies)
- Create new employee-code-based SA policies (filter by `sa_employee_code = my_sa_employee_code()`)
- Fix reception INSERT/UPDATE/DELETE policies to use correct action semantics (`can_modify`/`can_delete` instead of `can_view` for writes)
- Add RLS to sensitive tables via **Migration 5** (`20260601040000_harden_sensitive_table_rls.sql`)

#### 1.4 API Changes
- **Reception create/update**: Accept `sa_employee_code` from payload; store and backfill `sa_name` from employee_master for display
- **Service Advisor list**: Already filtered by RLS; no app-layer changes needed
- **Admin mapping APIs**: Create CRUD endpoints for `user_employee_links` (list, create, update, deactivate)
- **SA RLS support for multi-code users**: Membership helper (`user_has_employee_code`) checks all active mappings for current dealer
- **Dealer code profile APIs**: Create CRUD endpoints for dealer-code pattern metadata (branch, fuel_type, is_active)

#### 1.5 Frontend Changes
- **Admin**: Add "User-Employee Mapping" tab (assign/revoke primary mapping per user/dealer)
- **Admin**: Add "Dealer Code Profiles" tab for dynamic branch/fuel mapping rules (no code deploy required for new codes)
- **Reception form**: Display/set `sa_employee_code` selector; derive display `sa_name` from employee master
- **Service Advisor page**: No logic changes; data already filtered at DB via RLS
- **App.tsx**: Begin removing hardcoded ROUTE_MODULE_MAP; use permission results instead

#### 1.6 Testing & Verification
- **Unit**: Functions `my_sa_employee_code()` and `has_module_action()` return correct values
- **Integration**: SA with mapping sees only assigned rows; SA without mapping sees nothing
- **Integration**: User with view-only permission cannot create/update/delete
- **E2E**: Admin assigns user-employee mapping → SA logs in → verifies visibility
- **E2E**: SA cannot modify rows outside assignment via direct API
- **Integration**: Floor Incharge technician list includes only `employee_master.role = TECHNICIAN` users
- **E2E**: Non-technician employees never appear in technician assignment dropdown (web + mobile)
- **Integration**: Floor Incharge row list is filtered by `role = Floor Incharge` scope and mapped `fuel_type`
- **E2E**: Floor Incharge user with PV scope sees only PV rows; EV scope sees only EV rows
- **Security**: Direct RLS bypass attempt (e.g., raw Supabase query) returns zero rows
- **Performance**: SA filter query executes <100ms

---

## PART 4: ACTIVITY TRACKER

Use this section as the real-time status dashboard. Update immediately after each completed task.

### 4.1 Schema & Migrations

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 1.1 | Create `user_employee_links` migration | ✓ Done | Copilot | 2026-06-01 | File: 20260601000000_create_user_employee_links.sql; 3 indexes | ☑ |
| 1.2 | Create `sa_employee_code` + `sa_display_name` migration | ✓ Done | Copilot | 2026-06-01 | File: 20260601010000_add_sa_employee_code_to_reception.sql; 2 indexes | ☑ |
| 1.3 | Create `my_sa_employee_code()` + `has_module_action()` functions | ✓ Done | Copilot | 2026-06-01 | File: 20260601020000_create_sa_employee_code_function.sql | ☑ |
| 1.4 | Fix RLS policies (action semantics + employee-code filtering) | ✓ Done | Copilot | 2026-06-01 | File: 20260601030000_fix_reception_rls_policies.sql | ☑ |
| 1.5 | Harden sensitive table RLS (employee_master, etc.) | ✓ Done | Copilot | 2026-06-01 | File: 20260601040000_harden_sensitive_table_rls.sql | ☑ |
| 1.6 | Review all 5 migrations for syntax/correctness | ✓ Done | Copilot | 2026-06-01 | All files reviewed; syntax correct | ☑ |
| 1.7 | Execute migrations in staging DB | ✓ Done | User | 2026-06-01 | Executed successfully in SQL Editor in order 1→2→3→4→5 | ☑ |
| 1.8 | Test schema integrity post-migration | ✓ Done | User | 2026-06-01 | Post-run checks passed during execution flow | ☑ |
| 1.9 | Create fresh authoritative full dump | ✓ Done | User | 2026-06-01 | local_folder/backups/full_database.sql refreshed after migrations | ☑ |
| 1.10 | Enforce superadmin auto-grant defaults | ✓ Done | Copilot + User | 2026-06-01 | File: 20260601080000_enable_superadmin_auto_module_grants.sql; parity verified (12/12/12 for active admins) | ☑ |
| 1.11 | Deactivate malformed duplicate admin user | ✓ Done | User | 2026-06-01 | User id 1661d961-d73d-411e-9eab-cff26bbc048b set to viewer + inactive | ☑ |
| 1.12 | Delete malformed admin user from database | ✓ Done | User | 2026-06-01 | Harddelete of id 1661d961-d73d-411e-9eab-cff26bbc048b and all references | ☑ |
| 1.13 | Update AdminPage to hide inactive users by default | ✓ Done | Copilot | 2026-06-01 | File: src/pages/AdminPage.tsx; added showInactive toggle; inactive users filtered by default | ☑ |
| 1.14 | Create fresh authoritative full dump post-cleanup | ✓ Done | User | 2026-06-01 | local_folder/backups/full_database.sql refreshed; authority locked post-malformed-user deletion | ☑ |
| 1.15 | Enable multi-employee-code SA ownership policies | ✓ Done | User + Copilot | 2026-06-01 | Migration 20260601154000 executed in Supabase SQL Editor | ☑ |
| 1.16 | Make SA visibility dealer-agnostic (employee-code driven) | ✓ Done | User + Copilot | 2026-06-01 | Migration 20260601170500 executed and verified via pg_policies/function checks | ☑ |
| 1.17 | Fix SA update guard to employee-code ownership | ✓ Done | User + Copilot | 2026-06-01 | Migration 20260601173000 executed; trigger function verified in DB | ☑ |
| 1.18 | Add Floor Incharge role+fuel scoped select policy scaffold | ✓ Done | User + Copilot | 2026-06-01 | Migration 20260601194000 executed in SQL Editor | ☑ |
| 1.19 | Add Floor Incharge stage columns + assignment RLS hardening | ✓ Done | User + Copilot | 2026-06-01 | Migration 20260601200500 executed in SQL Editor | ☑ |

### 4.2 Data Backfill & Validation

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 2.1 | Choose fresh-start path (delete legacy reception rows) | ✓ Done | User | 2026-06-01 | Legacy reception entries removed via 20260601050000 migration | ☑ |
| 2.2 | Run fresh-start migration (cleanup + seed) | ✓ Done | User | 2026-06-01 | File: 20260601050000_fresh_start_cleanup_and_seed_user_employee_links.sql | ☑ |
| 2.3 | Resolve remaining unmapped SA users manually | 🟡 In Progress | Admin | 2026-06-01 | Deepak mapped via 20260601060000; Riteshmamodiya blocked (no employee_master record yet) | ☐ |
| 2.4 | Validate mapping integrity and unmapped count | ✓ Done | User | 2026-06-01 | Verification executed in 20260601060000; current expected unmapped count = 1 (Ritesh) | ☑ |
| 2.6 | Decide Ritesh handling path | ✓ Done | Admin | 2026-06-01 | Chosen Option B: keep as superadmin/admin without SA mapping until employee_master record exists | ☑ |
| 2.5 | Archive/remove obsolete backfill scripts | ✓ Done | Copilot | 2026-06-01 | Removed scripts/01_backfill_sa_name_matcher_diagnostic.sql and scripts/02_backfill_populate_sa_employee_code.sql | ☑ |

### 4.3 RLS Policy Hardening

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 3.1 | Create migration to drop old SA name-based policies | ✓ Done | Copilot | 2026-06-01 | Included in 20260601030000_fix_reception_rls_policies.sql | ☑ |
| 3.2 | Create migration for new employee-code-based SA policies | ✓ Done | Copilot | 2026-06-01 | Included in 20260601030000_fix_reception_rls_policies.sql | ☑ |
| 3.3 | Create migration to fix reception write policies | ✓ Done | Copilot | 2026-06-01 | Reception write policies now use modify/delete semantics | ☑ |
| 3.4 | Audit all user-facing tables for RLS coverage | ✓ Done | Copilot | 2026-06-01 | Audit completed from authoritative dump and policies reviewed | ☑ |
| 3.5 | Create/harden RLS on identified sensitive tables | ✓ Done | Copilot | 2026-06-01 | Included in 20260601040000_harden_sensitive_table_rls.sql | ☑ |
| 3.6 | Test all policies in staging with test users | ⚪ Not Started | TBD | — | Verify view/modify/delete semantics | ☐ |
| 3.7 | Test SA policy: user with mapping sees assigned rows only | ⚪ Not Started | TBD | — | Staging, full data set | ☐ |
| 3.8 | Test SA policy: user without mapping sees nothing | ⚪ Not Started | TBD | — | Staging | ☐ |

### 4.4 API & Backend Changes

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 4.1 | Update `listServiceAdvisorEntries()` API | ⚪ Not Started | TBD | — | RLS now enforces filtering; app-layer no change needed | ☐ |
| 4.2 | Update reception entry create payload | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/reception.ts (`createReceptionEntry`) with employee-code validation | ☑ |
| 4.3 | Update reception entry edit payload | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/reception.ts (`updateReceptionEntry`) with employee-code validation | ☑ |
| 4.4 | Create admin API: list user-employee mappings | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/userEmployeeLinks.ts (`listUserEmployeeLinks`) | ☑ |
| 4.5 | Create admin API: create user-employee mapping | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/userEmployeeLinks.ts (`createUserEmployeeLink`) with validation | ☑ |
| 4.6 | Create admin API: update mapping (is_primary, is_active) | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/userEmployeeLinks.ts (`updateUserEmployeeLink`) | ☑ |
| 4.7 | Create admin API: deactivate mapping | ✓ Done | Copilot | 2026-06-01 | Implemented in src/lib/api/userEmployeeLinks.ts (`deactivateUserEmployeeLink`) | ☑ |
| 4.8 | Test APIs in staging with varied permission sets | ⚪ Not Started | TBD | — | Admin, SA, reception staff | ☐ |
| 4.9 | Create dealer-code profile APIs (list/create/update/deactivate) | ⚪ Not Started | TBD | — | Dynamic branch/fuel mapping by dealer code pattern | ☐ |
| 4.10 | Add API validation for multi-code users across one dealership | ⚪ Not Started | TBD | — | Allow multiple employee codes per user; enforce active primary per dealer_code | ☐ |

### 4.5 Frontend Changes

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 5.1 | Create AdminMappingTab component | 🟡 In Progress | Copilot | 2026-06-01 | Integrated directly in AdminPage.tsx; extract to component pending | ☐ |
| 5.2 | Add mapping tab to AdminPage.tsx | ✓ Done | Copilot | 2026-06-01 | Added Employee Mappings tab + create/toggle/deactivate controls | ☑ |
| 5.3 | Update reception entry form | ✓ Done | Copilot | 2026-06-01 | Implemented in src/pages/ReceptionPage.tsx (employee code selector + import parser updates) | ☑ |
| 5.4 | Update service advisor page (if UI changes needed) | ⚪ Not Started | TBD | — | RLS enforces filtering; display already works | ☐ |
| 5.5 | Add validation: admin cannot remove active mapping if SA has assigned rows | ⚪ Not Started | TBD | — | Prevent data stranding | ☐ |
| 5.6 | Test permission gating in dev with test users | ⚪ Not Started | TBD | — | Verify nav/route guards work | ☐ |
| 5.7 | Add Dealer Code Profiles tab in Admin UI | ⚪ Not Started | TBD | — | Manage dealer code pattern -> branch/fuel metadata | ☐ |
| 5.8 | Auto-suggest branch/fuel in mapping + reception forms from dealer-code profile | ⚪ Not Started | TBD | — | Dynamic behavior for new dealer codes | ☐ |
| 5.9 | Restrict Floor Incharge dropdown to TECHNICIAN role (web) | ✓ Done | Copilot | 2026-06-01 | src/pages/FloorInchargePage.tsx now filters employee_master by role technician | ☑ |
| 5.10 | Restrict Floor Incharge dropdown to TECHNICIAN role (mobile) | ✓ Done | Copilot | 2026-06-01 | mobile/src/app/(tabs)/floor-incharge.tsx now filters employee_master by role technician | ☑ |
| 5.11 | Define Floor Incharge row-scope contract (role + fuel_type via SA CODE) | ✓ Done | Copilot + User | 2026-06-01 | Documented as authoritative requirement in this master plan | ☑ |
| 5.12 | Implement Floor Incharge row filtering by mapped fuel_type (web) | ✓ Done | Copilot + User | 2026-06-01 | DB policy scaffold executed + web dedicated query path wired | ☑ |
| 5.13 | Implement Floor Incharge row filtering by mapped fuel_type (mobile) | 🟡 In Progress | Copilot + User | 2026-06-01 | DB policy active; mobile path validation/wiring pending against new stage fields | ☐ |

### 4.6 Testing & Validation

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 6.1 | Unit test: `my_sa_employee_code()` returns correct code | ⚪ Not Started | TBD | — | With/without active mapping | ☐ |
| 6.2 | Unit test: `has_module_action('module', 'view')` etc. | ⚪ Not Started | TBD | — | All action types | ☐ |
| 6.3 | Integration test: SA with view-only cannot create row | ⚪ Not Started | TBD | — | RLS blocks INSERT | ☐ |
| 6.4 | Integration test: SA with modify can update assigned row | ⚪ Not Started | TBD | — | RLS allows UPDATE if owner | ☐ |
| 6.5 | Integration test: SA cannot update unassigned row | ⚪ Not Started | TBD | — | RLS blocks UPDATE if not owner | ☐ |
| 6.6 | E2E test: Admin assigns mapping → SA logs in → sees data | ⚪ Not Started | TBD | — | Full flow in staging | ☐ |
| 6.7 | E2E test: Deactivate mapping → SA sees nothing | ⚪ Not Started | TBD | — | Cache clear / re-auth | ☐ |
| 6.8 | Security test: Direct Supabase query without permission → 0 rows | ⚪ Not Started | TBD | — | Verify RLS enforces | ☐ |
| 6.9 | Performance test: SA filter query <100ms | ⚪ Not Started | TBD | — | With 41 employees, 2-100 reception rows | ☐ |
| 6.10 | Integration test: web Floor Incharge excludes non-technician roles in dropdown | ⚪ Not Started | TBD | — | Verify only TECHNICIAN role options shown | ☐ |
| 6.11 | Integration test: mobile Floor Incharge excludes non-technician roles in picker | ⚪ Not Started | TBD | — | Verify only TECHNICIAN role options shown | ☐ |
| 6.12 | Integration test: web Floor Incharge PV/EV row filtering by mapped SA CODE scope | ⚪ Not Started | TBD | — | Verify rows match mapped fuel_type for Floor Incharge role | ☐ |
| 6.13 | Integration test: mobile Floor Incharge PV/EV row filtering by mapped SA CODE scope | ⚪ Not Started | TBD | — | Verify rows match mapped fuel_type for Floor Incharge role | ☐ |
| 6.14 | Integration test: OUT TS auto-captures only on completed status | ⚪ Not Started | TBD | — | Validate trigger sync + check constraint behavior | ☐ |
| 6.15 | Integration test: time_diff auto-populates from assigned_at to out_ts | ⚪ Not Started | TBD | — | Validate generated column on completed transitions | ☐ |

### 4.7 Rollout & Documentation

| # | Task | Status | Owner | Due | Notes | Verified |
|---|------|--------|-------|-----|-------|----------|
| 7.1 | Write migration runbook (step-by-step for ops) | ⚪ Not Started | TBD | — | Pre-flight, execute, rollback | ☐ |
| 7.2 | Write rollback plan | ⚪ Not Started | TBD | — | If needed in first 48h | ☐ |
| 7.3 | Create staging validation checklist | ⚪ Not Started | TBD | — | Sign-off gate before prod | ☐ |
| 7.4 | Execute migrations in production (off-peak) | ⚪ Not Started | Ops | — | Coordinate with team | ☐ |
| 7.5 | Monitor production 24h post-migration | ⚪ Not Started | Ops | — | Watch error logs, permission denials | ☐ |
| 7.6 | Update user docs & runbooks | ⚪ Not Started | TBD | — | For admin/SA operators | ☐ |
| 7.7 | Remove legacy name-based fallback (v2, post-validation) | ⚪ Not Started | TBD | — | After verified success | ☐ |
| 7.8 | Document long-term RBAC/auth/visibility guardrails in master plan | ✓ Done | Copilot | 2026-06-03 | Added Part 8A operations playbook (scope precedence, popup contract, troubleshooting, drift controls) | ☑ |

---

## PART 5: ACCEPTANCE CRITERIA

**Phase 1 completion checklist** (all must be true):

- ✓ **Schema**: `user_employee_links`, `sa_employee_code`, `my_sa_employee_code()` all deployed
- ⚪ **Data**: 100% of SA users have active primary mappings; ambiguous cases logged and resolved
- ✓ **Semantics**: `can_view`/`can_modify`/`can_delete` enforced uniformly at DB layer for reception policies
- ⚪ **Ownership**: SA row visibility fully verified by employee_code after backfill completion
- ⚪ **Security**: Direct API queries from unauthorized users validated via staging test matrix
- ⚪ **Admin UX**: Non-technical admin can manage user-employee mappings via UI without SQL
- ⚪ **Testing**: All tests in Part 4.6 passing in staging environment
- ⚪ **Performance**: All permission checks complete <10ms (p99) with production-like load
- ⚪ **Production**: Migrated and monitored successfully; zero permission-related incidents first 48h

---

## PART 6: KNOWN RISKS & MITIGATIONS

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Ambiguous `sa_name` → `employee_code` matches | Silent misassignment of SA rows | Medium | Log all candidates; manual review queue; unresolved → NULL (no visibility) |
| Existing workflows bypass UI, rely on loose grants | Permission enforcement broken on policy hardening | Low | Stage policy changes with feature flag; 48h rollback window; parallel UI validation |
| JWT token caches old permissions after mapping change | Stale visibility until re-auth | Medium | Document re-login requirement; admin UI shows "re-auth recommended" banner after changes |
| Performance regression on new filter column | Slow SA queries | Low | Index (dealer_code, sa_employee_code, created_at); benchmark <100ms before prod |
| Backfill data corruption (bad data → schema) | Data integrity loss | Very Low | Dry-run all scripts on staging; review output; keep backup pre-migration dump |
| RLS policy syntax error | Authentication broken for all users | Low | Test in staging; peer review; rollback plan ready |

---

## PART 7: SUCCESS METRICS

- **Deployment velocity**: Phase 1 complete in ≤5 working days
- **Zero security incidents**: No permission-related breaches post-rollout (30-day window)
- **Coverage**: 100% of employee-mapped and reception flows using new model within 7 days
- **Admin usability**: Zero helpdesk tickets on mapping UI (first 14 days)
- **Performance**: All permission checks <10ms (p99); no regression vs baseline
- **Adoption**: 100% of SA users re-authenticated and verified visible within 24h of rollout

---

## PART 8: REFERENCES & RELATED DOCS

- **Authoritative dump**: local_folder/backups/full_database.sql (source of all schema/policy facts)
- **Codebase**: src/App.tsx, src/pages/{AdminPage,ServiceAdvisorPage,SettingsPage}.tsx, src/lib/api/reception.ts
- **Related modules**: reception, service_advisor (Phase 1); floor_incharge, admin (Phase 2)
- **Deployment**: Will be created in docs/Implementation_plans/ before production rollout

---

## PART 8A: FUTURE RBAC/AUTH/VISIBILITY OPERATIONS PLAYBOOK

This section captures implementation guardrails that must remain stable across future refactors, onboarding, and incident response.

### 8A.1 Scope Source of Truth Order (Required)

For application-layer visibility resolution (frontend/API helper path), use this precedence and keep it explicit in code and docs:

1. **Mappings first**: active `user_employee_links` for the authenticated user
2. **Metadata fallback**: `auth.users.raw_user_meta_data` / JWT (`dealer_code`, optional `dealer_codes`)
3. **Users-table fallback**: `public.users.dealer_code` only for compatibility mode

Rationale:
- Mapping is the canonical operational scope because it ties auth user to Employee Master identity and dealer context.
- Metadata is a fallback only (for users with missing mappings or transitional states).
- Users-table fallback is temporary compatibility and should not become a new source of truth.

### 8A.2 Set Dealer Popup Contract (Required)

Admin -> Users -> Dealer popup behavior must remain bounded:

- Allowed:
  - Update fallback dealer metadata fields (auth metadata / JWT path)
  - Optionally mirror display columns in `public.users` where those columns exist
- Not allowed:
  - Creating/updating/deactivating `user_employee_links`
  - Any implicit "sync to mappings" behavior

Mapping lifecycle belongs only to Admin -> Mappings, seeded/validated against Employee Master.

### 8A.3 Visibility Resolution Rules (Do Not Regress)

- Module-level visibility is deny-by-default and must come from `user_module_permissions` (`can_view`).
- Row-level visibility is always RLS-enforced; frontend guards are UX only.
- SA ownership checks use `sa_employee_code` membership, never `sa_name` or `sa_display_name`.
- Floor Incharge visibility remains role+fuel-scope constrained through mapped employee/dealer context.

### 8A.4 Cross-Layer Drift Watchlist

Known high-risk drift: dealer precedence mismatch between app layer and SQL helper functions.

- App-layer helper path currently resolves mapping before metadata.
- SQL helper function `my_dealer_code()` may resolve metadata before mapping (depending on deployed version).

If these diverge, symptoms include:
- UI showing one scope while SQL/RLS enforces another
- "No rows" in one module but visible rows in another for same user
- Inconsistent behavior immediately after dealer metadata updates

Mitigation requirement:
- Keep one documented precedence contract and align both app helper code and SQL helper functions to it.

### 8A.5 Troubleshooting Checklist (Visibility Incidents)

When a user reports missing or excess data visibility, validate in this order:

1. User is active (`users.is_active = true`)
2. Module permission exists (`can_view` for target module)
3. At least one active mapping exists for user/dealer in `user_employee_links`
4. Expected primary mapping state per dealer (if primary-dependent flow)
5. Dealer code on target rows matches resolved scope
6. User re-authenticated after metadata/mapping changes (JWT refresh)
7. No stale compatibility fallback masking missing mapping

Operational note:
- Do not "fix" by broadening permissions first. Validate identity linkage and scope resolution before changing ACL.

### 8A.6 Future Hardening Targets

Short-term:
- Add automated parity check that compares app-resolved dealer scope vs SQL-resolved scope for test users.
- Add admin diagnostics panel showing scope source (`mapping` | `metadata` | `users_table`) for current user.

Mid-term:
- Remove `users_table` dealer fallback after full mapping adoption.
- Move to multi-dealer aware SQL helper(s) where required by module queries.

Long-term:
- Add immutable audit events for permission grants/revocations and mapping changes.
- Add time-bounded access grants with automatic expiry and reason codes.

---

## PART 9: SIGN-OFF & HISTORY

| Version | Date | Author | Status | Notes |
|---------|------|--------|--------|-------|
| 1.0 | 2026-06-01 | Engineering Lead (TBD) | Draft | Consolidated from 3 separate plans; ready for Phase 1 kickoff |
| 1.1 | 2026-06-01 | Copilot + User | Active | Phase 1A migrations executed; authoritative dump refreshed; moved to Phase 1B |
| 1.2 | 2026-06-01 | Copilot + User | Active | Phase 1B completed; dealer-code business semantics locked; Phase 1C dynamic employee mapping requirements updated |
| 1.3 | 2026-06-01 | Copilot + User | Active | Added TECHNICIAN role parity documentation for Floor Incharge dropdown filtering (web + mobile) |
| 1.4 | 2026-06-01 | Copilot + User | Active | Added authoritative Floor Incharge row visibility requirement: role = Floor Incharge with fuel_type scope via SA CODE mapping |
| 1.5 | 2026-06-01 | Copilot + User | Active | Executed Floor Incharge DB migrations for row-scope policy and stage workflow columns/triggers/RLS |
| 1.6 | 2026-06-03 | Copilot + User | Active | Added Part 8A future operations playbook for RBAC/auth/visibility (scope precedence, popup contract, drift watchlist, troubleshooting/hardening targets) |

---

**This document is the single source of truth for RBAC implementation.**  
**All previous separate RBAC plan files (RBAC_SA_DYNAMIC_CONTROL_PLAN_2026-06-01.md, RBAC_FULL_DUMP_AUDIT_2026-06-01.md, RBAC_MASTER_IMPLEMENTATION_PLAN_2026-06-01.md) are superseded and should be archived.**

Last updated: 2026-06-03  
Next review: After Phase 1C reception form + dealer-code profile delivery
