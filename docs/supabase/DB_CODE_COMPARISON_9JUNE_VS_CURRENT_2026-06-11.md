# Database + Code Comparison Report

## 1) Scope

This report compares:
1. 9 June database backup chunks at `local_folder/backups/old_reference/chunks-9June`
2. Current database backup chunks at `local_folder/backups/chunks`
3. Code baseline on 9 June (git commit `2318089`) vs current HEAD (`7eaa99c`)

Date of comparison: 2026-06-11

## 2) Inputs and Validation

- Old backup chunk count: 4 files
- Current backup chunk count: 3 files
- Reconstructed SQL sizes:
  - Old (9 June): 62,427,156 bytes
  - Current: 51,308,541 bytes
- Build check status: `npm run build` passed

## 3) High-Level Summary

1. Major new work happened after 9 June in both code and database, especially around bodyshop modules and tracker flows.
2. Code delta is significant: 31 changed files, 6405 insertions, 291 deletions.
3. Database schema has meaningful drift from 9 June: 36 added signature objects, 4 removed signature objects.
4. Some changes are clearly beneficial (route wiring, date filters, new modules).
5. There are critical governance/RBAC and migration consistency issues that need correction.

## 4) Database Delta (9 June -> Current)

### 4.1 Added Objects (36)

```text
CREATE FUNCTION public.skip_zero_qty_parts_stock_rows() RETURNS trigger
CREATE FUNCTION public.update_bodyshop_assignments_updated_at() RETURNS trigger
CREATE INDEX idx_bodyshop_assignments_active ON public.bodyshop_assignments USING btree (is_active, assigned_at DESC);
CREATE INDEX idx_bodyshop_assignments_jc ON public.bodyshop_assignments USING btree (job_card_number);
CREATE INDEX idx_brc_branch ON public.bodyshop_repair_cards USING btree (branch);
CREATE INDEX idx_brc_job_card ON public.bodyshop_repair_cards USING btree (job_card_no);
CREATE INDEX idx_brc_stage ON public.bodyshop_repair_cards USING btree (current_stage);
CREATE INDEX idx_brc_status ON public.bodyshop_repair_cards USING btree (overall_status);
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.bodyshop_assignments TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.bodyshop_repair_cards TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY bodyshop_assignments_insert ON public.bodyshop_assignments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bodyshop_assignments_read ON public.bodyshop_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY bodyshop_assignments_service_all ON public.bodyshop_assignments TO service_role USING (true) WITH CHECK (true);
CREATE POLICY bodyshop_assignments_update ON public.bodyshop_assignments FOR UPDATE TO authenticated USING (true);
CREATE TABLE public.bodyshop_assignments (
CREATE TABLE public.bodyshop_repair_cards (
CREATE TRIGGER trg_bodyshop_assignments_updated_at BEFORE UPDATE ON public.bodyshop_assignments FOR EACH ROW EXECUTE FUNCTION public.update_bodyshop_assignments_updated_at();
CREATE TRIGGER trg_skip_zero_qty_parts_stock_rows BEFORE INSERT OR UPDATE ON public.service_parts_stock_snapshot_data FOR EACH ROW EXECUTE FUNCTION public.skip_zero_qty_parts_stock_rows();
GRANT ALL ON FUNCTION public.skip_zero_qty_parts_stock_rows() TO anon;
GRANT ALL ON FUNCTION public.skip_zero_qty_parts_stock_rows() TO authenticated;
GRANT ALL ON FUNCTION public.skip_zero_qty_parts_stock_rows() TO service_role;
GRANT ALL ON FUNCTION public.update_bodyshop_assignments_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_bodyshop_assignments_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_bodyshop_assignments_updated_at() TO service_role;
GRANT ALL ON SEQUENCE public.bodyshop_assignments_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bodyshop_assignments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bodyshop_assignments_id_seq TO service_role;
GRANT ALL ON SEQUENCE public.bodyshop_repair_cards_id_seq TO anon;
GRANT ALL ON SEQUENCE public.bodyshop_repair_cards_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.bodyshop_repair_cards_id_seq TO service_role;
GRANT ALL ON TABLE public.bodyshop_assignments TO anon;
GRANT ALL ON TABLE public.bodyshop_assignments TO authenticated;
GRANT ALL ON TABLE public.bodyshop_assignments TO service_role;
GRANT ALL ON TABLE public.bodyshop_repair_cards TO anon;
GRANT ALL ON TABLE public.bodyshop_repair_cards TO authenticated;
GRANT ALL ON TABLE public.bodyshop_repair_cards TO service_role;
```

### 4.2 Removed Objects (4)

