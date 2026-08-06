# RECEPTION-002 Revisit Detection Plan

## Metadata
- Plan ID: RECEPTION-002
- Category: reception
- Status: IP (In Progress) — Phase 6 validation pending
- Owner: Reception Team + Platform Team
- Created: 2026-08-06
- Last Updated: 2026-08-06
- Authoritative DB baseline: `supabase/backups/full_metadata.sql`

## Objective
When a vehicle revisits Reception within 30 days of a prior floor-incharge service visit (same registration number), automatically:
1. Flag the intake as **Revisit** (persistent badge visible on all row views)
2. Default **SA Name** to the prior visit's SA
3. Default **Assign Technician** on Floor Incharge to the prior visit's primary technician
4. Scope prior-visit detection to the 8 floor-incharge service types only

## Execution Progress

| Phase | Description | Status | Completed |
|-------|-------------|--------|-----------|
| 1 | Database and Security | **DN** | 2026-08-06 — migration executed in Supabase SQL editor |
| 2 | API Layer | **DN** | 2026-08-06 |
| 3 | Web — Reception UI | **DN** | 2026-08-06 |
| 4 | Web — Downstream Row Views | **DN** | 2026-08-06 — SA, Floor Incharge, Technician, Dashboard |
| 5 | Mobile | **DN** | 2026-08-06 — reception + floor-incharge |
| 6 | Validation | **IP** | Manual QA pending |

### Phase 1 deployment note
- Migration file: `supabase/migrations/20260806150000_reception_revisit_detection.sql`
- Applied manually via Supabase SQL editor on 2026-08-06
- Objects created: columns, indexes, `get_reception_revisit_context`, `lookup_reception_revisit_prior`, `is_floor_incharge_service_type`, trigger `trg_apply_revisit_on_reception`

## Authoritative Audit Baseline

### DB state (post-migration)
- Table: `public.service_reception_entries` — revisit columns added
- Technician link: `public.technician_assignments` keyed by `job_card_number`
- RPC: `get_reception_revisit_context(p_reg_number, p_exclude_entry_id)`
- Trigger: `trg_apply_revisit_on_reception` on INSERT / UPDATE OF reg_number

### App state (implemented)
- Reception create: `createReceptionEntry()` + DB trigger sets revisit fields
- Reg lookup: `getReceptionRevisitContext()` → SA prefill at intake
- Floor-incharge types: `FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES` in `reception.ts`
- Technician default: auto-assign on web + mobile Floor Incharge when eligible

## Business Rules (locked for v1)

| Rule | Value |
|------|-------|
| Prior match | Same `dealer_code` + `upper(btrim(reg_number))` |
| Prior window | Rolling 30 calendar days from `now()` |
| Prior service types | RR, FFS, SFS, TFS, PS, Updation, E Breakdown, Campaign |
| Prior quality gate | Prior row must have non-empty `jc_number` |
| **Current visit service type** | **Must** be one of the 8 floor-incharge types; empty/Accident/Rusting/PDI = not a revisit |
| SA default | Prior `sa_employee_code` (editable at reception) |
| Technician default | Prior `technician_assignments.technician_code` via prior JC (auto-assign on FI when eligible) |
| Support roles | Out of scope for v1 |

## Implementation Plan

### Phase 1: Database and Security — DN
**Migration:** `supabase/migrations/20260806150000_reception_revisit_detection.sql`

- [x] Add columns: `is_revisit`, `prior_reception_entry_id`, `suggested_technician_code`, `suggested_technician_name`
- [x] Partial index `idx_sre_revisit_prior_lookup`
- [x] RPC `get_reception_revisit_context`
- [x] Trigger `trg_apply_revisit_on_reception`
- [x] Grant EXECUTE to `authenticated`
- [x] Executed in Supabase SQL editor

### Phase 2: API Layer — DN
**Files:** `src/lib/api/reception.ts`, `mobile/src/lib/api/receptionRevisit.ts`

- [x] Export `FLOOR_INCHARGE_ALLOWED_SERVICE_TYPES`
- [x] Extend `ReceptionEntryRow` with revisit fields
- [x] Add revisit columns to `RECEPTION_ENTRY_SELECT_COLUMNS`
- [x] Add `getReceptionRevisitContext()`
- [x] Mobile mirror in `receptionRevisit.ts`

### Phase 3: Web — Reception UI — DN
**Files:** `src/pages/ReceptionPage.tsx`, `src/components/RevisitBadge.tsx`, `src/App.css`

- [x] Debounced reg lookup → RPC
- [x] Revisit notice + SA prefill
- [x] `<RevisitBadge />` in entry list
- [x] DB trigger sets columns on save

### Phase 4: Web — Downstream Row Views — DN
**Files:** `ServiceAdvisorPage.tsx`, `FloorInchargePage.tsx`, `TechnicianPage.tsx`, `DashboardPage.tsx`

- [x] `<RevisitBadge />` on SA, Floor Incharge, Technician, Dashboard rows
- [x] Floor Incharge: revisit fields on `JobCard`; auto-assign suggested technician

### Phase 5: Mobile — DN
**Files:** `mobile/src/app/(tabs)/reception.tsx`, `mobile/src/app/(tabs)/floor-incharge.tsx`

- [x] Reg lookup + SA prefill on new entry form
- [x] Revisit chip on entry cards
- [x] FI technician auto-assign + revisit badge on cards

### Phase 6: Validation — IP
**Test checklist:**

- [ ] Create intake for reg X with floor SR type + JC → second intake within 30 days → Revisit badge + SA default
- [ ] Accident/Rusting/PDI prior visit does NOT trigger revisit
- [ ] Prior visit without JC does NOT trigger revisit
- [ ] FI auto-assigns prior technician when fuel/location rules pass
- [ ] Badge visible on Reception, SA, Floor Incharge, Technician, Dashboard
- [ ] Mobile reception + floor-incharge mirror web behavior

## Files Touched

| Layer | Files | Status |
|-------|-------|--------|
| DB | `supabase/migrations/20260806150000_reception_revisit_detection.sql` | Applied |
| API | `src/lib/api/reception.ts`, `mobile/src/lib/api/receptionRevisit.ts` | Done |
| Web UI | `ReceptionPage.tsx`, `ServiceAdvisorPage.tsx`, `FloorInchargePage.tsx`, `TechnicianPage.tsx`, `DashboardPage.tsx`, `RevisitBadge.tsx`, `App.css` | Done |
| Mobile | `reception.tsx`, `floor-incharge.tsx` | Done |
| Tracker | `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md` | Updated |
| Evidence | `docs/Implementation_plans/webversion/categories/reception/evidence/RECEPTION-002_REVISIT_DETECTION_2026-08-06.md` | Started |

## Out of Scope (v1)
- Backfill of historical rows
- Support role (DET/ELECTRICIAN) replay on revisit
- Revisit analytics in reports
- Using `job_card_closed_data` for detection

## Next Actions
1. Run Phase 6 manual QA checklist above
2. Mark evidence file with test results
3. Move plan to **RV** (Review) after sign-off, then **DN** after production verification
