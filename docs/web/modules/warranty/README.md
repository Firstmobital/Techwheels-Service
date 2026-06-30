# Warranty Docs

Scope: warranty verification evidence and audit records.

## Audit Evidence Set

- `evidence/CRITICAL_ALERTS_AUDIT_20260603.md`
- `evidence/EARNINGS_ZERO_VALIDATION.md`

## Lifecycle Separation Rule

- Keep active implementation tracking under `docs/Implementation_plans/.../warranty/...`.
- Keep completed audits and validations in this category.

## Promoted Implementation Items

Promotion records for completed-and-verified active-plan items, per `docs/STRUCTURE_GUIDE.md` Section 28/30 and `docs/shared/reference/catalog/IMPLEMENTATION_PROMOTION_SUMMARY_TEMPLATE.md`.

### Promotion Record

- Promotion Date (IST): 2026-06-29 00:00:00 IST
- Platform: webversion
- Category: warranty
- Plan ID: WARRANTY-001
- Source Active Plan Path: `docs/Implementation_plans/webversion/categories/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md`
- Source Task ID(s): TR-043-NEW
- Source Phase/Subphase: Traceability Matrix (Database-Backed, corrected 2026-06-02) / Role-Correct Dealer Scope Contract
- Priority: P1
- Verification State: Verified

### What Was Implemented

- Role-correct dealer scope contract: admin users are dealer-agnostic for warranty reporting; non-admin users remain restricted to active `user_employee_links` mappings.
- Migration `supabase/migrations/20260603170500_admin_unrestricted_rls_bypass.sql` applied to add admin-unrestricted RLS bypass on dealer-bound policies.
- Scope resolution wired through `src/lib/api/auth.ts` and consumed in `src/pages/reports/warranty/WarrantyOverviewReport.tsx`.

### Verification Evidence

- Verification Method: Post-execution SQL policy-count verification query against the authoritative database.
- Evidence Artifact Path(s):
  - `docs/Implementation_plans/webversion/categories/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md` (TR-043-NEW row, Implementation Tracker section)
- Verification Outcome: Pass — admin-bypass policy present on all touched tables: `service_parts_order_data=4`, `service_reception_entries=4`, `settings_model_options=4`, `vehicles=3`, `storage.objects=4`. Non-admin scope confirmed to remain mapped-dealer restricted.
- Verified On (IST): 2026-06-03 (per source plan)

### Result and Impact

- Expected result: Admin users see warranty data across all mapped dealer codes without being blocked by dealer-bound RLS predicates.
- Observed result: Admin-bypass policy coverage confirmed on all 5 touched tables; non-admin scope behavior unchanged.
- Residual risk: TR-044-NEW (broadening this same scope contract across all 28 warranty reports) remains Pending in the active plan — this promotion covers only the narrow RLS-bypass migration in TR-043-NEW, not the full 28-report rollout.

### Active Plan Compaction Mapping

- Active plan row/status updated: No — row left in place; this is a promotion-without-removal record (active plan still tracks the broader warranty program and is not ready for compaction).
- Detailed execution narrative compacted: No.
- Reference back-link added in active plan/evidence: Yes — `docs/Implementation_plans/webversion/categories/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md` (TR-043-NEW row).

### Follow-up

- Next dependent task(s): TR-044-NEW (full 28-report scope rollout)
- Owner: Dev Team
- Target window: Unscheduled (tracked in active plan)
