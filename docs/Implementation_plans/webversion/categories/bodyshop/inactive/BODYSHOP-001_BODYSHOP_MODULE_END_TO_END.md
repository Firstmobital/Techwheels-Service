# Implementation Plan: BODYSHOP-001

**Plan ID:** BODYSHOP-001  
**Created:** 2026-05-22  
**Priority:** CRITICAL  
**Owner:** Techwheels Product + Dev Team  

---

## Executive Summary

This plan defines a complete end-to-end Bodyshop Module inside the existing Techwheels app, aligned to the full SOP process from gate entry to insurance payment closure. The module will support all 23 operational stages, mandatory document/photo controls, advisor-led workflow execution, and live dashboard visibility for SM/GM monitoring.

The implementation target is a production-ready, fully interactive workflow with job-card level progress tracking, stage transitions, financial checkpoints, delivery controls, and exception alerts. The solution includes floor-wise workshop execution visibility, pending-action filters, and strict gate checks so operational policy is enforced by system logic.

**Risk Level:** 🔴 HIGH  
**Estimated Duration:** 5-8 working days (dev + QA + UAT)  
**Rollback Strategy:** Feature-flag the Bodyshop module route/menu and revert to existing job-card workflow while preserving captured records.

---

## Objectives

1. Implement the complete 23-stage Bodyshop SOP as a trackable digital workflow.
2. Create live dashboard reporting for inflow, pending process stages, workshop status, and financial/delivery controls.
3. Enforce mandatory checkpoints (approval + parts before work start; DO + payment before delivery).
4. Provide advisor/CRM/management friendly UI for fast updates, filtering, and escalation tracking.
5. Launch a stable module that is ready for daily operations, training, and monitoring.

---

## Context & Background

Current operations require one systemized Bodyshop flow that connects vehicle intake, insurance process, work execution, documents/photos, billing, and delivery controls. The business has defined a detailed SOP and dashboard requirements, including claim-type capture, WhatsApp group workflow, stage-wise progress, and pending trackers.

This plan translates that SOP into an implementable app module in the same Techwheels codebase, with clear phase execution, acceptance gates, and operational controls.

---

## Authoritative Schema Baseline (Audited 2026-05-22)

**Authority Source:** `local_folder/backups/full_database.sql`  
**Large-file access layer:** `local_folder/backups/chunks/full_database.sql.part_*`  
**Authority Rule:** If any conflict appears between docs/code and schema assumptions, the dump wins without reconciliation.

### Confirmed Existing Public Objects (Use As-Is)
- `public.vehicles`
- `public.job_cards`
- `public.panels`
- `public.panel_photos`
- `public.estimate_rows`
- `public.documents`
- `public.job_card_summary` (security_invoker view)

### Confirmed Existing Types and Functions
- Enum types: `public.job_card_status`, `public.panel_action`, `public.photo_type`, `public.doc_type`
- Functions: `public.my_dealer_code()`, `public.set_updated_at()`
- Trigger: `trg_job_cards_updated_at` on `public.job_cards`

### Confirmed Existing Security Model
- RLS enabled on: `vehicles`, `job_cards`, `panels`, `panel_photos`, `estimate_rows`, `documents`
- Dealer isolation enforced via policies that depend on `public.my_dealer_code()`
- Storage RLS policies exist for bucket `autodoc` with dealer-prefixed path enforcement

### Confirmed Existing Operational Dependencies
- Storage bucket `autodoc` exists with allowed MIME set for image/pdf/video/ppt/xls files
- Module registry table `public.modules` exists, but no seeded `bodyshop` module row is present in dump data

### Confirmed Gaps (Do Not Assume Existing)
- No dedicated Bodyshop-specific table set exists in current authoritative dump
- No database enum/state model for 23-stage Bodyshop lifecycle exists today
- No dump-verified trigger/function/policy currently encodes Bodyshop transition guardrails

