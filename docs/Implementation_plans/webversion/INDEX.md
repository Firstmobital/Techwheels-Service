# Web Version Plans Index

Last Updated: 2026-09-04
Scope: Web project implementation plans only
Authority: This index is the routing source for webversion plans

---

## 1) Folder Contract

All web planning documents must be inside:
- `docs/Implementation_plans/webversion/categories/<category>/{active|evidence|inactive}/`

Web categories currently in use:
- `autodoc`
- `bodyshop`
- `complaints`
- `drive`
- `help-tickets`
- `import`
- `operations`
- `parts`
- `rbac`
- `reception`
- `redesign`
- `supabase`
- `warranty`

---

## 2) Main Tracker

Use this file as daily command center:
- `docs/Implementation_plans/webversion/IMPLEMENTATION_TRACKER.md`

---

## 3) Active Plan Registry

| Plan ID | Category | Status | Owner | File |
|---|---|---|---|---|
| BODYSHOP-FLOW | bodyshop | In Progress | Bodyshop Team | `docs/Implementation_plans/webversion/categories/bodyshop/active/Bodyshop-Flow.md` |
| BODYSHOP-QUEUE-001 | bodyshop | Active | Bodyshop Team + Platform Team | `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-QUEUE-001_CANONICAL_STAGE_WORKLIST_BACKEND_PLAN_2026-06-20.md` |
| BODYSHOP-EARNINGS-001 | bodyshop | Active | Bodyshop Team + Platform Team | `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-EARNINGS-001_BODYSHOP_TRACKER_SOLO_BONUS_SUPPORT_SPLIT_PLAN_2026-07-17.md` |
| BODYSHOP-SETTLEMENT-001 | bodyshop | In Progress (DBL-0026 VERIFIED in full_metadata; DBL-0029 APPLIED) | Bodyshop Team + Platform Team + Accounts | `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-SETTLEMENT-001_PAYMENT_RECONCILIATION_LEDGER_PLAN_2026-09-04.md` |
| BODYSHOP-RECOVERY-001 | bodyshop | Active (v1 DO-only; DBL-0031 PROPOSED) | Bodyshop Team + Platform Team + Accounts | `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-RECOVERY-001_DO_INSURANCE_RECOVERY_BOOK_PLAN_2026-09-04.md` |
| BODYSHOP-LOOKUP-001 | bodyshop | Active (web implemented; QA pending) | Bodyshop Team + Platform Team | `docs/Implementation_plans/webversion/categories/bodyshop/active/BODYSHOP-LOOKUP-001_REPAIR_TRACKER_GLOBAL_SEARCH_PLAN_2026-09-04.md` |
| CMP-00 | complaints | Active | Complaints Team | `docs/Implementation_plans/webversion/categories/complaints/active/00_INDEX.md` |
| CMP-01 | complaints | Active | Complaints Team | `docs/Implementation_plans/webversion/categories/complaints/active/01_COMPREHENSIVE_PLAN.md` |
| CMP-CHECKLIST | complaints | Active | Complaints Team | `docs/Implementation_plans/webversion/categories/complaints/active/CHECKLIST.md` |
| CMP-PHASES | complaints | Active | Complaints Team | `docs/Implementation_plans/webversion/categories/complaints/active/PHASES.md` |
| DRIVE-001 | drive | Active | Platform Team | `docs/Implementation_plans/webversion/categories/drive/active/DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md` |
| HELP-00 | help-tickets | Done | Platform Team + Web + Mobile | `docs/Implementation_plans/webversion/categories/help-tickets/active/00_INDEX.md` |
| HELP-001 | help-tickets | Done | Platform Team + Web + Mobile | `docs/Implementation_plans/webversion/categories/help-tickets/active/HELP-001_COMPREHENSIVE_PLAN.md` |
| HELP-CHECKLIST | help-tickets | Done | Platform Team + Web + Mobile | `docs/Implementation_plans/webversion/categories/help-tickets/active/CHECKLIST.md` |
| HELP-PHASES | help-tickets | Done | Platform Team + Web + Mobile | `docs/Implementation_plans/webversion/categories/help-tickets/active/PHASES.md` |
| IMPORT-001 | import | Active | Import Team | `docs/Implementation_plans/webversion/categories/import/active/IMPORT_UPLOAD_GOVERNING_PLAN_2026-06-06.md` |
| IMPORT-002 | import | Proposed (PSF-only, web /import) | Import Team + Platform Team + Ops | `docs/Implementation_plans/webversion/categories/import/active/IMPORT-002_PSF_INCREMENTAL_UPSERT_GOVERNANCE_PLAN_2026-06-26.md` |
| TECH-EARNINGS-001 | operations | Active | Operations Team | `docs/Implementation_plans/webversion/categories/operations/active/TECH-EARNINGS-001_TECHNICIAN_DAILY_EARNINGS_EMAIL_AUTOMATION_PLAN_2026-06-09.md` |
| EARNINGS-EMAIL-002 | operations | Active | Operations Team + Bodyshop Team | `docs/Implementation_plans/webversion/categories/operations/active/EARNINGS-EMAIL-002_SA_BODYSHOP_MANPOWER_EARNINGS_EMAIL_PLAN_2026-07-17.md` |
| OPS-WA-GROUP | operations | Active | Operations Team | `docs/Implementation_plans/webversion/categories/operations/active/WA_GROUP_CREATION_IMPLEMENTATION_PLAN.md` |
| OPS-INCOME-LEGACY | operations | Active | Operations Team | `docs/Implementation_plans/webversion/categories/operations/active/income_technician.md` |
| OPS-UPDATION-001 | operations | Implemented (pending manual Meta setup) | Operations Team | `docs/Implementation_plans/webversion/categories/operations/active/OPS-UPDATION-001_UPDATION_REMINDER_WHATSAPP_AUTOMATION_PLAN.md` |
| PARTS-001 | parts | Active (spec locked; preview first) | Parts Team + Platform Team | `docs/Implementation_plans/webversion/categories/parts/active/PARTS-001_SERVICE_ADVISOR_PARTS_ORDER_DATE_AND_GGN_STOCK_PLAN_2026-08-24.md` |
| RBAC-001 | rbac | Active | RBAC Team | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-001_MASTER_PLAN_ACTIVE.md` |
| RBAC-HOME | rbac | Active | RBAC Team | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC_HOME_DYNAMIC_ROLE_VISIBILITY_PLAN_2026-06-05.md` |
| RBAC-002 | rbac | Pending Execution | RBAC Team + Bodyshop Team + Platform Team | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-002_BODYSHOP_STANDALONE_RECEPTION_RBAC_PLAN_2026-06-20.md` |
| RBAC-003 | rbac | Active (Audit complete) | RBAC Team + Platform Team | `docs/Implementation_plans/webversion/categories/rbac/active/RBAC-003_EMPLOYEE_MASTER_MULTI_BUSINESS_ROLE_CSV_PLAN_2026-07-18.md` |
| RECEPTION-001 | reception | Active | Reception Team | `docs/Implementation_plans/webversion/categories/reception/active/RECEPTION-001_RECEPTION_MODULE_PLAN.md` |
| VEHICLE-PICKUP-001 | reception | Active (audit complete) | Reception Team + Operations Team + Platform Team | `docs/Implementation_plans/webversion/categories/reception/active/VEHICLE-PICKUP-001_VEHICLE_PICKUP_MODULE_PLAN.md` |
| WEBREDESIGN-MASTER | redesign | In Progress | Web UX Team | `docs/Implementation_plans/webversion/categories/redesign/active/Webredesign_IMPLEMENTATION_PLAN_MASTER_TRACKER.md` |
| SUPABASE-001 | supabase | Active | Platform Team | `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md` |
| SUPABASE-002 | supabase | Active | Platform Team | `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-002_ALL_SERVICE_DATA_DYNAMIC_TABLE_REALTIME_SYNC_PLAN_2026-06-20.md` |
| SUPABASE-003 | supabase | Done (verify 14.40) | Platform Team | `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-003_SERVICE_HISTORY_SYNC_QUEUE_PERFORMANCE_PLAN_2026-07-21.md` |
| SUPABASE-004 | supabase | Phase 3 verified; Phase 5 insurance sync planned | Platform Team | `docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-004_IDSPAY_RC_ADVANCE_VERIFICATION_EDGE_FUNCTION_PLAN_2026-07-22.md` |
| WARRANTY-001 | warranty | Active | Warranty Team | `docs/Implementation_plans/webversion/categories/warranty/active/WARRANTY-001_WARRANTY_REPORT_IMPORT_AND_REPORTING_PLAN.md` |

---

## 4) Evidence Registry

| Category | File |
|---|---|
| autodoc | `docs/Implementation_plans/webversion/categories/autodoc/evidence/AUTODOC_EXECUTION_STATUS_2026-05-22.md` |
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BP-01_DASHBOARD_DEEP_AUDIT.md` |
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-QUEUE-001_PARITY_CHECKLIST_2026-06-20.md` |
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-EARNINGS-001_TEST_MATRIX.md` |
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-SETTLEMENT-001_TEST_MATRIX.md` |
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/evidence/BODYSHOP-LOOKUP-001_TEST_MATRIX.md` |
| rbac | `docs/Implementation_plans/webversion/categories/rbac/evidence/runbooks/ADMIN_BYPASS_RLS_GOVERNANCE.md` |
| rbac | `docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_AUDIT_2026-07-18.md` |
| rbac | `docs/Implementation_plans/webversion/categories/rbac/evidence/RBAC-003_BUSINESS_ROLES_CSV_TEST_MATRIX.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/P1_01_CONNECTION_POOLING_AUDIT.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/P1_03_SLOW_QUERY_ANALYSIS.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/P1_04_INDEX_AUDIT_REPORT.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/SUPABASE-004_METADATA_AUDIT_RTO_IDSPAY_SYNC_2026-07-22.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/SUPABASE-004_PHASE3_DEPLOY_CURL_2026-07-22.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/SUPABASE-004_IDSPAY_SERVICE_DOCUMENTATION_AUDIT_2026-07-22.md` |
| supabase | `docs/Implementation_plans/webversion/categories/supabase/evidence/runbooks/SUPABASE_P0_05_LEAKED_PASSWORD_ROLLOUT_CHECKLIST.md` |
| warranty | `docs/Implementation_plans/webversion/categories/warranty/evidence/WARRANTY-001_JSONB_EXTRACTION_MAPPINGS.md` |
| warranty | `docs/Implementation_plans/webversion/categories/warranty/evidence/WARRANTY-002_DESIGN_AUDIT_MISSING_WIRING.md` |
| parts | `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_SHEET_AUDIT_2026-08-24.md` |
| parts | `docs/Implementation_plans/webversion/categories/parts/evidence/PARTS-001_GGN_STOCK_MOCKUP.html` |

---

## 5) Inactive Registry

| Category | File |
|---|---|
| bodyshop | `docs/Implementation_plans/webversion/categories/bodyshop/inactive/BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md` |

---

## 6) Archive Link

Completed web plans live at:
- `docs/Implementation_plans/completed/webversion/`
