# RBAC-003: Business Roles CSV — Full Audit Evidence

**Plan ID:** RBAC-003  
**Audit Date:** 2026-07-18  
**Authority:** `supabase/backups/full_metadata.sql` (schema/functions/RLS)  
**Row data note:** `employee_master` TABLE DATA empty in workspace `full_dump.sql`; live distribution not verified.

---

## 1) Schema Truth

```sql
-- employee_master.role
role text  -- nullable, no format constraint
COMMENT: 'Role label for employee assignment, RBAC mapping, and dropdown filtering.'
```

Related tables:

| Table | Role relevance |
|---|---|
| `user_employee_links` | Login user → employee_code (multi-link supported) |
| `income_role_scope` | PK includes `employee_role`; matched against `em.role` |
| `users.role` | Platform Role — **not** Business Role |

Triggers on `employee_master` (none modify `role`):

- `trg_apply_sa_business_mapping_on_employee_master`
- `trg_normalize_employee_master_department`
- `trg_employee_master_updated_at`

---

## 2) SQL Functions Reading `employee_master.role`

| Function | Line ref (metadata) | Pattern | Roles |
|---|---|---|---|
| `get_my_bodyshop_employee_scope()` | ~3205 | Returns `em.role` raw | Pass-through |
| `can_access_bodyshop_surveyor_settings()` | ~2031 | `s.role IN ('SA','EDP','SURVEY')` | SA, EDP, SURVEY |
| `can_view_bodyshop_surveyor_catalog()` | ~2122 | Same | SA, EDP, SURVEY |
| `user_has_crm_dealer_scope()` | ~9423 | `em.role = 'crm'` | crm |
| `user_is_crm_for_dealer_sa()` | ~9582 | `crm_em.role = 'crm'` | crm |
| `user_is_crm_for_sa_code()` | ~9626 | `em.role = 'crm'` | crm |
| `user_has_technician_code()` | ~9551 | `em.role = 'technician'` | technician |
| `user_has_floor_incharge_scope_for_sa_code()` | ~9482 | `fi.role IN ('floor incharge','floor_incharge')` | floor incharge |
| `user_has_service_floor_incharge_scope_for_sa_code()` | ~9516 | Same + dept SERVICE | floor incharge |
| `user_has_bodyshop_floor_incharge_scope_for_sa_code()` | ~9352 | Same + dept BODYSHOP | floor incharge |
| `is_income_assignment_eligible()` | ~4008 | `upper(rs.employee_role) = upper(em.role)` | Dynamic |
| `generate_complaint_link()` | ~2920 | `em.role = ANY(['sm','gm'])` | sm, gm |

**Indirect:** `get_bodyshop_surveyor_options()` → `can_view_bodyshop_surveyor_catalog()`

**Defined but unused in RLS (update for consistency):** F4, F6, F8, F2

---

## 3) RLS Policies

### Inline `em.role` (not via named helper)

| Policy | Table | Pattern |
|---|---|---|
| `service_reception_select_crm_dealer_scope` | `service_reception_entries` | `em.role = ANY(['sm','gm'])` ×2 |
| `service_reception_update_sa` | `service_reception_entries` | Same ×4 (USING + WITH CHECK) |

### Inline `s.role` via `get_my_bodyshop_employee_scope()`

| Policy | Op | Pattern |
|---|---|---|
| `bodyshop_repair_card_documents_insert_rbac_v4` | INSERT | `s.role = ANY(['SA','EDP','SURVEY'])` + BODYSHOP dept |
| `bodyshop_repair_card_documents_select_rbac_v4` | SELECT | Same |
| `bodyshop_repair_card_documents_update_rbac_v4` | UPDATE | Same USING + WITH CHECK |

### Via role-dependent functions

| Policy | Function |
|---|---|
| `service_reception_select_crm_dealer_scope` | + `user_is_crm_for_dealer_sa()` |
| `service_reception_select_floor_incharge` | `user_has_service_floor_incharge_scope_for_sa_code()` |
| `service_reception_select_bodyshop_floor_incharge_v1` | `user_has_bodyshop_floor_incharge_scope_for_sa_code()` |
| `service_reception_update_sa` | + CRM + SM/GM inline |
| `settings_bodyshop_surveyors_select_v10` | `can_view_bodyshop_surveyor_catalog()` |
| `technician_assignments_select_technician` | `user_has_technician_code()` |

### Views

