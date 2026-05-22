# Security Refactor: Complete Dealer-Scoped Admin System & Service Key Elimination

**Plan ID:** SEC-001  
**Created:** 2026-05-22  
**Last Updated:** 2026-05-22  
**Priority:** 🔴 CRITICAL  
**Owner:** Development Team  
**Target Completion:** 2026-05-24 EOD  

---

## Executive Summary

This plan refactors the entire admin identity model and eliminates frontend exposure of the Supabase service role key (VITE_SUPABASE_SERVICE_KEY), which grants full database privileges—a critical security vulnerability.

**Current State Problem:**
1. Service key exposed in browser frontend ([src/pages/AdminPage.tsx](../../src/pages/AdminPage.tsx#L60))—allows complete DB compromise.
2. Dealer assignment logic fragmented across auth metadata and public.users columns (which don't exist in authoritative schema).
3. Admin operations call Auth Admin API directly with service key instead of going through secure boundary.
4. No request validation in browser code; relying on frontend-only access control.

**Target State:**
1. Service key never leaves backend/Edge Functions.
2. Dealer identity stored exclusively in auth metadata (JWT path), matching RLS dependencies.
3. Public users table contains only role/branch/active status (no dealer duplication).
4. All admin operations validated server-side: JWT check, admin role check, audit logging.
5. Frontend calls secure Edge Functions that enforce authorization.

**Risk Level:** 🔴 CRITICAL (Key exposure can lead to data loss, account takeover)  
**Estimated Duration:** 6-8 hours (includes testing & validation)  
**Rollback Strategy:** Redeploy previous frontend + rotate service key immediately

---

## Objectives

1. ✅ **Remove service key exposure** from frontend code entirely
2. ✅ **Create secure Edge Function boundary** for all admin operations
3. ✅ **Unify dealer identity model** to auth metadata only (no public.users dealer columns needed)
4. ✅ **Add comprehensive request validation** (JWT, admin role, audit logging) in Edge Functions
5. ✅ **Refactor AdminPage** to use secure Edge Function endpoints instead of direct API calls
6. ✅ **Add "default dealership" setting** so new employees auto-inherit single dealer code
7. ✅ **Document secure pattern** for future admin features (users, roles, permissions)
8. ✅ **Rotate service key** after frontend deployment
9. ✅ **Achieve zero key exposure** in dist/ build and production frontend

---

## Current Vulnerability Details

### Location
- File: [src/pages/AdminPage.tsx](../../src/pages/AdminPage.tsx#L102-L116)
- Exposure: `import.meta.env.VITE_SUPABASE_SERVICE_KEY`

### Attack Vector
1. Attacker opens DevTools or inspects bundled JavaScript
2. Extracts service role key from VITE_ variable
3. Calls Supabase Auth Admin API directly with full privileges
4. Can create/delete/modify users, bypass RLS, access all data

### Impact
- Complete database compromise
- Unauthorized user account creation/deletion
- Data loss or theft
- Service disruption

---

## Implementation Tasks

### Phase 1: Setup & Planning
- [ ] **Task 1.1:** Audit all service key usage in codebase
- [ ] **Task 1.2:** Document all admin operations requiring service key
- [ ] **Task 1.3:** Create edge function structure in supabase/ folder
- [ ] **Task 1.4:** Set up local supabase CLI for testing edge functions

### Phase 2: Edge Function Development
- [ ] **Task 2.1:** Create edge function `functions/confirm-user-email.ts`
- [ ] **Task 2.2:** Implement JWT validation in edge function
- [ ] **Task 2.3:** Implement role check (admin-only) in edge function
- [ ] **Task 2.4:** Implement email_confirm API call using service key
- [ ] **Task 2.5:** Add error handling and logging
- [ ] **Task 2.6:** Test edge function locally

### Phase 3: Frontend Refactor
- [ ] **Task 3.1:** Remove VITE_SUPABASE_SERVICE_KEY from .env.local
- [ ] **Task 3.2:** Remove service key import from AdminPage.tsx
- [ ] **Task 3.3:** Replace direct auth API call with edge function call
- [ ] **Task 3.4:** Update toggleUserActive() to use edge function
- [ ] **Task 3.5:** Add error handling for edge function failures
- [ ] **Task 3.6:** Test admin flow end-to-end locally

### Phase 4: Validation & Security
- [ ] **Task 4.1:** Run npm audit and review results
- [ ] **Task 4.2:** Verify no VITE_SUPABASE_SERVICE_KEY in dist/ build
- [ ] **Task 4.3:** Check RLS policies on users/auth tables
- [ ] **Task 4.4:** Document the secure flow in README

### Phase 5: Deployment
- [ ] **Task 5.1:** Deploy updated frontend to production
- [ ] **Task 5.2:** Deploy edge function to production
- [ ] **Task 5.3:** Verify edge function is accessible in production
- [ ] **Task 5.4:** Rotate Supabase service role key
- [ ] **Task 5.5:** Verify admin operations work post-rotation
- [ ] **Task 5.6:** Monitor logs for errors in first 24h

### Phase 6: Documentation & Cleanup
- [ ] **Task 6.1:** Document edge function pattern in docs/
- [ ] **Task 6.2:** Update CONTRIBUTING.md with security guidelines
- [ ] **Task 6.3:** Remove this plan from TODO list (mark as COMPLETE)
- [ ] **Task 6.4:** Archive plan and add to COMPLETED_PLANS.md

---

## Activity Tracker

> **Update this section in real-time as work progresses.**  
> Format: `[Status] Task ID | Description | Assigned To | Started | Completed | Notes`

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 1: Setup & Planning
```
⏳ 1.1 | Audit all service key usage | — | — | — | Awaiting start
⏳ 1.2 | Document admin operations | — | — | — | Awaiting start
⏳ 1.3 | Create edge function structure | — | — | — | Awaiting start
⏳ 1.4 | Setup supabase CLI locally | — | — | — | Awaiting start
```

### Phase 2: Edge Function Development
```
⏳ 2.1 | Create functions/confirm-user-email.ts | — | — | — | Awaiting Phase 1 completion
⏳ 2.2 | Implement JWT validation | — | — | — | Awaiting Phase 1 completion
⏳ 2.3 | Implement role check (admin-only) | — | — | — | Awaiting Phase 1 completion
⏳ 2.4 | Implement email_confirm API call | — | — | — | Awaiting Phase 1 completion
⏳ 2.5 | Add error handling & logging | — | — | — | Awaiting Phase 2 progress
⏳ 2.6 | Test edge function locally | — | — | — | Awaiting Phase 2 progress
```

### Phase 3: Frontend Refactor
```
⏳ 3.1 | Remove VITE_SUPABASE_SERVICE_KEY from env | — | — | — | Awaiting Phase 2 completion
⏳ 3.2 | Remove service key import from AdminPage | — | — | — | Awaiting Phase 2 completion
⏳ 3.3 | Replace direct auth API call | — | — | — | Awaiting Phase 2 completion
⏳ 3.4 | Update toggleUserActive() function | — | — | — | Awaiting Phase 2 completion
⏳ 3.5 | Add error handling for edge function | — | — | — | Awaiting Phase 3 progress
⏳ 3.6 | Test admin flow end-to-end | — | — | — | Awaiting Phase 3 progress
```

### Phase 4: Validation & Security
```
⏳ 4.1 | Run npm audit | — | — | — | Awaiting Phase 3 completion
⏳ 4.2 | Verify no key in dist/ build | — | — | — | Awaiting Phase 3 completion
⏳ 4.3 | Check RLS policies | — | — | — | Awaiting Phase 3 completion
⏳ 4.4 | Document secure flow in README | — | — | — | Awaiting Phase 4 progress
```

### Phase 5: Deployment
```
⏳ 5.1 | Deploy updated frontend | — | — | — | Awaiting Phase 4 completion
⏳ 5.2 | Deploy edge function | — | — | — | Awaiting Phase 4 completion
⏳ 5.3 | Verify edge function in production | — | — | — | Awaiting deployment
⏳ 5.4 | Rotate Supabase service key | — | — | — | CRITICAL: After 5.1 & 5.2
⏳ 5.5 | Verify admin ops after rotation | — | — | — | Awaiting key rotation
⏳ 5.6 | Monitor logs for 24 hours | — | — | — | Awaiting deployment
```

### Phase 6: Documentation & Cleanup
```
⏳ 6.1 | Document edge function pattern | — | — | — | Awaiting Phase 5 completion
⏳ 6.2 | Update CONTRIBUTING.md | — | — | — | Awaiting Phase 5 completion
⏳ 6.3 | Remove from TODO list | — | — | — | Awaiting Phase 6 progress
⏳ 6.4 | Archive plan to COMPLETED_PLANS | — | — | — | Final step
```

---

## Detailed Task Breakdown

### Task 2.1: Create Edge Function `functions/confirm-user-email.ts`

**Acceptance Criteria:**
- Edge function file created at `supabase/functions/confirm-user-email/index.ts`
- Accepts POST request with `userId` in body
- Uses Supabase service role to call admin update
- Returns `{ success: true }` or `{ error: string }`

**Code Outline:**
```typescript
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    // Parse body
    const { userId } = await req.json()
    if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: corsHeaders })

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // Get service role client
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const admin = createClient(supabaseUrl, serviceRoleKey)

    // Verify caller is admin (extract from JWT)
    // ... TODO: Add role check

    // Confirm user email
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    })

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
```

---

### Task 3.4: Update `toggleUserActive()` in AdminPage

**Current Code (UNSAFE):**
```typescript
async function toggleUserActive(u: AppUser) {
  const activating = !u.is_active
  const { error } = await supabase.from('users').update({ is_active: activating }).eq('id', u.id)
  if (error) { showToast(error.message, 'error'); return }

  if (activating) {
    try {
      const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY  // ❌ UNSAFE
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
        body: JSON.stringify({ email_confirm: true }),
      })
    } catch (_e) {}
  }
  await loadUsers()
  showToast(activating ? 'User activated — can now log in' : 'User deactivated')
}
```

**New Code (SAFE):**
```typescript
async function toggleUserActive(u: AppUser) {
  const activating = !u.is_active
  const { error } = await supabase.from('users').update({ is_active: activating }).eq('id', u.id)
  if (error) { showToast(error.message, 'error'); return }

  if (activating) {
    try {
      const { error: edgeFnError } = await supabase.functions.invoke('confirm-user-email', {
        body: { userId: u.id },
      })
      if (edgeFnError) console.warn('Edge function warning:', edgeFnError)
    } catch (_e) {
      console.warn('Email confirm non-fatal:', _e)
    }
  }
  await loadUsers()
  showToast(activating ? 'User activated — can now log in' : 'User deactivated')
}
```

---

## Dependencies & Prerequisites

- [ ] Supabase project already created with correct URL & keys
- [ ] Local Node.js >= 20.19.0
- [ ] Supabase CLI installed locally (`npm install -g supabase`)
- [ ] Access to Supabase dashboard to rotate keys after deployment
- [ ] No other deployments scheduled during this window

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Edge function deployment fails | Low | High | Test locally first; rollback: redeploy old frontend |
| Service key leaked during transition | Low | Critical | Rotate key immediately after frontend deploys |
| Admin operations break for users | Low | High | Test end-to-end before production deployment |
| RLS policies block edge function | Medium | Medium | Review RLS; use service role which bypasses RLS |
| Build accidentally includes key | Low | Critical | Audit dist/, use env file gitignore |

---

## Success Criteria

- ✅ No VITE_SUPABASE_SERVICE_KEY in frontend code
- ✅ No VITE_SUPABASE_SERVICE_KEY in dist/ build output
- ✅ All admin operations use edge function
- ✅ Edge function validates caller identity & role
- ✅ Old service key is rotated
- ✅ Admin panel toggles user email confirmation without errors
- ✅ No console errors or warnings in production
- ✅ Plan is archived to COMPLETED_PLANS.md

---

## Communication & Sign-Off

**Stakeholders:**
- [ ] Development Lead: _______________ (Signature) (Date)
- [ ] Security Lead: _______________ (Signature) (Date)
- [ ] DevOps/Deployment: _______________ (Signature) (Date)

---

## Notes & Lessons Learned

> Add notes here as work progresses.

### 2026-05-22 Kickoff
- Plan created and shared with team
- Initial severity assessment: CRITICAL (key exposed in frontend)
- Estimated timeline: 3-5 hours for full implementation

---

## Related Documentation

- [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Supabase Admin API Reference](https://supabase.com/docs/reference/javascript/admin-api)
- [JWT Validation in Edge Functions](https://supabase.com/docs/guides/auth/auth-jwt)
- [OWASP Secret Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Last Updated:** 2026-05-22 by GitHub Copilot  
**Status:** 🔴 PENDING (Ready to start Phase 1)