### Implementation Constraint
- Do not claim or reference any table/column/function/trigger/policy as existing unless present in the audited dump
- Any new persistence model required for 23-stage SOP must be delivered as additive migration work in later phases

---

## Scope Definition

### In Scope
- New Bodyshop module screens in existing app shell.
- New Job Card (Gate Entry) flow with claim and customer capture.
- Full 23-stage transition engine:
  1. Receiving
  2. Photos
  3. Docs
  4. Claim Form
  5. Estimate
  6. Intimation
  7. Survey
  8. Approval
  9. Parts
  10. Work Start
  11. Mechanical
  12. Denting
  13. Painting
  14. Fitting
  15. Rubbing
  16. Re-Inspection
  17. Parts Entry
  18. Billing
  19. DO
  20. Diff Payment
  21. Delivery
  22. Customer Payment
  23. Insurance Payment
- Job Card detail modal/page with stage click-advance and progress bar.
- Mandatory document/photo tracking and status toggles.
- Live dashboard metrics and pending trackers.
- Sidebar quick filters (Pending Docs, Pending Approval, In Workshop, Pending Billing, Pending Delivery, Pending Payment).

### Out of Scope (Phase 1)
- Automated WhatsApp API integration (Phase 1 uses simulated/group-created status tracking).
- Third-party insurer API integration.
- Advanced BI exports beyond current dashboard/report scope.

---

## Implementation Tasks

### Phase 0: Authority Lock (Dump-First)
- [x] **Task 0.1:** Audit authoritative dump and freeze baseline objects for Bodyshop module design.
- [x] **Task 0.2:** Confirm existing RLS, policy, trigger, and storage constraints for AutoDoc/Bodyshop-adjacent flow.
- [x] **Task 0.3:** Record known schema gaps and prohibit assumption-based schema references.

### Phase 1: Module Foundation and Data Contract
- [ ] **Task 1.1:** Map SOP fields to currently existing objects (`vehicles`, `job_cards`, `panels`, `panel_photos`, `estimate_rows`, `documents`) without assuming missing DB fields.
- [ ] **Task 1.2:** Define app-layer 23-stage canonical order and transition rules compatible with current `job_card_status` enum limits.
- [ ] **Task 1.3:** Define additive migration scope for any required Bodyshop fields/entities not present in authoritative dump.
- [ ] **Task 1.4:** Define alert rules (aging vehicles 10+ days, pending approvals, pending billing/delivery/payment).

### Phase 2: New Job Card (Gate Entry) Experience
- [ ] **Task 2.1:** Build New Job Card form for claim type, reg no, model, customer, insurance, work floor, advisor.
- [ ] **Task 2.2:** Add document checklist for mandatory collection (8 docs + optional KYC/affidavit/GST).
- [ ] **Task 2.3:** Implement number plate capture/photo placeholders and vehicle photo buckets (exterior/interior).
- [ ] **Task 2.4:** Add WhatsApp group creation action (Phase 1 simulation + audit note).
- [ ] **Task 2.5:** Persist gate-entry data in dump-verified objects and initialize app-layer stage as Receiving.

### Phase 3: Job Card Detail and 23-Stage Workflow Engine
- [ ] **Task 3.1:** Build detail modal/page with full process timeline and stage jump controls.
- [ ] **Task 3.2:** Implement stage transition guardrails (cannot start work without approval + parts confirmation).
- [ ] **Task 3.3:** Implement delivery guardrails (cannot deliver without DO + payment clearance).
- [ ] **Task 3.4:** Add capture fields for claim number, surveyor name/mobile, DO amount, difference amount, receipts.
- [ ] **Task 3.5:** Add stage-wise timestamps (start/finish where applicable) and operator attribution.