| View | Dependency |
|---|---|
| `vw_technician_income_assignments` | `is_income_assignment_eligible('technician_income','technician_assignments',...)` |

---

## 4) Web Frontend Inventory

### Local role helpers (consolidate into `businessRoles.ts`)

| File | Functions |
|---|---|
| `src/pages/BodyshopRepairPage.tsx` | `normalizeAccessToken`, `isBodyshopSaRole`, `isBodyshopSsaRole`, `isBodyshopSurveyRole`, `isBodyshopFloorInchargeRole` |
| `src/pages/BodyshopFloorPage.tsx` | `normRole` |
| `src/pages/FloorInchargePage.tsx` | `isTechnicianRole`, `normalizeSupportRole` (on employee.role) |
| `src/pages/TechnicianPage.tsx` | `isTechnicianBusinessRole` |
| `src/lib/api/reception.ts` | Inline `allowedRoles` Set |
| `src/pages/ComplaintsPage.tsx` | Inline uppercase exact match |

### `.eq('role', ...)` on employee_master

| File | Queries |
|---|---|
| `src/pages/ServiceBookingPage.tsx` | CRE, DRIVER |
| `src/pages/TelecallingPage.tsx` | CRE, DRIVER |

### RPC

| File | RPC |
|---|---|
| `src/pages/BodyshopRepairPage.tsx` | `get_my_bodyshop_employee_scope` |

### employee_master queries without role filter (no change)

`reception.ts` (name/location/fuel), `reportQueries.ts`, `SATrackerPage.tsx`, `ImportPage.tsx`, `JobCardDetailsReport.tsx` (fuel merge only)

---

## 5) Mobile Inventory

| File | Touchpoint |
|---|---|
| `mobile/src/app/(tabs)/reception.tsx` | `allowedRoles` SA filter |
| `mobile/src/app/(tabs)/floor-incharge.tsx` | `isTechnicianRole`, support grouping |
| `mobile/src/app/(tabs)/bodyshop-floor.tsx` | `normRole` single bucket |
| `mobile/src/components/reports/AdvisorPerformanceMobile.tsx` | Display only |
| `mobile/src/lib/reportQueries.ts` | No role in selects |

---

## 6) Edge Functions

| File | Reads employee_master.role? |
|---|---|
| `_shared/earningsReportCommon.ts` | No (bank fields) |
| `technician-daily-earnings-report/index.ts` | No |
| `bodyshop-earnings-report/index.ts` | No (assignment roles) |

---

## 7) Scripts

| File | Pattern |
|---|---|
| `scripts/03_backfill_seed_user_employee_links.sql` | `em.role ILIKE '%sa%' OR em.role ILIKE '%service%advisor%'` |

---

## 8) Canonical Role Literals (SQL + Frontend)

| Domain | Tokens |
|---|---|
| Service RBAC | SA, CRM, SM, GM, TECHNICIAN, FLOOR INCHARGE, CRE, DRIVER |
| Bodyshop RBAC | SA, EDP, SURVEY, FLOOR INCHARGE |
| Bodyshop floor | DENTOR, DENTOR_HELPER, PAINTER, PAINTER_HELPER, TECHNICIAN, RUBBING, EDP, PARTS_INCHARGE, FLOOR_INCHARGE |
| Aliases (must normalize) | SERVICE ADVISOR, SERVICE_ADVISOR, SSA, SENIOR SERVICE ADVISOR, SURVEYOR, floor_incharge, DENTOR HELPER, PAINTER HELPER, PARTS INCHARGE |

Historical: `SSA` → `EDP` (migration `20260706220000_rename_ssa_role_to_edp.sql` in exec_success_migrations)

---

## 9) What Breaks Today with `SA, CRM`

| Layer | Example check | Result |
|---|---|---|
| RLS | `lower(em.role) = 'crm'` | FAIL |
| RLS | `s.role = ANY(['SA','EDP','SURVEY'])` | FAIL |
| Frontend | `allowedRoles.has('sa, crm')` | FAIL |
| Frontend | `isBodyshopSaRole('SA, CRM')` | FAIL |
| Frontend | `normRole('SA, CRM')` | null → excluded from dropdowns |
| PostgREST | `.eq('role', 'CRE')` | FAIL for `CRE, DRIVER` |

Partial pass: `isTechnicianBusinessRole` uses `.includes('technician')`; Floor Incharge `normalizeSupportRole` uses `.includes()`.
