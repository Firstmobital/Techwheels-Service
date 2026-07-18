# RBAC-003: Employee Master Multi Business Role (Comma-Separated) — Option B Plan

**Plan ID:** RBAC-003  
**Created:** 2026-07-18  
**Priority:** HIGH  
**Owner:** RBAC Team + Platform Team  
**Status:** Active (Audit complete; implementation not started)  
**Scope:** Settings → Employee Master comma-separated Business Roles; shared TS + SQL helpers; Settings validation; web + mobile + Supabase RLS parity  
**Parent governance:** Extends (does not replace) `RBAC-001_MASTER_PLAN_ACTIVE.md` Business Role vs Platform Role split  
**Last Updated:** 2026-07-18

---

## Sync Contract (No Drift)

This file is the **single execution tracker** for Option B (CSV Business Roles in `employee_master.role`).

Rules:

1. Every change to Business Role parsing, validation, or RBAC role checks must update this file in the same session.
2. No parallel tracker files for this scope.
3. Activity Tracker status values: `DONE`, `IN PROGRESS`, `PENDING`, `BLOCKED`.
4. Database changes require a matching row in `docs/shared/reference/DB_CHANGE_LEDGER.md` before apply.
5. If scope changes, add a Change Log row before implementation.

Session resume protocol:

1. Open this file first.
2. Read Activity Tracker; pick first `IN PROGRESS`, else first `PENDING`.
3. Execute only that scope unless user reprioritizes.
4. Update row status + evidence before ending session.

---

## Executive Summary

| Item | Finding |
|---|---|
| **Problem** | `employee_master.role` is a single free-text column compared with exact match everywhere. Comma-separated values like `SA, CRM` are stored as one literal and fail RLS, dropdowns, and UI gates. |
| **Solution (Option B)** | Keep the column; add shared parse/normalize/match in **TypeScript + SQL**; validate on Settings save/import. |
| **Alternative today** | Multi-role via **Admin → Mappings** (`user_employee_links` → multiple employee codes) — works without code change. |
| **Schema change** | None required (optional performance add-on: `role_codes text[]` + GIN index via trigger). |
| **Estimated effort** | 6–9 dev days + staging QA |
| **Risk** | Medium — TS/SQL parity and full consumer coverage required |

**Risk Level:** MEDIUM  
**Rollback:** Revert migration + app changes; `employee_master.role` values remain valid single-token strings.

---

## Authoritative Inputs Used (Audit 2026-07-18)

| Source | Path | Used for |
|---|---|---|
| Schema / functions / RLS | `supabase/backups/full_metadata.sql` | All SQL inventory |
| Row data | `supabase/backups/full_dump.sql` | **Empty** `employee_master` TABLE DATA in workspace |
| Row data (expected) | `local_folder/backups/full_database.sql` or `chunks/full_database.sql.part_*` | **Not present in workspace** — live role distribution not verified |
| Web app | `src/**` | Frontend inventory |
| Mobile app | `mobile/src/**` | Mobile parity inventory |
| Edge functions | `supabase/functions/**` | No `employee_master.role` reads found |
| Scripts | `scripts/**` | One `em.role` ILIKE usage |
| RBAC governance | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-001_MASTER_PLAN_ACTIVE.md` | Platform vs Business Role split |

Detailed audit evidence:  
`docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_AUDIT_2026-07-18.md`

Regression matrix (QA):  
`docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_TEST_MATRIX.md`

---

## 1) Objective

Enable assigning **multiple Business Roles to one employee** using comma-separated values in Settings → Employee Master (`employee_master.role`), such that **every module that works for a single role today works identically** when that role appears as one token in a CSV string.

Examples:

- `SA, CRM` → CRM dealer scope + SA dropdown visibility + Complaints manager view (when mapped)
- `TECHNICIAN, SA` → Technician roster + Reception SA list
- `DENTOR, PAINTER` → Appears in **both** Bodyshop Floor assignment dropdown buckets

**Out of scope:**

- Platform Role (`users.role`: admin/manager/staff/viewer)
- Multi-department per row (`employee_master.department` remains single-value)
- Bodyshop assignment column roles (`bodyshop_assignments.*_employee_code` / `support_role`) — separate domain
- Option C junction table (`employee_master_roles`) — deferred

---

## 2) Current-State Architecture

```
Settings → employee_master.role (free text, exact match)
                ↓
    ┌───────────┴───────────┐
    ↓                       ↓
