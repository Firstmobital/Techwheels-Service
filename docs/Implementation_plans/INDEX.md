# Implementation Plans Index

**Last Updated:** 2026-05-22  
**Total Active Plans:** 2

---

## Quick Status Overview

| Plan ID | Title | Priority | Status | Owner | Start | ETA | Progress |
|---------|-------|----------|--------|-------|-------|-----|----------|
| SEC-001 | Security Refactor: Move Service Role Key | 🔴 CRITICAL | 🔴 PENDING | Dev Team | 2026-05-22 | 2026-05-23 | 0% |
| AUTODOC-STATUS-001 | AutoDoc Prompt Execution Status Audit | 🟠 HIGH | 🟡 IN PROGRESS | GitHub Copilot | 2026-05-22 | 2026-05-23 | 95% |

---

## Active Plans

### 1. SEC-001: Security Refactor - Service Role Key Exposure
- **File:** [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md)
- **Risk Level:** 🔴 CRITICAL
- **Status:** Ready to start
- **Latest Update:** 2026-05-22 - Plan created and ready for Phase 1
- **Next Step:** Start Phase 1 - Audit service key usage

### 2. AUTODOC-STATUS-001: AutoDoc Prompt Execution Status Audit
- **File:** [AUTODOC_EXECUTION_STATUS_2026-05-22.md](AUTODOC_EXECUTION_STATUS_2026-05-22.md)
- **Risk Level:** 🟡 MEDIUM (schema deployed; dump sync and app parity pending)
- **Status:** Audit complete, implementation partially complete
- **Latest Update:** 2026-05-22 - Reports export controls wired and scripted E2E checklist passed (10/10)
- **Next Step:** Manual E2E walkthrough and strict PPT/Excel format parity validation

---

## Completed Plans

> None yet. Plans will be archived here upon completion.

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
- 📄 COMPLETED_PLANS.md (Coming soon)

---

**Managed by:** GitHub Copilot  
**Last Sync:** 2026-05-22 11:30 AM IST
