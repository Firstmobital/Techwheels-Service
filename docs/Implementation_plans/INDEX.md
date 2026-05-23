# Implementation Plans Index

**Last Updated:** 2026-05-23  
**Total Active Plans:** 6

---

## Quick Status Overview

| Plan ID | Title | Priority | Status | Owner | Start | End | Progress |
|---------|-------|----------|--------|-------|-------|-----|----------|
| SEC-001 | Security Refactor: Move Service Role Key | 🔴 CRITICAL | ✅ COMPLETED | Dev Team | 2026-05-22 | 2026-05-22 | 100% |
| AUTODOC-STATUS-001 | AutoDoc Prompt Execution Status Audit | 🟠 HIGH | 🟡 IN PROGRESS | GitHub Copilot | 2026-05-22 | 2026-05-23 | 96% |
| AUTH-001 | Auth Email Recovery and User Access Continuity | 🟠 HIGH | � IN PROGRESS | Techwheels Admin + Dev Team | 2026-05-22 | 2026-05-23 | 65% |
| RBAC-001 | Dynamic RBAC and Module Wiring Hardening | 🔴 CRITICAL | 🟡 REVIEW | Techwheels Admin + Dev Team + GitHub Copilot | 2026-05-23 | 2026-05-26 | 100% |
| BODYSHOP-001 | Bodyshop Module End-to-End Workflow and Live Dashboard | 🔴 CRITICAL | 🔴 PENDING | Techwheels Product + Dev Team | 2026-05-22 | 2026-05-30 | 0% |
| DRIVE-001 | Universal Drive Upload and Storage Offload | 🟠 HIGH | 🔴 PENDING | Techwheels Admin + Dev Team | 2026-05-23 | 2026-05-24 | 0% |

---

## Active Plans

### RBAC-001: Dynamic RBAC and Module Wiring Hardening
- **File:** [RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md)
- **Daily Tracker:** [RBAC-001_DAILY_STANDUP_CHECKLIST.md](RBAC-001_DAILY_STANDUP_CHECKLIST.md)
- **Risk Level:** 🔴 CRITICAL (access control + policy hardening)
- **Status:** Implementation complete; awaiting stakeholder sign-off
- **Latest Update:** 2026-05-23 - DBL-0004 initial SQL Editor apply timed out; lock-safe retry migration + checks added
- **Next Step:** Execute lock-safe retry migration (rerun until all sections apply), then run paired checks and update ledger status

### BODYSHOP-001: Bodyshop Module End-to-End Workflow and Live Dashboard
- **File:** [BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md](BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md)
- **Risk Level:** 🔴 HIGH (multi-role operational workflow + strict guardrail enforcement)
- **Status:** Pending kickoff
- **Latest Update:** 2026-05-22 - End-to-end implementation plan created for 23-stage SOP, live dashboard, pending trackers, and operational control points
- **Next Step:** Start Phase 1 (freeze schema contract, stage definitions, and validation guardrails)

### AUTH-001: Auth Email Recovery and User Access Continuity
- **File:** [AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md](AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md)
- **Risk Level:** 🟡 MEDIUM (temporary credential handling + SMTP/rate-limit dependency)
- **Status:** Engineering implementation complete; operational execution in progress
- **Latest Update:** 2026-05-22 - Temp-password edge function + Admin UI fallback implemented and function deployed to Supabase
- **Next Step:** Execute user operation for Vinod (issue one-time temp password, validate login, force password rotation) + complete SMTP hardening

### AUTODOC-STATUS-001: AutoDoc Prompt Execution Status Audit
- **File:** [AUTODOC_EXECUTION_STATUS_2026-05-22.md](AUTODOC_EXECUTION_STATUS_2026-05-22.md)
- **Risk Level:** 🟡 MEDIUM (schema deployed; dump sync and app parity pending)
- **Status:** Audit complete, implementation partially complete
- **Latest Update:** 2026-05-22 - Reports export controls wired and scripted E2E checklist passed (10/10)
- **Next Step:** Owner decision on contract scope (in-scope implementation track vs documented exception)