```text
CREATE INDEX messages_2026_06_06_inserted_at_topic_idx ON realtime.messages_2026_06_06 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));
CREATE TABLE realtime.messages_2026_06_06 (
GRANT ALL ON TABLE realtime.messages_2026_06_06 TO dashboard_user;
GRANT ALL ON TABLE realtime.messages_2026_06_06 TO postgres;
```

### 4.3 Important DB Evidence Notes

1. Current DB contains bodyshop tables with flattened/expanded fields in `bodyshop_repair_cards`.
2. Current DB has RLS enabled on `bodyshop_repair_cards` and `bodyshop_assignments`.
3. `bodyshop_assignments` policies currently allow very broad authenticated access for select/insert/update.
4. Current DB module data includes `sa_tracker`, `bodyshop_tracker`, `bodyshop_floor`, `bodyshop_repair`.

## 5) Code Delta (9 June baseline commit 2318089 -> HEAD 7eaa99c)

### 5.1 Commit/Change Summary

- Non-merge commits: extensive set from 2026-06-10 onward
- Diffstat: 31 files changed, 6405 insertions(+), 291 deletions(-)

### 5.2 Added Files

1. `mobile/src/app/(tabs)/bodyshop-repair.tsx`
2. `src/components/DateRangeFilter.tsx`
3. `src/lib/api/bodyshopRepair.ts`
4. `src/pages/BodyshopFloorPage.tsx`
5. `src/pages/BodyshopRepairPage.tsx`
6. `src/pages/BodyshopTrackerPage.tsx`
7. `src/pages/SATrackerPage.tsx`
8. `src/pages/reports/parts/BackOrderPartsReport.tsx`
9. `src/pages/reports/parts/PartsConsumptionReportNew.tsx`
10. `supabase/migrations/20260610093000_fix_technician_daily_earnings_cron_target_project.sql`
11. `supabase/migrations/20260610130000_skip_zero_qty_parts_stock.sql`
12. `supabase/migrations/20260610230000_bodyshop_repair_tracker.sql`
13. `supabase/sql_checks/20260610093000_fix_technician_daily_earnings_cron_target_project_checks.sql`
14. `supabase/sql_checks/20260610230000_bodyshop_repair_tracker_checks.sql`

### 5.3 Modified Files

1. `mobile/src/app/job-cards/create.tsx`
2. `mobile/src/lib/partsReportQueries.ts`
3. `mobile/src/lib/partsStockColumnMapper.ts`
4. `src/App.tsx`
5. `src/lib/partsReportQueries.ts`
6. `src/lib/partsStockColumnMapper.ts`
7. `src/pages/AdminPage.tsx`
8. `src/pages/FloorInchargePage.tsx`
9. `src/pages/ReceptionPage.tsx`
10. `src/pages/ReportsPage.tsx`
11. `src/pages/ServiceAdvisorPage.tsx`
12. `src/pages/TechnicianPage.tsx`
13. `src/pages/reports/parts/PartsConsumptionReport.tsx`
14. `src/pages/reports/parts/PartsFastMovingReport.tsx`
15. `src/pages/reports/parts/PartsOrderStatusReport.tsx`
16. `src/pages/reports/parts/index.ts`
17. `src/pages/reports/types.ts`

## 6) What Was Done Correct

1. App route/module access expansion is wired in a consistent way in `src/App.tsx` for SA tracker and bodyshop pages.
2. Shared date filtering was introduced and applied broadly through `DateRangeFilter`, improving consistency across pages.
3. New bodyshop feature surfaces were implemented across web + mobile and appear integrated at route/nav level.
4. Build currently compiles successfully (`tsc` + `vite`).
5. Module entries for new capabilities are present in current DB data snapshot.

## 7) What Was Done Wrong / Risky

### 7.1 Critical: Migration-to-reality mismatch

- Migration file `20260610230000_bodyshop_repair_tracker.sql` describes a 7-table decomposition (`bodyshop_stage_logs`, `bodyshop_repair_docs`, `bodyshop_survey`, etc.).
- Current database actually reflects a 2-table practical model (`bodyshop_repair_cards` + `bodyshop_assignments`) with many flattened columns.
- Result: repository migration source does not faithfully represent deployed schema.

### 7.2 Critical: Migration SQL uses incompatible module/permission schema

- Migration inserts into `modules(module_name, display_name, ...)`.
- Actual table shape in DB dump is `modules(name, label, ...)`.
- Migration inserts into `user_module_permissions(user_id, module_name, can_access)`.
- Actual table shape in DB dump uses `module_id`, `can_view`, `can_modify`, `can_delete`.
- Result: migration would fail or produce wrong outcomes if replayed in a clean environment.

### 7.3 Critical: RBAC policy openness on bodyshop_assignments

- `bodyshop_assignments_read` uses `USING (true)` for authenticated.
- `bodyshop_assignments_insert` uses `WITH CHECK (true)` for authenticated.
- `bodyshop_assignments_update` uses `USING (true)` for authenticated.
- Result: broad access bypassing expected dealer/role/ownership scope controls.

