# Implementation Plans Index

**Last Updated:** 2026-05-31  
**Total Active Plans:** 8
**Mobile App Plans Added:** 2026-05-27

---

## 🎯 START HERE: Implementation Tracker

**→ [IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md)** ⭐ **MAIN REFERENCE**
- **Purpose**: Track progress across all 7 implementation phases
- **Updated**: After each phase completion
- **Use**: Daily reference for task status, blockers, and next steps
- **Workflow**: Mark tasks ✅ as complete, move docs to `/completed` folder

**→ [MOBILE-007_PLATFORM_HOME_SUPERAPP_TRACKER.md](MOBILE-007_PLATFORM_HOME_SUPERAPP_TRACKER.md)** ⭐ **SESSION RECOVERY TRACKER**
- **Purpose**: Resume mobile platform-home implementation from any interrupted chat without scope drift
- **Use**: Attach this single file in a new chat and continue from first TODO in Activity Tracker

---

## Quick Status Overview

| Plan ID | Title | Priority | Status | Owner | Start | End | Progress |
|---------|-------|----------|--------|-------|-------|-----|----------|
| SEC-001 | Security Refactor: Move Service Role Key | 🔴 CRITICAL | ✅ COMPLETED | Dev Team | 2026-05-22 | 2026-05-22 | 100% |
| RBAC-001 | Dynamic RBAC and Module Wiring Hardening | 🔴 CRITICAL | ✅ COMPLETED | Techwheels Admin + Dev Team + GitHub Copilot | 2026-05-23 | 2026-05-23 | 100% |
| AUTODOC-STATUS-001 | AutoDoc Prompt Execution Status Audit | 🟠 HIGH | 🟡 IN PROGRESS | GitHub Copilot | 2026-05-22 | 2026-05-23 | 96% |
| BODYSHOP-001 | Bodyshop Module End-to-End Workflow and Live Dashboard | 🔴 CRITICAL | 🔴 PENDING | Techwheels Product + Dev Team | 2026-05-22 | 2026-05-30 | 0% |
| DRIVE-001 | Universal Drive Upload and Storage Offload | 🟠 HIGH | 🔴 PENDING | Techwheels Admin + Dev Team | 2026-05-23 | 2026-05-24 | 0% |
| MOBILE-001 | Techwheels Mobile App - Expo Implementation | 🟡 HIGH | 🟠 IN PROGRESS | Development Team | 2026-05-27 | 2026-06-10 | 45% |
| MOBILE-005 | AutoDoc Mobile Parity with Mandatory GPS-Stamped Damage Photos | 🟡 HIGH | 🔴 PENDING | Techwheels Product + Mobile Dev Team | 2026-05-28 | 2026-06-05 | 0% |
| MOBILE-006 | Google Satellite Hybrid GPS Stamp Plan | 🟡 HIGH | 🔴 PENDING | Techwheels Product + Mobile/Web Dev Team | 2026-05-28 | 2026-06-06 | 0% |
| MOBILE-009 | Mobile App Redesign Parity Tracker (Reference-Locked + DB-Truth) | 🔴 CRITICAL | 🟠 IN PROGRESS | Techwheels Product + Mobile Engineering + GitHub Copilot | 2026-05-31 | TBD | 5% |

---

## Active Plans

### BODYSHOP-001: Bodyshop Module End-to-End Workflow and Live Dashboard
- **File:** [BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md](BODYSHOP-001_BODYSHOP_MODULE_END_TO_END.md)
- **Risk Level:** 🔴 HIGH (multi-role operational workflow + strict guardrail enforcement)
- **Status:** Pending kickoff
- **Latest Update:** 2026-05-22 - End-to-end implementation plan created for 23-stage SOP, live dashboard, pending trackers, and operational control points
- **Next Step:** Start Phase 1 (freeze schema contract, stage definitions, and validation guardrails)

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

### MOBILE-001: Techwheels Mobile App - Expo Implementation
- **Files:** 
  - [MOBILE-000_OVERVIEW.md](MOBILE-000_OVERVIEW.md) - Executive summary & quick reference
  - [MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md](MOBILE-001_EXPO_IMPLEMENTATION_PLAN.md) - Main implementation roadmap (7 phases)
  - [MOBILE-002_EXECUTION_CHECKLIST.md](MOBILE-002_EXECUTION_CHECKLIST.md) - Daily task checklist
  - [MOBILE-003_ARCHITECTURE.md](MOBILE-003_ARCHITECTURE.md) - Technical architecture & code structure
  - [MOBILE-004_FEATURE_MAPPING.md](MOBILE-004_FEATURE_MAPPING.md) - Feature specifications & user flows
  - [MOBILE-QUICK_REFERENCE.md](MOBILE-QUICK_REFERENCE.md) - Visual summary & key decisions
  - [REFERENCE_PROJECT_INTEGRATION.md](REFERENCE_PROJECT_INTEGRATION.md) ⭐ **NEW** - Reference project insights & patterns (12 proven patterns integrated)
