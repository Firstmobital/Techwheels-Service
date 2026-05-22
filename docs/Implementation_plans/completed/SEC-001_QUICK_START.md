# SEC-001 Quick Start: How to Begin the Security Refactor

**Plan:** [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md)  
**Status:** 🟢 READY TO START  
**Estimated Time:** 6-8 hours total  

---

## What Problem Does This Solve?

Your admin frontend currently exposes the Supabase service role key (VITE_SUPABASE_SERVICE_KEY) in the browser, which is a **CRITICAL security vulnerability**. An attacker can:
1. Open DevTools in your app
2. Find the service key in the JavaScript bundle
3. Call Supabase Auth API directly to:
   - Create/delete any user
   - Modify any database record
   - Bypass all RLS policies
   - Steal or delete all data

This plan moves all admin operations to secure Edge Functions (server-side) so the key never leaves the backend.

---

## Before You Start

✅ **Already Done:**
- Full 1334-line comprehensive plan written
- All 6 phases defined with task breakdown
- Edge Function code specs included
- Database validation steps documented
- Testing checklist prepared
- Rollback plan defined

✅ **Prerequisites Met:**
- Supabase project exists
- Node.js >=20.19.0 available
- Git repository ready
- Admin panel code available

❓ **You'll Need:**
- Supabase CLI: `npm install -g supabase` (if not installed)
- ~6-8 hours of focused development time
- Access to Supabase dashboard (for key rotation at end)
- Access to your production deployment system

---

## How to Read the Full Plan

Open [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md) and read in this order:

1. **Executive Summary** (top) - 2 min read
   - Understand the problem and solution approach

2. **Background & Architecture Context** - 3 min read
   - How dealer identity works in your current system
   - Why JWT is the source of truth for dealer code
   - What the vulnerability chain looks like

3. **Implementation Tasks** - 20 min read (per phase)
   - Each phase has detailed task breakdown
   - Code samples provided
   - Acceptance criteria clear
   - Commands to run are included

4. **Activity Tracker** - real-time reference
   - Update this as you work
   - Tracks Phase 1 through Phase 6

5. **Testing Checklist** - validation reference
   - What to test at each stage

6. **Rollback Plan** - disaster recovery reference
   - What to do if something goes wrong

---

## 6 Phases at a Glance

| Phase | Name | Duration | Key Deliverable |
|-------|------|----------|-----------------|
| 1 | Audit & Planning | 45 min | Service key usage audit; operations list |
| 2 | Edge Functions | 2.5 hrs | Two working Edge Functions + local testing |
| 3 | Frontend Refactor | 2 hrs | AdminPage.tsx with no service key; build passes |
| 4 | DB & Security | 1 hr | Audit logs table; RLS verification; documentation |
| 5 | Deployment | 1.5 hrs | Frontend deployed; edge functions live; key rotated |
| 6 | Documentation | 30 min | Secure pattern documented; plan archived |

---

## Detailed Phase-by-Phase Walkthrough

### Phase 1: Audit & Planning (45 min)

**Goal:** Understand exactly what needs to change.

**Tasks:**
1. **1.1** Find all service key references in code
   ```bash
   grep -r "VITE_SUPABASE_SERVICE_KEY" src/
   grep -r "auth/v1/admin" src/
   ```
   Expected: Find it in AdminPage.tsx only

2. **1.2** List every operation using service key
   - Email confirmation
   - Dealer metadata sync
   - (Any others?)

3. **1.3** Create supabase/functions/ directory structure
   ```bash
   mkdir -p supabase/functions/_shared
   ```

4. **1.4** Plan default dealership setting
   - Decide: environment variable vs settings table
   - MVP: Use VITE_DEFAULT_DEALER_CODE env var

**Deliverable:** Audit report + operations list + plan for Phase 2

---

### Phase 2: Edge Functions (2.5 hours)

**Goal:** Build secure server-side functions to replace frontend API calls.