### DRIVE-001: Universal Drive Upload and Storage Offload
- **File:** [DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md](DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md)
- **Risk Level:** 🟡 MEDIUM (external API dependency + file lifecycle correctness)
- **Status:** Pending kickoff
- **Latest Update:** 2026-05-23 - Plan created for Drive offload pipeline with Techwheels_Service root, registration foldering, and regno_doctype_date.ext naming.
- **Next Step:** Complete Phase 2.1/2.2 by creating and sharing Techwheels_Service Drive root folder to service account

---

## Completed Plans

### ✅ SEC-001: Security Refactor - Service Role Key Exposure
- **File:** [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md)
- **Completed:** 2026-05-22
- **Summary:** Complete security refactor eliminating service key exposure from frontend
  - All 6 phases completed: Audit, Edge Functions, Frontend, Database, Deployment (prep), Documentation
  - 2 Edge Functions created: confirm-user-email, sync-dealer-metadata
  - Frontend AdminPage.tsx refactored to use Edge Functions
  - Build verified with zero key exposure
  - Audit logging infrastructure created
  - Secure admin operations pattern documented
- **Deployment Status:** Ready for production (see [SEC-001_DEPLOYMENT.md](SEC-001_DEPLOYMENT.md))
- **Git Commit:** 7376427

---

## Plan Lifecycle

1. **PENDING** → Plan created, waiting to start
2. **IN PROGRESS** → Work actively underway
3. **REVIEW** → Completed, awaiting sign-off
4. **COMPLETED** → Deployed and archived
5. **BLOCKED** → Awaiting external dependencies

---

## How to Use This Index

1. **View Quick Status:** Check the table above for all plans at a glance
2. **Update Progress:** Edit the "Progress" column and "Status" when work changes
3. **View Details:** Click on plan file link to see full task breakdown and activity tracker
4. **Update Activity Tracker:** Go to individual plan file and update the tracker section in real-time
5. **Archive Completed Plans:** Move completed plan details to COMPLETED_PLANS.md and mark as ✅ COMPLETED

---

## Quick Update Template

Use this when reporting progress on Slack/Email:

```
📋 IMPLEMENTATION PLAN UPDATE

Plan: SEC-001 - Security Refactor
Status: IN PROGRESS → Phase 2 (Edge Function Development)
Completed: Tasks 1.1, 1.2, 1.3, 1.4
In Progress: Task 2.1 (Create edge function)
Blockers: None
ETA: 2026-05-23 EOD

Next: Complete edge function, then move to frontend refactor
```

---

## Navigation

- 📄 [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md) - Full plan with activity tracker
- 📄 [AUTODOC_EXECUTION_STATUS_2026-05-22.md](AUTODOC_EXECUTION_STATUS_2026-05-22.md) - AutoDoc done/pending audit vs authoritative schema
- 📄 [AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md](AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md) - Auth email throttle recovery and access continuity plan
- 📄 [AUTH-001_RUNBOOK.md](AUTH-001_RUNBOOK.md) - Operator runbook for temporary-password fallback and SMTP hardening
- 📄 [RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md) - Dynamic module permission enforcement and backend RBAC hardening plan
- 📄 [RBAC-001_DAILY_STANDUP_CHECKLIST.md](RBAC-001_DAILY_STANDUP_CHECKLIST.md) - Compact daily standup checklist (done/in-progress/next/blockers)
- 📄 [BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md](BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md) - Bodyshop module implementation plan (23-stage workflow + live dashboard)
- 📄 [DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md](DRIVE-001_UNIVERSAL_DRIVE_UPLOAD_AND_STORAGE_OFFLOAD.md) - Universal Drive upload, DB link writeback, and Supabase storage cleanup plan
- 📄 COMPLETED_PLANS.md (Coming soon)

---

**Managed by:** GitHub Copilot  
**Last Sync:** 2026-05-23 11:05 AM IST
