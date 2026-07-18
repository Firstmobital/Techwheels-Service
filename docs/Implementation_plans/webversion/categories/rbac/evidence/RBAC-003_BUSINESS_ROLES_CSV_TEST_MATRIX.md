# RBAC-003: Business Roles CSV — Regression Test Matrix

**Plan ID:** RBAC-003  
**Created:** 2026-07-18  
**Environment:** Staging (required before production apply)  
**Authority plan:** `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-003_EMPLOYEE_MASTER_MULTI_BUSINESS_ROLE_CSV_PLAN_2026-07-18.md`

---

## 1) Test Data Setup

Create in Employee Master (staging):

| employee_code | employee_name | department | role | Purpose |
|---|---|---|---|---|
| `TEST_MULTI_001` | Test Multi SA CRM | SERVICE | `SA, CRM` | Service RBAC dual persona |
| `TEST_MULTI_002` | Test Tech SA | SERVICE | `TECHNICIAN, SA` | Floor + Reception |
| `TEST_MULTI_003` | Test Dentor Painter | BODY SHOP | `DENTOR, PAINTER` | Multi floor bucket |
| `TEST_SINGLE_SA` | Test Single SA | SERVICE | `SA` | Backward compat |
| `TEST_CRE_ONLY` | Test CRE | SERVICE | `CRE` | RPC picker |

Map test auth user via Admin → Mappings to `TEST_MULTI_001` (and others as needed per case).

---

## 2) Unit Tests (automated)

**File:** `src/lib/businessRoles.test.ts`

| Input | Expected `parseBusinessRoles` |
|---|---|
| `SA` | `['SA']` |
| `SA, CRM` | `['SA','CRM']` |
| `SA,CRM` | `['SA','CRM']` |
| `service advisor, crm` | `['SA','CRM']` |
| `SSA` | `['EDP']` |
| `FLOOR INCHARGE` | `['FLOOR_INCHARGE']` |
| `SA, SA` | `['SA']` |
| `""` / null | `[]` |
| `INVALID` | validation error |
| `SA; CRM` | validation error (reject non-comma) |

SQL checks must mirror the same vectors in `employee_has_business_role()`.

---

## 3) Module Matrix (manual)

| # | Module | Route | Action | Pass criteria |
|---|---|---|---|---|
| M1 | Settings | `/settings#employee-master` | Save `SA, CRM` | Persists canonical; reload unchanged |
| M2 | Settings | import xlsx | Row with `SA, CRM` | Accepted; unknown tokens rejected with row # |
| M3 | Reception | `/reception` | SA dropdown | `TEST_MULTI_001` visible |
| M4 | Service Advisor | `/service-advisor` | Row visibility as CRM user | Dealer-scoped rows per CRM rules |
| M5 | Bodyshop Repair | `/bodyshop-repair` | Tab access | SA tab if SA token present |
| M6 | Bodyshop Floor | `/bodyshop-floor` | Assignment dropdowns | `TEST_MULTI_003` in DENTOR **and** PAINTER lists |
| M7 | Floor Incharge | `/floor-incharge` | Technician list | `TEST_MULTI_002` listed |
| M8 | Technician | `/technician` | Roster | `TEST_MULTI_002` in TECHNICIAN set |
| M9 | Complaints | `/complaints` | View mode | CRM mapping → manager view |
| M10 | Service Booking | `/service-booking` | CRE picker | CRE employees include multi-role rows |
| M11 | Telecalling | `/telecalling` | CRE/DRIVER pickers | Same as M10 |
| M12 | Admin | `/admin` | Effective Access Summary | Shows SA and CRM as separate tokens |
| M13 | Mobile Reception | tab | SA dropdown | Parity with M3 |
| M14 | Mobile Floor | tab | Technician filter | Parity with M7 |
| M15 | Mobile Bodyshop Floor | tab | Role buckets | Parity with M6 |

---

## 4) RLS Security Cases

| # | User context | Expected |
|---|---|---|
| R1 | Mapped `TEST_MULTI_001` (`SA, CRM`) | CRM dealer rows + own SA rows |
| R2 | Mapped `TEST_SINGLE_SA` only | No CRM-wide scope |
| R3 | Mapped technician code, role `TECHNICIAN` | `technician_assignments_select_technician` for own code |
| R4 | Admin | Unrestricted (admin bypass unchanged) |
| R5 | Non-mapped user | Deny-by-default unchanged |
| R6 | SM/GM token in CSV | SM/GM dealer scope policies work |

---

## 5) SQL Verification

Run after migration apply:

- `supabase/sql_checks/20260718100000_business_roles_csv_helpers_checks.sql`
- Spot check: `SELECT employee_has_business_role('SA, CRM', 'CRM');` → `true`
- Spot check: `SELECT employee_has_business_role('SA, CRM', 'EDP');` → `false`
- View: `vw_technician_income_assignments` includes rows where any parsed role matches `income_role_scope`

---

## 6) Sign-Off

| Role | Name | Date | Result |
|---|---|---|---|
| Dev | | | |
| QA | | | |
| RBAC owner | | | |