**Tasks:**
1. **2.1** Create shared utilities
   - `supabase/functions/_shared/auth.ts` - JWT validation
   - `supabase/functions/_shared/cors.ts` - CORS headers
   - `supabase/functions/_shared/audit.ts` - Audit logging
   
   **Copy code from plan:** Lines ~520-650

2. **2.2** Create `confirm-user-email` Edge Function
   - `supabase/functions/confirm-user-email/index.ts`
   - Validates JWT, checks admin role, calls Auth API
   - Logs audit event
   
   **Copy code from plan:** Lines ~660-750

3. **2.3** Create `sync-dealer-metadata` Edge Function
   - `supabase/functions/sync-dealer-metadata/index.ts`
   - Updates user metadata with dealer code/name
   - Validates JWT, checks admin role, logs audit
   
   **Copy code from plan:** Lines ~780-850

4. **2.4** Test locally
   ```bash
   supabase start
   # Create test admin user
   # Get JWT
   # Call function with curl
   ```

**Deliverable:** Two working Edge Functions, tested locally

---

### Phase 3: Frontend Refactor (2 hours)

**Goal:** Remove service key from frontend, call Edge Functions instead.

**Tasks:**
1. **3.1** Remove service key from .env files
   ```bash
   grep -v "VITE_SUPABASE_SERVICE_KEY" .env.local > .env.local.tmp
   mv .env.local.tmp .env.local
   ```

2. **3.2** Refactor AdminPage.tsx
   - Delete `syncDealerToAuthMeta()` function (~30 lines)
   - Replace with Edge Function call (~10 lines)
   - Update `toggleUserActive()` to call `confirm-user-email` function
   - Update `createUser()` to use default dealer code
   
   **Copy code from plan:** Lines ~900-1000

3. **3.3** Add default dealer display in SettingsPage
   - Show VITE_DEFAULT_DEALER_CODE & VITE_DEFAULT_DEALER_NAME
   
   **Copy code from plan:** Lines ~1020-1050

4. **3.4** Build and verify
   ```bash
   npm run build
   grep "VITE_SUPABASE_SERVICE_KEY" dist/ || echo "✓ Safe"
   ```

**Deliverable:** Frontend code with no service key; build passes

---

### Phase 4: Database & Security (1 hour)

**Goal:** Verify DB schema and add audit logging.

**Tasks:**
1. **4.1** Create audit_logs table
   ```sql
   -- Copy from plan, line ~1100
   CREATE TABLE IF NOT EXISTS public.audit_logs (...)
   ```
   Run in Supabase SQL editor

2. **4.2** Verify RLS policies
   ```sql
   SELECT schemaname, tablename, policyname FROM pg_policies
   WHERE tablename = 'users';
   ```

3. **4.3** Verify is_admin() function
   - Should check: id = auth.uid() AND role = 'admin' AND is_active = true
   - Compare against authoritative dump

4. **4.4** Document secure pattern
   - Create `docs/ADMIN_OPERATIONS_SECURITY.md`
   - Copy template from plan, lines ~1130-1160

**Deliverable:** Audit infrastructure ready; documentation started

---

### Phase 5: Deployment (1.5 hours)

**Goal:** Deploy to production and rotate service key.

**Tasks:**
1. **5.1** Deploy frontend to production
   ```bash
   npm run build
   # Deploy to Vercel or your hosting
   vercel deploy --prod
   ```
   Verify: Admin panel loads, users list visible

2. **5.2** Deploy Edge Functions
   ```bash
   supabase deploy --project-ref [your-project-id] functions
   ```
   Verify: Functions are callable from production frontend

3. **5.3** Test in production
   - Admin activates a user (should work via edge function)
   - Admin sets dealer code (should work via edge function)
   - Check audit_logs table for entries

4. **5.4** Rotate service key
   - **CRITICAL:** Only after 5.1 and 5.2 complete
   - Go to Supabase Dashboard → Settings → API
   - Click "Rotate" on Service Role key
   - Verify admin operations still work

