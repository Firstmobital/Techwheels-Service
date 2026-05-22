# Implementation Plan: AUTH-001

**Plan ID:** AUTH-001  
**Created:** 2026-05-22  
**Priority:** HIGH  
**Owner:** Techwheels Admin + Dev Team  

---

## Executive Summary

Supabase Auth email operations are currently blocked by project-level rate limits (`email rate limit exceeded`), which prevents invite resend, magic link, and password recovery for existing users such as `vinodexodus@gmail.com`.

This plan restores immediate user access without relying on email delivery, preserves the existing Vinod account, and then hardens long-term email reliability through SMTP and rate-limit tuning. The sequence is designed to unblock operations today while preventing repeat incidents.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 2-4 hours (excluding SMTP DNS propagation delays)  
**Rollback Strategy:** Revert to manual password resets via Supabase dashboard/admin API and temporarily disable email-dependent flows in runbook.

---

## Objectives

1. Keep the existing Vinod user account and avoid deleting/recreating identity.
2. Set a one-time temporary password using Supabase Admin API (no email required).
3. Ensure first login succeeds and force immediate password change by user.
4. Configure SMTP + Supabase Auth limits so invite/magic link/recovery are reliable in production.

---

## Context & Background

- Current failure: Supabase dashboard actions `Send magic link` and `Send password recovery` both return `email rate limit exceeded`.
- Existing behavior confirms redirect URL configuration is fixed, but email sending is throttled upstream.
- Vinod needs immediate access now; email-based self-service cannot be relied on until mail provider and limits are corrected.

---

## Implementation Tasks

### Phase 1: Immediate Access Recovery (No Email Dependency)
- [ ] **Task 1.1:** Identify Vinod's auth user ID in Supabase Authentication -> Users.
- [ ] **Task 1.2:** Set a strong temporary password via deployed `set-user-temp-password` function with `email_confirm: true`.
- [ ] **Task 1.3:** Share temporary password with Vinod through approved secure channel (not email if possible).
- [ ] **Task 1.4:** Confirm Vinod can sign in at production URL.

### Phase 2: User Password Rotation and Verification
- [ ] **Task 2.1:** Instruct Vinod to change password immediately after first login.
- [ ] **Task 2.2:** Verify second login works using new password.
- [ ] **Task 2.3:** Close temporary credential window by confirming old temp password is no longer in use.

### Phase 3: Email Reliability Hardening
- [ ] **Task 3.1:** Configure custom SMTP provider in Supabase Auth (Resend/SendGrid/SES).
- [ ] **Task 3.2:** Validate sender domain and DNS records (SPF/DKIM/DMARC as provider requires).
- [ ] **Task 3.3:** Set production-safe email rate limits in Supabase Auth settings.
- [ ] **Task 3.4:** Test all outbound auth mail types: invite/confirmation, magic link, password recovery.
- [x] **Task 3.5:** Update operations runbook with limits, fallback path, and escalation owner.

---

## Activity Tracker

> **Update this section in real-time as work progresses.**

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1
```
🔄 1.1 | Capture Vinod auth user ID | Admin | 2026-05-22 | - | User visible in Supabase Users list; select exact target row
🔄 1.2 | Set temp password via deployed function + email_confirm true | Admin/Dev | 2026-05-22 | - | Edge function + Admin UI shipped; execute for Vinod now
⏳ 1.3 | Send temp credential via secure channel | Admin | - | - | Avoid plain email where possible
⏳ 1.4 | Validate production login | Vinod + Admin | - | - | Record timestamp
```

### Phase 2
```
⏳ 2.1 | Vinod changes password immediately | Vinod | - | - | Must be same session/day
⏳ 2.2 | Verify login with new password | Vinod + Admin | - | - | Confirm no lockout
⏳ 2.3 | Confirm temp password retired | Admin | - | - | Mark as closed
```

### Phase 3
```
⏳ 3.1 | SMTP provider configured in Supabase | Dev | - | - | Use production sender
⏳ 3.2 | DNS authentication validated | Dev/Ops | - | - | SPF/DKIM/DMARC pass
⏳ 3.3 | Email rate limits tuned | Dev/Ops | - | - | Based on expected volume
⏳ 3.4 | End-to-end auth email tests pass | QA/Admin | - | - | Invite + magic + recovery
✅ 3.5 | Runbook updated and shared | Dev Team | 2026-05-22 | 2026-05-22 | See AUTH-001_RUNBOOK.md
```

---

## Dependencies & Prerequisites

- [ ] Supabase project owner/admin access.
- [ ] Service role credentials available to authorized operator.
- [ ] Approved secure channel to transmit temporary credentials.
- [ ] SMTP account ready (provider API key/credentials + verified domain).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Temporary password leakage | Medium | High | Use one-time strong password + immediate rotation + secure channel only |
| SMTP not fully authenticated (DNS delay) | Medium | Medium | Start DNS setup early; keep admin API fallback documented |
| Misconfigured rate limits causing repeat failures | Medium | High | Run controlled load tests and keep conservative buffers |

---

## Success Criteria

- ✅ Existing Vinod account remains active; no user recreation required.
- ✅ Vinod successfully logs in with temporary password once and rotates to personal password.
- ✅ All auth emails (invite/magic/recovery) send successfully in production after SMTP setup.
- ✅ Documented fallback process exists for future rate-limit incidents.

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Admin Owner: _______________ (Signature) (Date)
- [ ] Dev Owner: _______________ (Signature) (Date)
- [ ] Ops/Security Reviewer: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

### 2026-05-22 - Implementation Update
- Added edge function: `supabase/functions/set-user-temp-password/index.ts`.
- Added Admin UI action `Temp Password` in `src/pages/AdminPage.tsx` users table.
- Deployed function to Supabase project: `set-user-temp-password`.
- Verified frontend build succeeds after implementation.
- Added runbook: `AUTH-001_RUNBOOK.md`.

### 2026-05-22 - Incident Capture
- Dashboard auth mail actions failed due to Supabase project email rate limit.
- Redirect URL settings were correct; issue isolated to email throttle.
- Admin API password set path chosen as immediate user access fallback.

---

## Related Documentation

- [Implementation Plans Index](INDEX.md)
- [AUTH-001 Runbook](AUTH-001_RUNBOOK.md)
- [Project Handbook README](../Project_Handbook/README.md)

---

**Last Updated:** 2026-05-22 by GitHub Copilot  
**Status:** � IN PROGRESS