### 7.4 Critical/High: bodyshop_repair_cards policy completeness mismatch

- App exposes route via module permission model.
- DB policy visibility suggests admin-unrestricted policy but no clear scoped non-admin CRUD policy set shown in added signatures.
- Result: potential functional mismatch (UI visible but DB operations blocked for non-admin) or inconsistent behavior.

### 7.5 Medium/High: Broad grants to anon

- `GRANT ALL ON TABLE public.bodyshop_assignments TO anon`
- `GRANT ALL ON TABLE public.bodyshop_repair_cards TO anon`
- RLS is enabled, but broad grants to anon are still risky baseline governance.

### 7.6 Medium: Data lifecycle risk in zero-qty migration

- Migration `20260610130000_skip_zero_qty_parts_stock.sql` hard-deletes existing zero-qty rows and suppresses future zero-qty inserts/updates.
- This may be intentional, but it removes historical zero-stock points and can affect audit/analytics continuity.

### 7.7 High: Branch vs Location logic is mixed and creates business confusion

#### What was expected (business intent)

For long-term reporting and operations, these should be treated as different concepts:

1. Location = physical workshop site (for example: Ajmer Road, Sitapura).
2. Portal/Fuel channel = EV or PV business stream.
3. Branch label = a display value only, derived from location + portal if needed.

Expected behavior by page:

1. Floor Incharge "Filter by location" should always filter by location only.
2. SA Tracker should clearly show either:
  - only location, or
  - location + portal together.
3. Reports should not use one text field for two different meanings.

#### What was actually done

1. Floor Incharge "Filter by location" is built from the `branch` value on reception entries.
2. SA Tracker "Branch" is built from the `branch` value in closed job card data.
3. During import, `branch` is often filled from employee location or slot location, so in practice `branch` behaves like location in many cases.

#### Why this is a problem for business users

1. Two words (Branch and Location) appear to mean the same thing on screen, but not by formal definition.
2. Users can lose trust in numbers because labels are inconsistent between modules.
3. Future expansion (new locations, mixed EV/PV workflows, dealer-specific logic) becomes hard to manage and error-prone.
4. Audit and compliance reviews become harder because one field is overloaded.

#### What should have been done

1. Keep separate columns as source of truth:
  - `location` (physical site)
  - `portal` (EV/PV)
2. Use a derived display label for UI where needed (for example: "Sitapura EV").
3. Keep legacy `branch` only for backward compatibility during transition.
4. Standardize all filters:
  - "Filter by location" uses `location`
  - "Portal/Fuel" uses `portal`
  - combined chip (if needed) uses derived label only.

#### Plain-language example

If one car is from "Sitapura" and "EV":

1. Location should always be "Sitapura".
2. Portal should always be "EV".
3. Display label can be "Sitapura EV".

No page should guess this from one generic text value.

#### Business impact rating

- Severity: High
- Type: Data semantics and reporting consistency risk
- Recommended priority: Immediate design decision, phased implementation

## 8) RBAC-Focused Verdict

1. Route-level RBAC wiring in application code improved.
2. Database-level RBAC quality regressed for new bodyshop assignment table due to overly permissive policies.
3. Migration governance quality regressed: checked-in migration definitions do not match actual deployed schema model.

## 9) Operational Notes During Audit

1. SQL direct helper command `node scripts/execute-sql.js` is currently not reliable for ad-hoc SELECT checks because it expects `SUPABASE_MANAGEMENT_TOKEN` and prints migration guidance text in this environment.
2. Therefore, this comparison relied on authoritative dump-to-dump and git-to-git diffing.

## 10) Recommended Next Actions

1. Create corrective migration(s) that represent actual deployed bodyshop schema exactly (single source of truth).
2. Replace permissive `bodyshop_assignments_*` policies with scoped predicates based on authenticated user, dealer, branch, and allowed role mappings.
3. Review and tighten table grants for anon where unnecessary.
4. Add explicit SQL checks validating policy semantics (not just object existence).
5. Re-run dump compare after corrective migration to confirm drift closure.
6. Approve and document canonical business definitions:
  - Location = physical site
  - Portal = EV/PV stream
  - Branch label = derived display text only
7. Add migration plan to introduce/standardize `location` and `portal` in all affected tables, with dual-write period before deprecating overloaded `branch` behavior.
8. Update UI labels for clarity so non-technical users see consistent terms across Floor Incharge, SA Tracker, and reports.

## 11) Non-Developer Summary (What to understand quickly)