- **Reference Project Used:** `local_folder/Reference/OtherGithubRepo/TECHWHEELS-WEB-(OtherProject)` (production-deployed, proven patterns)
- **Risk Level:** 🟢 LOW → MEDIUM (Reference project patterns reduce risk significantly)
- **Status:** In progress (Phases 1-3 complete, Phases 4-5 active)
- **Timeline:** 7-10 days for complete implementation (Phase 1: Setup → Phase 7: Deployment)
- **Scope:** 100% feature parity with web v1.0 + mobile-optimized UI/UX
- **Architecture:** Monorepo with symlinked shared code (0% duplication), Expo Router, React Native, NativeWind
- **Target Platforms:** Android (primary) + iOS (secondary)
- **Key Features:**
  - Authentication (login/signup/password reset)
  - Import (8 CSV types with column mapping)
  - Reports (4 categories with Victory Native charts)
  - AutoDoc (job cards, camera photos, documents, estimates)
  - Admin (user/permission management)
  - Settings (employee management)
- **Prerequisites:**
  - Expo account credentials
  - Node.js 20.19.0+
  - 7-10 days development time
- **Next Step:** Execute Phase 4 route validation matrix and close navigation gate

### MOBILE-005: AutoDoc Mobile Parity with Mandatory GPS-Stamped Damage Photos
- **File:** [MOBILE-005_AUTODOC_GPS_STAMP_PARITY_PLAN.md](MOBILE-005_AUTODOC_GPS_STAMP_PARITY_PLAN.md)
- **Risk Level:** 🟡 MEDIUM (camera/location permission dependency + image stamping runtime reliability)
- **Status:** Pending kickoff
- **Latest Update:** 2026-05-28 - Dedicated implementation plan created covering mobile AutoDoc stage-photo parity with mandatory GPS card stamping and DB metadata persistence.
- **Next Step:** Approve policy decisions (camera-only vs gallery allowed, strict block behavior), then start Phase 0 and Phase 1 tasks.

### MOBILE-006: Google Satellite Hybrid GPS Stamp Plan
- **File:** [MOBILE-006_GOOGLE_SATELLITE_HYBRID_STAMP_PLAN.md](MOBILE-006_GOOGLE_SATELLITE_HYBRID_STAMP_PLAN.md)
- **Risk Level:** 🟡 MEDIUM (external map API dependency + cost/rate-limit governance)
- **Status:** Pending kickoff
- **Latest Update:** 2026-05-28 - Hybrid implementation plan documented for server-side Google satellite imagery with mandatory fallback tile, caching, and billing guardrails.
- **Next Step:** Execute Phase 0 prerequisites (billing/quota/alerts/key restrictions), then start backend proxy implementation.

### MOBILE-009: Mobile App Redesign Parity Tracker (Reference-Locked + DB-Truth)
- **File:** [MOBILE-009_MOBILE_APP_REDESIGN_PARITY_TRACKER.md](MOBILE-009_MOBILE_APP_REDESIGN_PARITY_TRACKER.md)
- **Risk Level:** 🔴 HIGH (strict no-drift visual parity + schema-truth data contract)
- **Status:** In progress (planning complete, implementation pending)
- **Latest Update:** 2026-05-31 - Created full screen inventory tracker with DB-authoritative field mapping from `local_folder/backups/full_database.sql` and Body & Paint-first execution lane (use `local_folder/backups/chunks/full_database.sql.part_*` for large-file reads).
- **Next Step:** Start BP-01 implementation for `mobile/src/app/(tabs)/autodoc.tsx` using exact reference `bp` artboard parity.

---

## Completed Plans

### ✅ AUTH-001: Auth Email Recovery and User Access Continuity
- **File:** [completed/AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md](completed/AUTH-001_EMAIL_DELIVERY_RECOVERY_AND_USER_ACCESS.md)
- **Runbook:** [completed/AUTH-001_RUNBOOK.md](completed/AUTH-001_RUNBOOK.md)
- **Completed:** 2026-05-23
- **Summary:** Complete auth recovery and email hardening for user access continuity
  - All 3 phases completed: Immediate access recovery (temp password), user password rotation, email reliability hardening
  - Restored Vinod user account access via deployed set-user-temp-password edge function
  - Forced password rotation enforced on first login with new password verified
  - Resend SMTP configured with production-safe email rate limits
  - All auth email types tested: magic link, password recovery, signup confirmation
  - Runbook created with fallback paths and escalation procedures
- **DNS Status:** techwheels.in domain fully authenticated (SPF/DKIM/DMARC verified)
- **Email Provider:** Resend SMTP with service@techwheels.in sender

### ✅ RBAC-001: Dynamic RBAC and Module Wiring Hardening
- **File:** [completed/RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md](completed/RBAC-001_DYNAMIC_RBAC_AND_MODULE_WIRING.md)
- **Daily Tracker:** [completed/RBAC-001_DAILY_STANDUP_CHECKLIST.md](completed/RBAC-001_DAILY_STANDUP_CHECKLIST.md)
- **Completed:** 2026-05-23
- **Summary:** Complete RBAC hardening with deny-by-default access enforcement
  - All 5 phases completed: Frontend enforcement, module contract normalization, backend RLS hardening, onboarding gating, operational controls
  - Frontend RBAC guards added to all app routes and navigation
  - 5 high-risk tables secured with 16 RBAC policies (Phase 3.3: import_metadata, part_master, service_parts_consumption_data, service_parts_order_data, service_parts_stock_snapshot_data)
  - Legacy permissive policies removed
  - Onboarding state machine implemented (new users active but no modules until admin assignment)
  - Operational runbook for user permission assignment documented
- **QA Status:** Ready for immediate test execution (16 test suites defined)
- **Rollout Status:** Ready for immediate ops execution (user onboarding + permission assignment)
- **Git Commits:** Multiple tracking Phase 1-5 implementation and verification

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