### Phase 4: Live Dashboard and Tracking Views
- [ ] **Task 4.1:** Implement top KPI cards (total received, in-progress, ready for delivery, pending approval).
- [ ] **Task 4.2:** Implement process pending sections (docs, estimate, intimation, survey, approval, parts).
- [ ] **Task 4.3:** Implement work-floor pending sections (mechanical, denting, painting, fitting, re-inspection).
- [ ] **Task 4.4:** Implement financial/delivery pending sections (billing, delivery, customer payment, insurance payment).
- [ ] **Task 4.5:** Add today alerts and aging indicators with urgent red threshold (10+ days in shop).

### Phase 5: Vehicle List, Filters, and Operations UX
- [ ] **Task 5.1:** Build All Vehicles table with reg no, owner, model, claim type, advisor, stage, days-in-shop.
- [ ] **Task 5.2:** Add color-coded stage badges and urgency styling for aging jobs.
- [ ] **Task 5.3:** Add quick filters matching dashboard statuses.
- [ ] **Task 5.4:** Add search/sort controls for advisor, stage, claim type, and aging.
- [ ] **Task 5.5:** Ensure responsive behavior for desktop and tablet workflows.

### Phase 6: Testing, UAT, and Rollout
- [ ] **Task 6.1:** Execute stage-by-stage test script for all 23 transitions and guardrail checks.
- [ ] **Task 6.2:** Validate mandatory uploads and rejection scenarios.
- [ ] **Task 6.3:** Run dashboard reconciliation checks against test dataset.
- [ ] **Task 6.4:** Complete advisor/CRM/BSM/SM/GM UAT sign-off.
- [ ] **Task 6.5:** Publish SOP-aligned training note and go-live checklist.

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 0
```
✅ 0.1 | Audit authoritative dump baseline | GitHub Copilot | 2026-05-22 | 2026-05-22 | Source fixed to local_folder/backups/full_database.sql
✅ 0.2 | Verify RLS/policies/triggers/storage constraints | GitHub Copilot | 2026-05-22 | 2026-05-22 | Dealer-isolated RLS confirmed on core tables
✅ 0.3 | Register schema gaps and no-invention rule | GitHub Copilot | 2026-05-22 | 2026-05-22 | No Bodyshop-specific schema found in dump
```

### Phase 1
```
⏳ 1.1 | Map SOP to existing dump-backed objects | Dev Team | - | - | No assumption of non-existent columns
⏳ 1.2 | Define 23-stage app-layer order/rules | Dev Team | - | - | DB enum currently has 5 statuses only
⏳ 1.3 | Define additive migration scope | Dev Team | - | - | Only for missing persistence requirements
⏳ 1.4 | Alert/aging rule definitions | Product + Dev | - | - | 10+ day urgency threshold
```

### Phase 2
```
⏳ 2.1 | Build New Job Card screen | Frontend | - | - | Gate entry baseline
⏳ 2.2 | Implement document checklist | Frontend | - | - | Mandatory docs with status flags
⏳ 2.3 | Add photo capture buckets | Frontend | - | - | Number plate + ext/int
⏳ 2.4 | Add WhatsApp group action | Frontend | - | - | Simulated tracking action
⏳ 2.5 | Persist creation + stage init | Frontend + API | - | - | App-layer stage init only
```

### Phase 3
```
⏳ 3.1 | Build job-card detail workflow view | Frontend | - | - | Clickable stage timeline
⏳ 3.2 | Enforce work-start guardrails | Frontend + API | - | - | Approval + parts required
⏳ 3.3 | Enforce delivery guardrails | Frontend + API | - | - | DO + payments required
⏳ 3.4 | Add claim/survey/DO/payment fields | Frontend | - | - | Includes receipt upload
⏳ 3.5 | Add stage timestamps + assignee trail | Frontend + API | - | - | Auditability
```

### Phase 4
```
⏳ 4.1 | Build live KPI cards | Frontend | - | - | Total/in-progress/ready/pending approval
⏳ 4.2 | Build process-pending tracker | Frontend | - | - | Docs->parts coverage
⏳ 4.3 | Build workshop-stage tracker | Frontend | - | - | Mechanical->reinspection
⏳ 4.4 | Build financial/delivery tracker | Frontend | - | - | Billing/delivery/payments
⏳ 4.5 | Add daily alerts and urgency flags | Frontend | - | - | Aging and pending criticals
```