1. Good news: a lot of useful work was delivered and the application builds successfully.
2. Main concern: security and database change governance still need tightening.
3. Important data concern: the system is currently mixing "branch" and "location" ideas in ways that can confuse reporting.
4. Correct long-term direction: store location and EV/PV separately, then create display labels from those fields.
5. This is fixable in a phased manner without stopping operations, but should be planned now before more data is added.

## 12) Final Conclusion

The post-9 June work delivered substantial functionality and UI integration, and the project builds cleanly. However, there are major correctness gaps in migration integrity and RBAC hardening on newly introduced bodyshop data structures. The most urgent fixes are migration reconciliation and policy tightening so deployed behavior matches intended access governance.

## 13) Additional Findings From Full Docs Audit

This section captures issues found after auditing documentation across the full `docs/` tree and cross-checking against current code and current DB dump.

### 13.1 Critical: Module-Route contract is stale and no longer authoritative

Current document status:
1. `docs/Project_Handbook/MODULE_ROUTE_CONTRACT.md` is last updated on 2026-05-23.
2. It lists older module coverage and misses currently deployed modules such as `complaints`, `service_advisor`, `floor_incharge`, `technician`, `sa_tracker`, `bodyshop_tracker`, `bodyshop_floor`, and `bodyshop_repair`.

Why this matters:
1. Operations and support teams cannot reliably use that document to answer "which permission opens which page?"
2. New team members are likely to follow outdated access mapping and make wrong permission decisions.

Business impact (non-technical):
The access handbook currently describes an old map, while the app is using a newer map. This creates avoidable confusion and access mistakes.

### 13.2 Critical: Bodyshop migration conflicts with canonical module/permission schema documented elsewhere

Observed conflict:
1. Bodyshop migration uses a non-canonical pattern (`module_name`, `display_name`, `can_access`).
2. Existing handbook and prior successful migrations use canonical schema (`modules.name`, `modules.label`, `user_module_permissions.module_id`, `can_view`, `can_modify`, `can_delete`).

Why this matters:
1. Replaying migrations in a clean environment can fail.
2. Disaster recovery and environment rebuild become unreliable.

Business impact (non-technical):
If you need to rebuild the system from migration files, this one may not run correctly. That puts recovery speed and confidence at risk.

### 13.3 Critical: RBAC governance doc says one thing, current bodyshop policies do another

Observed conflict:
1. RBAC governance runbooks describe strict scoped access with admin bypass pattern.
2. Current bodyshop assignments policies are permissive (`USING (true)` / `WITH CHECK (true)`), which bypasses expected module/dealer/role checks.

Why this matters:
1. Governance and real policy behavior are out of sync.
2. Access can be broader than intended for non-admin users.

Business impact (non-technical):
The rulebook says "restricted access," but current DB rules can allow wider access for logged-in users than intended.

### 13.4 High: Post-hardening "anon surface reduced" claim regressed for new bodyshop tables

Observed conflict:
1. Supabase hardening docs record strong anon-surface reduction outcomes.
2. Current dump shows new anon grants on bodyshop tables/functions.

Why this matters:
1. Even with RLS enabled, governance posture is weakened by broad grants.
2. It creates audit inconsistency: reported posture and actual grants diverge.

Business impact (non-technical):
Security cleanup was done earlier, but newer bodyshop changes reopened some exposure paths and documentation did not catch up.

### 13.5 High: Onboarding policy (deny-by-default) conflicts with migration-style auto-grant behavior

Observed conflict:
1. Onboarding policy states users should not get module access by default.
2. Bodyshop migration pattern includes automatic grant intent for all users.

Why this matters:
1. Violates explicit approval workflow.
2. Increases access without individual admin review.

Business impact (non-technical):
Users may receive access automatically where the policy says they should wait for admin approval.

## 14) Non-Developer Plain-Language Summary

If you are not technical, this is the important takeaway:

1. New features were added quickly and many things are working.
2. But the written rules, the migration files, and the live database are not fully aligned.
3. That mismatch causes three practical risks:
  - Access risk: some users may get broader access than expected.
  - Recovery risk: one migration may fail when rebuilding environments.
  - Operations risk: documents used by admins are out of date, so permission decisions can be wrong.
4. This is fixable. The immediate fix is to align one source of truth across:
  - app route mapping,
  - DB policies,
  - migration files,
  - RBAC/onboarding documentation.

## 15) Documentation Correction Checklist

1. Update `docs/Project_Handbook/MODULE_ROUTE_CONTRACT.md` to include all currently deployed modules and routes.
2. Add a change note in the contract documenting the bodyshop and tracker module additions.
3. Add a governance note in RBAC docs that bodyshop policies are pending hardening and must not use permissive `true` predicates.
4. Amend Supabase hardening tracker with a new entry documenting post-hardening regressions and closure plan.
5. Add a "migration replay readiness" check to release checklist: every new migration must match current canonical schema contracts.
