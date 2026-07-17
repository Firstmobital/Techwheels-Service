# Web Version Implementation Tracker

Last Updated: 2026-07-17
Scope: All webversion plans under active execution or review

Legend:
- NS = Not Started
- IP = In Progress
- BL = Blocked
- RV = Review
- DN = Done (ready to archive)

---

## Master Table

| Plan ID | Category | Title | Status | Owner | Source File | Last Updated |
|---|---|---|---|---|---|---|
| BODYSHOP-FLOW | bodyshop | Bodyshop module flow | IP | Bodyshop Team | docs/Implementation_plans/webversion/categories/bodyshop/active/Bodyshop-Flow.md | 2026-06-18 |
| BODYSHOP-QUEUE-001 | bodyshop | Canonical stage worklist backend | IP | Bodyshop Team + Platform Team | docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-QUEUE-001_CANONICAL_STAGE_WORKLIST_BACKEND_PLAN_2026-06-20.md | 2026-06-20 |
| BODYSHOP-EARNINGS-001 | bodyshop | Bodyshop tracker solo bonus + support split earnings | IP | Bodyshop Team + Platform Team | docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-EARNINGS-001_BODYSHOP_TRACKER_SOLO_BONUS_SUPPORT_SPLIT_PLAN_2026-07-17.md | 2026-07-17 |
| CMP-01 | complaints | Complaints comprehensive plan | IP | Complaints Team | docs/Implementation_plans/webversion/categories/complaints/active/01_COMPREHENSIVE_PLAN.md | 2026-06-18 |
| DRIVE-001 | drive | Universal drive upload and storage offload | IP | Platform Team | docs/Implementation_plans/webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md | 2026-06-18 |
| IMPORT-001 | import | Import upload governing plan | IP | Import Team | docs/Implementation_plans/webversion/categories/import/active/IMPORT_UPLOAD_GOVERNING_PLAN_2026-06-06.md | 2026-06-18 |
| IMPORT-002 | import | PSF incremental upsert governance plan (web /import only) | NS | Import Team + Platform Team + Ops | docs/Implementation_plans/webversion/categories/import/active/IMPORT-002_PSF_INCREMENTAL_UPSERT_GOVERNANCE_PLAN_2026-06-26.md | 2026-06-26 |
| TECH-EARNINGS-001 | operations | Technician daily earnings email automation | IP | Operations Team | docs/Implementation_plans/webversion/categories/operations/active/TECH-EARNINGS-001_TECHNICIAN_DAILY_EARNINGS_EMAIL_AUTOMATION_PLAN_2026-06-09.md | 2026-06-18 |
| RBAC-001 | rbac | RBAC implementation master | IP | RBAC Team | docs/Implementation_plans/webversion/categories/rbac/active/RBAC_IMPLEMENTATION_MASTER_2026-06-01.md | 2026-06-18 |
| RBAC-002 | rbac | Bodyshop standalone reception RBAC decoupling | NS | RBAC Team + Bodyshop Team + Platform Team | docs/Implementation_plans/webversion/categories/rbac/active/RBAC-002_BODYSHOP_STANDALONE_RECEPTION_RBAC_PLAN_2026-06-20.md | 2026-06-20 |
| RECEPTION-001 | reception | Reception module plan | IP | Reception Team | docs/Implementation_plans/webversion/categories/reception/active/RECEPTION-001_RECEPTION_MODULE_PLAN.md | 2026-06-18 |
| WEBREDESIGN-MASTER | redesign | Web redesign master tracker | IP | Web UX Team | docs/Implementation_plans/webversion/categories/redesign/active/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md | 2026-06-18 |
| SUPABASE-001 | supabase | Supabase production hardening master plan | IP | Platform Team | docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md | 2026-06-18 |
| SUPABASE-002 | supabase | all_service_data dynamic physical table realtime sync | IP | Platform Team | docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-002_ALL_SERVICE_DATA_DYNAMIC_TABLE_REALTIME_SYNC_PLAN_2026-06-20.md | 2026-06-20 |
| WARRANTY-001 | warranty | Warranty report import and reporting plan | IP | Warranty Team | docs/Implementation_plans/webversion/categories/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md | 2026-06-18 |

---

## Tracker Rules

1. Every new web plan must get a row here the same day it is created.
2. `DN` rows must be moved to completed mirror path within 24 hours of sign-off.
3. If blocked, add blocker reason directly in plan file and set status `BL`.
4. Keep one row per plan authority file (not per evidence file).