SQL functions + RLS     Web/Mobile filters
(exact = 'crm')         (allowedRoles.has(fullString))
```

**Existing multi-role path (works today):**

- `user_employee_links` maps one login user → one or more `employee_code` rows
- Each code carries one role in `employee_master`
- Admin → Permissions shows "Business role(s)" from multiple mappings

Option B adds multi-role **within one employee_code** without requiring duplicate master rows.

---

## 3) Target Architecture (Option B)

### 3.1 Shared TypeScript contract

**New file:** `src/lib/businessRoles.ts`  
**Mobile copy:** `mobile/src/lib/businessRoles.ts` (identical until shared package)

| Export | Purpose |
|---|---|
| `BUSINESS_ROLE_CATALOG` | Canonical tokens + aliases |
| `parseBusinessRoles(raw)` | `"SA, CRM"` → `['SA','CRM']` |
| `normalizeRoleToken(token)` | Alias map (`SERVICE ADVISOR` → `SA`, `SSA` → `EDP`) |
| `hasBusinessRole(raw, target)` | Single target match |
| `hasAnyBusinessRole(raw, targets)` | Any-of match |
| `formatBusinessRoles(raw)` | Display string |
| `validateAndCanonicalizeRoles(raw)` | Settings save/import gate |
| Domain wrappers | `isBodyshopSaRole`, `isServiceAdvisorRole`, etc. |

**Parsing rules (locked):**

- Delimiter: **comma only** (reject `;`, `/`, `|`)
- Trim whitespace; dedupe; max **5** tokens
- Storage: canonical tokens joined `", "` (e.g. `SA, CRM`)
- Empty → `null` in DB

### 3.2 Shared SQL contract

**Migration:** `supabase/migrations/20260718100000_business_roles_csv_helpers.sql`  
**Checks:** `supabase/sql_checks/20260718100000_business_roles_csv_helpers_checks.sql`  
**Ledger:** `DBL-00XX` in `docs/shared/reference/DB_CHANGE_LEDGER.md`

| Object | Purpose |
|---|---|
| `normalize_business_role_token(text)` | IMMUTABLE alias map |
| `employee_business_roles(text)` | STABLE → `text[]` |
| `employee_has_business_role(text, text)` | STABLE boolean |
| `employee_has_any_business_role(text, text[])` | STABLE boolean |
| `list_employees_with_business_role(text)` | SECURITY DEFINER RPC (replaces `.eq('role',...)`) |

**Optional performance add-on:**

- `employee_master.role_codes text[]` maintained by trigger on INSERT/UPDATE OF `role`
- `idx_employee_master_role_codes_gin` GIN index

### 3.3 Canonical role catalog (from code evidence)

**Service RBAC:** `SA`, `CRM`, `SM`, `GM`, `TECHNICIAN`, `FLOOR_INCHARGE`, `CRE`, `DRIVER`  
**Bodyshop RBAC:** `SA`, `EDP`, `SURVEY`, `FLOOR_INCHARGE`  
**Bodyshop floor assignment:** `DENTOR`, `DENTOR_HELPER`, `PAINTER`, `PAINTER_HELPER`, `TECHNICIAN`, `RUBBING`, `EDP`, `PARTS_INCHARGE`, `FLOOR_INCHARGE`  
**Floor Incharge support grouping:** `TECHNICIAN`, `ELECTRICIAN`, `DENTOR`, `ALIGNMENT`, `DET`

Aliases documented in audit evidence file.

---

## 4) Consumer Inventory Summary

### 4.1 Database — functions to rewrite (12)

| ID | Function |
|---|---|
| F1 | `get_my_bodyshop_employee_scope()` — keep raw CSV return; consumers parse |
| F2 | `can_access_bodyshop_surveyor_settings()` |
| F3 | `can_view_bodyshop_surveyor_catalog()` |
| F4 | `user_has_crm_dealer_scope()` |
| F5 | `user_is_crm_for_dealer_sa()` |
| F6 | `user_is_crm_for_sa_code()` |
| F7 | `user_has_technician_code()` |
| F8 | `user_has_floor_incharge_scope_for_sa_code()` |
| F9 | `user_has_service_floor_incharge_scope_for_sa_code()` |
| F10 | `user_has_bodyshop_floor_incharge_scope_for_sa_code()` |
| F11 | `is_income_assignment_eligible()` |
| F12 | `generate_complaint_link()` — inline SM/GM check |

### 4.2 Database — RLS policies

| Policy | Table | Change |
|---|---|---|
| `service_reception_select_crm_dealer_scope` | `service_reception_entries` | Inline SM/GM → helper |
| `service_reception_update_sa` | `service_reception_entries` | Inline SM/GM (×4 EXISTS) → helper |
| `bodyshop_repair_card_documents_*_rbac_v4` (×3) | `bodyshop_repair_card_documents` | Inline `s.role` → helper |
| Via F3 | `settings_bodyshop_surveyors_select_v10` | Indirect |
| Via F7–F10 | `service_reception_*`, `technician_assignments_select_technician` | Indirect |

**View:** `vw_technician_income_assignments` → F11

### 4.3 Web frontend (P0–P2)

| Priority | File |
|---|---|
| P0 | **NEW** `src/lib/businessRoles.ts` |
| P1 | `src/pages/SettingsPage.tsx` |
| P1 | `src/lib/api/reception.ts` |
| P1 | `src/pages/BodyshopRepairPage.tsx` |
| P1 | `src/pages/BodyshopFloorPage.tsx` |
| P1 | `src/pages/FloorInchargePage.tsx` |
| P1 | `src/pages/TechnicianPage.tsx` |
| P1 | `src/pages/ComplaintsPage.tsx` |
| P1 | `src/pages/ServiceBookingPage.tsx` |
| P1 | `src/pages/TelecallingPage.tsx` |
| P1 | `src/pages/AdminPage.tsx` |
| P2 | `src/pages/reports/performance/AdvisorPerformanceReport.tsx` |

**No change:** `src/lib/reportQueries.ts`, `SATrackerPage.tsx`, `ImportPage.tsx`, `DashboardPage.tsx` (no role filter on EM)

### 4.4 Mobile (P0–P2)

| Priority | File |
|---|---|
| P0 | **NEW** `mobile/src/lib/businessRoles.ts` |
| P1 | `mobile/src/app/(tabs)/reception.tsx` |
| P1 | `mobile/src/app/(tabs)/floor-incharge.tsx` |
| P1 | `mobile/src/app/(tabs)/bodyshop-floor.tsx` |
| P2 | `mobile/src/components/reports/AdvisorPerformanceMobile.tsx` |

### 4.5 Edge functions

**No change** — none read `employee_master.role`.

### 4.6 Scripts

| File | Change |
|---|---|
| `scripts/03_backfill_seed_user_employee_links.sql` | Replace `em.role ILIKE '%sa%'` with SQL helper |

---

## 5) Known Limitations (Document — Do Not Fix in RBAC-003)

| Limitation | Reason |
|---|---|
| Single `department` per row | Person in SERVICE + BODY SHOP still needs two employee codes or future department junction |
| Single `location` / `fuel_type` | Branch/fuel scoping unchanged |
| Login mapping still required | `user_employee_links` not replaced |
| `income_role_scope` seed data | Not in metadata dump; verify live DB has expected rows |
| Historical `SSA` values | Alias to `EDP` on read; optional normalize script |

---

## 6) Activity Tracker

Legend: `DONE` | `IN PROGRESS` | `PENDING` | `BLOCKED`

| ID | Phase | Task | Status | Owner | Updated | Evidence |
|---|---|---|---|---|---|---|
| BR-001 | 0 | DB ledger row DBL-00XX PROPOSED | PENDING | Platform | 2026-07-18 | `DB_CHANGE_LEDGER.md` |
| BR-002 | 0 | Alias catalog sign-off with business | PENDING | RBAC + Product | 2026-07-18 | This plan §3.3 |
| BR-003 | 1 | Create `src/lib/businessRoles.ts` | PENDING | Web | 2026-07-18 | — |
| BR-004 | 1 | Create `mobile/src/lib/businessRoles.ts` | PENDING | Mobile | 2026-07-18 | — |
| BR-005 | 1 | Create `src/lib/businessRoles.test.ts` | PENDING | Web | 2026-07-18 | — |
| BR-006 | 1 | SQL helpers migration (helpers only) | PENDING | Platform | 2026-07-18 | `20260718100000_*.sql` |
| BR-007 | 1 | SQL checks file | PENDING | Platform | 2026-07-18 | `sql_checks/20260718100000_*` |
| BR-008 | 2 | Rewrite F2–F12 SQL functions | PENDING | Platform | 2026-07-18 | Migration part 2 |
| BR-009 | 2 | Rewrite inline SM/GM RLS on service_reception | PENDING | Platform | 2026-07-18 | Migration part 2 |
| BR-010 | 2 | Rewrite bodyshop document RLS inline s.role | PENDING | Platform | 2026-07-18 | Migration part 2 |
| BR-011 | 2 | Add `list_employees_with_business_role` RPC | PENDING | Platform | 2026-07-18 | Migration |
| BR-012 | 2 | Optional `role_codes[]` + GIN trigger | PENDING | Platform | 2026-07-18 | Migration optional |
| BR-013 | 3 | Settings validation + UI (import/export/add/save) | PENDING | Web | 2026-07-18 | `SettingsPage.tsx` |
| BR-014 | 3 | Admin Effective Access Summary parse | PENDING | Web | 2026-07-18 | `AdminPage.tsx` |
| BR-015 | 4 | Web consumer migration (8 files) | PENDING | Web | 2026-07-18 | See §4.3 |
| BR-016 | 5 | Mobile parity (4 files) | PENDING | Mobile | 2026-07-18 | See §4.4 |
| BR-017 | 6 | Update backfill script | PENDING | Platform | 2026-07-18 | `scripts/03_*.sql` |
| BR-018 | 6 | RBAC-001 execution update cross-ref | PENDING | RBAC | 2026-07-18 | `RBAC-001_*.md` |
| BR-019 | 6 | CI grep guard for direct em.role checks | PENDING | Platform | 2026-07-18 | — |
| BR-020 | QA | Execute test matrix on staging | PENDING | QA + RBAC | 2026-07-18 | Test matrix evidence |
| BR-021 | QA | Refresh `db:backup:metadata` post-apply | PENDING | Platform | 2026-07-18 | `full_metadata.sql` |

### Done vs Pending Snapshot

- Done: 0  
- In Progress: 0  
- Pending: 21  
- Blocked: 0  

---

## 7) Implementation Phases

### Phase 0 — Governance (0.5 day)

- Add DBL ledger row
- Confirm comma-only delimiter + max 5 tokens with business
- Branch: `feature/rbac-003-business-roles-csv`

### Phase 1 — Shared contract + tests (1–2 days)

- TS module + unit tests (mirror vectors in SQL checks)
- SQL helpers migration (no consumer rewrites yet)
- Apply in Supabase SQL Editor; run sql_checks

### Phase 2 — Database consumers (1–2 days)

- Rewrite F2–F12 + inline RLS + RPC
- Consider extracting `user_has_sm_gm_scope_for_sa_code()` to dedupe 4 EXISTS blocks in `service_reception_update_sa`
- Profile optional `role_codes[]` if RLS cost visible

### Phase 3 — Settings + Admin (1 day)

- Validation on all write paths
- UI: placeholder `SA, CRM`, help text, error display

### Phase 4 — Web (1–2 days)

- Replace local helpers; multi-bucket Bodyshop Floor lists
- CRE/DRIVER via RPC not fetch-all

### Phase 5 — Mobile parity (1 day)

- Mirror Phase 4 for mobile files

### Phase 6 — Scripts, docs, QA (0.5–1 day)

- Script update, RBAC-001 cross-ref, test matrix execution, metadata refresh

---

## 8) Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| TS/SQL parse mismatch | Medium | High | Shared test vectors; sql_checks |
| Missed consumer | Medium | High | Full audit inventory + grep CI guard |
| SM/GM RLS perf | Low | Medium | Helper extraction; optional GIN array |
| Fetch-all anti-pattern for CRE/DRIVER | Low | Medium | Mandate RPC |
| Bodyshop multi-bucket regression | Medium | Medium | TEST_MULTI_003 in test matrix |

---

## 9) Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Approach | Option B (CSV + helpers) | User request; no schema migration |
| Delimiter | Comma only | Unambiguous |
| F1 RPC shape | Keep raw CSV string | Avoid breaking BodyshopRepairPage |
| CRE/DRIVER queries | RPC `list_employees_with_business_role` | Avoid egress/perf issue |
| Option C junction table | Deferred | Separate future plan if audit/history needed |
| Performance add-on | Optional `role_codes[]` | Parse-on-write if profiling warrants |

---

## 10) Change Log

| Date | Change | Reason | Updated By |
|---|---|---|---|
| 2026-07-18 | Plan created from full project + DB audit | User request for structured implementation plan | Cursor Agent |
| 2026-07-18 | Evidence + test matrix files added under rbac/evidence | Per docs structure | Cursor Agent |

---

## 11) Related Documents

| Document | Path |
|---|---|
| RBAC master plan | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-001_MASTER_PLAN_ACTIVE.md` |
| Full audit evidence | `docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_AUDIT_2026-07-18.md` |
| QA test matrix | `docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_TEST_MATRIX.md` |
| Admin bypass rule | `docs/Implementation_plans/webversion/categories/rbac/evidence/runbooks/ADMIN_BYPASS_RLS_GOVERNANCE.md` |
| DB change ledger | `docs/shared/reference/DB_CHANGE_LEDGER.md` |
| Schema authority | `supabase/backups/full_metadata.sql` |