### Phase 5
```
⏳ 5.1 | Build All Vehicles grid | Frontend | - | - | Core operational list
⏳ 5.2 | Add stage color coding | Frontend | - | - | Fast visual scan
⏳ 5.3 | Add dashboard quick filters | Frontend | - | - | Pending views
⏳ 5.4 | Add search/sort controls | Frontend | - | - | Multi-field filters
⏳ 5.5 | Optimize responsive UX | Frontend | - | - | Tablet/desktop first
```

### Phase 6
```
⏳ 6.1 | Run 23-stage transition tests | QA | - | - | Positive + negative cases
⏳ 6.2 | Validate upload requirements | QA | - | - | Documents/photos mandatory checks
⏳ 6.3 | Validate dashboard reconciliation | QA + Ops | - | - | KPI accuracy
⏳ 6.4 | Complete UAT sign-off | Ops + Management | - | - | Advisor/CRM/BSM/SM/GM
⏳ 6.5 | Publish training + go-live note | Product + Ops | - | - | SOP operational handover
```

---

## Dependencies & Prerequisites

- [ ] Authoritative dump baseline accepted: `local_folder/backups/full_database.sql`.
- [ ] Final SOP sign-off for all stage definitions and mandatory checkpoints.
- [ ] Role mapping confirmation for Advisor, CRM, BSM, SM, GM, CCM.
- [ ] Approved data fields for insurance, surveyor, DO, and payment records.
- [ ] UAT sample job cards covering major/minor loss and payment scenarios.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Schema assumptions drift from authoritative dump | Medium | High | Enforce dump-first rule and block non-audited references |
| Stage transition ambiguity from real-world exceptions | Medium | High | Freeze canonical transition rules with product + operations before build |
| Missing uploads/document quality causing downstream delays | High | High | Enforce mandatory checks and add blocked-state reason prompts |
| Dashboard mismatch vs operational reality | Medium | High | Daily reconciliation during UAT with controlled sample set |
| User adoption friction across multiple roles | Medium | Medium | Role-based training and quick-filter driven workflows |

---

## Success Criteria

- ✅ All 23 SOP stages are executable and visible in a single tracked workflow.
- ✅ Dashboard auto-updates all required pending trackers and KPI cards.
- ✅ Control points are enforced by system rules (no unauthorized work start/delivery).
- ✅ Operations can filter and act on pending jobs in under 3 clicks.
- ✅ UAT sign-off completed by Advisor, CRM, BSM, SM, and GM representatives.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Product Owner: _______________ (Signature) (Date)
- [ ] Development Lead: _______________ (Signature) (Date)
- [ ] Operations Lead (BSM/SM): _______________ (Signature) (Date)
- [ ] Management Reviewer (GM): _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-05-22 - Plan Kickoff
- Full SOP and dashboard requirements captured for Bodyshop lifecycle.
- 23-stage operational flow converted into implementation-ready sequence.
- Critical control points defined as mandatory system guardrails.

### 2026-05-22 - Authority Audit Applied
- Audited `local_folder/backups/full_database.sql` and locked it as schema authority for this plan.
- Confirmed core AutoDoc entities, dealer-isolated RLS policies, and `autodoc` storage bucket/policies.
- Confirmed no Bodyshop-dedicated schema currently exists; additive migration planning is required for full SOP persistence.

---

## Related Documentation

- [Implementation Plans Index](../../INDEX.md)
- [Project Handbook README](docs/shared/README.md)
- [AutoDoc Execution Status](../../autodoc/evidence/AUTODOC_EXECUTION_STATUS_2026-05-22.md)

---

**Last Updated:** 2026-05-22 by GitHub Copilot  
**Status:** 🔴 PENDING