5. **5.5** Monitor 24 hours
   - Watch edge function logs
   - Watch audit logs
   - Monitor for user reports

**Deliverable:** Production deployment complete; key rotated; zero service key exposure

---

### Phase 6: Documentation (30 min)

**Goal:** Document the secure pattern for future reference.

**Tasks:**
1. **6.1** Finalize ADMIN_OPERATIONS_SECURITY.md
   - Add examples of both working edge functions
   - Add checklist for future admin features

2. **6.2** Update CONTRIBUTING.md
   - Add section: "Admin Operations Must Use Edge Functions"
   - Link to security documentation

3. **6.3** Archive this plan
   - Create entry in COMPLETED_PLANS.md
   - Mark SEC-001 as ✅ COMPLETED in INDEX.md

**Deliverable:** Secure pattern documented for team

---

## How to Track Progress

### Option 1: Edit the Activity Tracker
Open [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md), find "Activity Tracker" section, update status:

```
⏳ → 🔄 when you START a task
🔄 → ✅ when you COMPLETE a task
```

Example:
```
Before: ⏳ 1.1 | Audit all service key usage | — | — | — | Awaiting start
After:  ✅ 1.1 | Audit all service key usage | Vinod | 2026-05-22 | 2026-05-22 | Completed; found 2 locations
```

### Option 2: Post Updates to Team
After each phase, create a quick Slack message:

```
✅ PHASE 2 COMPLETE - Edge Functions

Edge functions deployed locally:
- confirm-user-email ✓
- sync-dealer-metadata ✓

Tested locally with admin JWT ✓
Ready for Phase 3 frontend refactor

Next: Remove service key from AdminPage.tsx
```

---

## Common Questions

### Q: Do I need to modify the database schema?
**A:** No. The authoritative schema does NOT have dealer_code/dealer_name on public.users. That's correct. Dealer identity stays in JWT only.

### Q: What if I'm not an admin?
**A:** Edge Functions validate the JWT and check is_admin(). Non-admin requests get 401 Unauthorized.

### Q: What happens if key rotation fails?
**A:** Key rotation is permanent and cannot be reversed. But it's safe—your edge functions won't use the old key, only the new one in the environment.

### Q: Can I test this locally before going to production?
**A:** YES. Run `supabase start` locally, deploy functions locally, test with your local JWT. Full end-to-end test possible before production.

### Q: How long is this going to take?
**A:** 6-8 hours total. You can do it in one day or spread across 2-3 days. Each phase is independent enough to pause/resume.

---

## Success Indicators

After you complete this plan, you should see:

✅ No `VITE_SUPABASE_SERVICE_KEY` in your frontend code  
✅ No `VITE_SUPABASE_SERVICE_KEY` in your dist/ build  
✅ Admin activating users works (via edge function)  
✅ Admin setting dealer code works (via edge function)  
✅ Audit logs table has entries for each admin action  
✅ Old service key is permanently rotated  
✅ Zero security warnings about exposed credentials  
✅ Team documentation updated with secure pattern  

---

## Next Steps

1. **Read the full plan:** [SECURITY_REFACTOR_SERVICE_KEY.md](SECURITY_REFACTOR_SERVICE_KEY.md)
2. **Understand Phase 1:** Takes 45 min to audit current code
3. **Start Phase 1:** Run the grep commands to find service key usage
4. **Update tracker:** Mark 1.1 as IN PROGRESS
5. **Ask questions:** If anything is unclear, refer to the detailed plan

---

**Ready to begin?** Start with Phase 1 audit. Copy the grep commands from the full plan and run them. Takes 10 minutes.

**Have questions?** Refer to the full plan—every task has acceptance criteria and code examples.

**Estimated Time to Complete Entire Plan:** 6-8 hours  
**Criticality:** 🔴 CRITICAL - Eliminates complete database vulnerability  

---

**Last Updated:** 2026-05-22  
**Status:** 🟢 READY TO START PHASE 1
