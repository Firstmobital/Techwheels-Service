# RBAC Operations Runbook

**Document ID:** OPS-001  
**Version:** 1.0  
**Date:** 2026-05-23  
**Owner:** Techwheels Operations & Admin Team  
**Status:** ACTIVE  

---

## Quick Reference

| Scenario | Action | Time | Docs |
|----------|--------|------|------|
| New user signup | User self-registers via `/` | 2 min | [New User Onboarding](#new-user-onboarding) |
| Assign module access | Admin → Admin Panel → Add permissions | 3 min | [Assign Module Permissions](#assign-module-permissions) |
| User forgot password | User → Reset password link | 5 min | [Password Reset](#password-reset) |
| User cannot access module | Check admin panel for permissions | 5 min | [Access Troubleshooting](#access-troubleshooting) |
| Emergency access revocation | Admin → Admin Panel → Deactivate user | 2 min | [Revoke User Access](#revoke-user-access) |
| Audit user activity | Check RLS logs / audit_logs table | 10 min | [Audit & Monitoring](#audit--monitoring) |

---

## Glossary

- **Module**: A feature set (Job Cards, Reports, Employees, etc.) tied to permission system
- **Permission**: A module assignment for a user with can_view, can_modify, can_delete flags
- **Dealer Code**: Organization identifier scoping user's data access
- **is_active**: User account status (true = can log in, false = blocked)
- **Role**: Job category (admin, manager, staff, viewer) — affects default permissions
- **RLS**: Row-Level Security — backend policy enforcing data access

---

# Operational Procedures

---

## New User Onboarding

### Step 1: User Self-Signup

**Timeline:** 2-5 minutes

1. User goes to app login page (`/`)
2. User clicks "Create new account"
3. User enters:
   - Full name
   - Email address
   - Password (8+ characters)
   - Password confirmation
4. User clicks "Sign up"
5. **Result:** Confirmation email sent

### Step 2: Email Confirmation

**Timeline:** 1-10 minutes

1. User receives email with confirmation link
2. User clicks link → redirected to `/auth/callback`
3. Session established, user logged in
4. **Result:** User sees "No module access assigned" screen
5. **Next:** Admin must assign module permissions (see [Assign Module Permissions](#assign-module-permissions))

### Step 3: Initial Admin Review

**Timeline:** Within 1 business day

1. Admin logs in to app (`/admin`)
2. Admin sees new user in user list
3. Admin determines appropriate role/modules
4. Admin assigns permissions (see next section)

### User Experience

**New User Sees:**
```
Title: "Module access required"
Message: "Your account is active, but you don't have permission to access any modules yet.
          Contact your administrator to request access to:
          • Job Cards
          • Reports  
          • Employees
          • AutoDoc"
```

---

## Assign Module Permissions

### Prerequisites

- You are logged in with **admin role**
- Target user has completed signup and email confirmation
- You know the user's email address

### Procedure

**Timeline:** 2-3 minutes

#### Via Admin Panel (Recommended)

1. Open app and navigate to `/admin` (Admin Panel)
2. In **User Management** section, find target user by email
3. Click user row → opens **Permission Assignment** panel
4. Checkboxes appear for each module:
   - [ ] Job Cards (can_view, can_modify)
   - [ ] Invoices (can_view, can_modify)
   - [ ] Parts Inventory (can_view)
   - [ ] Parts Orders (can_view, can_modify)
   - [ ] Parts Consumption (can_view)
   - [ ] Employees (can_view, can_modify)
   - [ ] Reports (can_view)
   - [ ] Admin (can_view, can_modify)
5. Check boxes for desired modules
   - **Note:** Most users should have `can_view` enabled
   - **Staff/Manager:** Usually enable `can_modify` for their modules
   - **Viewer role:** Usually `can_view` only
6. Click "Save Permissions"
7. **Result:** Success message → permissions take effect

### Recommended Module Sets by Role

#### Admin
```
✓ Job Cards (can_view, can_modify)
✓ Invoices (can_view, can_modify)
✓ Parts Inventory (can_view, can_modify)
✓ Parts Orders (can_view, can_modify)
✓ Parts Consumption (can_view)
✓ Employees (can_view, can_modify)
✓ Reports (can_view)
✓ Admin (can_view, can_modify)
```

#### Manager / Supervisor
```
✓ Job Cards (can_view, can_modify)
✓ Employees (can_view, can_modify)
✓ Reports (can_view)
- Admin (usually not)
```

#### Staff / Service Technician
```
✓ Job Cards (can_view, can_modify)
✓ Employees (can_view)
✓ AutoDoc (can_view, can_modify)
- Reports
- Admin
```

#### Viewer / Report-Only
```
✓ Reports (can_view)
- All others
```

### Verification

After assigning permissions:

1. **Admin view:** User row now shows assigned module count
2. **User's next login:** 
   - Refresh page or logout/login
   - New modules appear in sidebar
   - User can navigate to accessible routes
3. **Expected:** User sees exactly the assigned modules, no more/less

### Undo / Change Permissions

1. Admin Panel → User Management
2. Find user → click to edit
3. Uncheck boxes to revoke modules
4. Check boxes to grant modules
5. Click "Save Permissions"
6. **Result:** Changes take effect immediately (user's next page load)

---

## Password Reset

### User-Initiated Reset (Self-Service)

**Timeline:** 2-5 minutes

1. User at login page (`/`)
2. User clicks "Forgot password?"
3. User enters email address
4. **Result:** Email sent with reset link
5. User clicks link in email
6. User enters new password
7. User logs in with new password

### Admin-Initiated Reset (Force Change)

**Timeline:** 5-10 minutes (requires Supabase console access)

1. Go to Supabase dashboard
2. Navigate to **Authentication** → **Users**
3. Find user by email
4. Click user row → **User details**
5. In **Email/Password** section, look for:
   - Generate reset link → send to user
   - OR: Set new password directly (if admin access)
6. Send link to user OR notify them of new password
7. User resets password on next login

---

## Revoke User Access

### Deactivate User (Soft Delete)

**Timeline:** 1 minute

1. Admin Panel (`/admin`)
2. User Management section
3. Find user row
4. Toggle **is_active** to OFF (or click "Deactivate")
5. Confirm: "User will not be able to log in"
6. **Result:** 
   - User cannot log in
   - Existing sessions remain valid until expiry
   - No data deleted

**Recovery:** Toggle is_active back to ON

### Remove Module Permission (Partial Revoke)

**Timeline:** 2 minutes

1. Admin Panel (`/admin`)
2. User Management → Find user
3. Permission Assignment panel
4. Uncheck modules to revoke
5. Save
6. **Result:** User loses access to unchecked modules on next page load

### Delete User Account (Hard Delete)

**Timeline:** 5-10 minutes (requires Supabase console)

⚠️ **WARNING: This is permanent and affects all user data/audit logs**

1. Supabase dashboard → **Authentication** → **Users**
2. Find user email
3. Click **Delete user**
4. Confirm deletion
5. **Result:** User record and auth entry removed

---

## Access Troubleshooting

### User Says "I Cannot See Module X"

**Step 1: Verify Module Permission**

1. Admin Panel (`/admin`)
2. User Management → Find user
3. Check permission panel: Does module have checkmark?
   - **If NO:** Assign permission (see [Assign Module Permissions](#assign-module-permissions))
   - **If YES:** Proceed to Step 2

**Step 2: Verify User Status**

1. Admin Panel → User Management
2. Check `is_active` field:
   - **If OFF:** Activate user
   - **If ON:** Proceed to Step 3

**Step 3: Session Refresh**

1. Have user **logout** (sign out)
2. Have user **log back in**
3. Check if module appears now

**Step 4: Cache/Browser Issue**

1. Have user **clear browser cache** (Ctrl+Shift+Del or Cmd+Shift+Del)
2. Have user **refresh page** (F5 or Cmd+R)
3. Check if module appears

**Step 5: If Still Not Working**

1. Check browser console (F12 → Console tab) for errors
2. Check network tab for failed requests
3. If error visible: Screenshot and escalate to engineering
4. If no visible error: May be RLS/dealer scope issue (see Step 6)

**Step 6: Dealer Scoping Check**

1. Verify user's **dealer_code** is set correctly
2. Verify job card/data exists for that dealer
3. If user is new: Ask admin to verify dealer assignment in user metadata
4. If issue persists: Escalate to engineering (possible RLS bug)

---

## Audit & Monitoring

### Check User Permission History

**Via Admin Panel:**

1. Admin Panel (`/admin`)
2. User Management → Click user → View permission log
   - Shows all permission changes
   - Shows timestamps and admin who made changes
3. Can filter by date range

**Via SQL (Requires Supabase Console Access):**

```sql
-- See all permission assignments for user
SELECT 
  user_id, 
  module_id, 
  can_view, 
  can_modify, 
  can_delete,
  created_at,
  updated_at
FROM public.user_module_permissions
WHERE user_id = 'user-uuid-here'
ORDER BY updated_at DESC;
```

### Check User Login Activity

**Via Supabase Console:**

1. **Authentication** → **Users**
2. Find user → click
3. Scroll to **Sign-in activity**
   - Last login time
   - Login IP address
   - Device info
   - Failed login attempts

### Check Audit Logs

**Via SQL (if audit_logs table populated):**

```sql
-- See recent actions by user
SELECT 
  id,
  user_id,
  action,
  table_name,
  details,
  created_at
FROM public.audit_logs
WHERE user_id = 'user-uuid-here'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 20;
```

### Monitor Permission Changes

**Recommended Workflow:**

1. **Daily standup check** (see [RBAC-001_DAILY_STANDUP_CHECKLIST.md](../Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md))
2. **Weekly permission audit:**
   - Count users per role
   - Flag any unexpected permission combinations
   - Verify new users have been processed
3. **Monthly access review:**
   - Reconcile permissions with current organizational roles
   - Revoke access for inactive users
   - Document changes in DB_CHANGE_LEDGER.md

---

## Common Issues & Solutions

### Issue 1: User Can See Routes But API Calls Fail

**Symptom:** User navigates to module page, but data doesn't load or shows error

**Cause:** Frontend permission granted, but backend RLS denies access

**Solution:**
1. Verify module permission is assigned (admin panel)
2. Verify user's dealer_code is set (admin user details)
3. Check browser console for API error messages
4. If error is "RLS policy", escalate to engineering

### Issue 2: Sidebar Is Empty

**Symptom:** User logs in, sidebar shows no modules

**Cause:** User has zero permissions OR frontend isn't loading permissions

**Solution:**
1. Admin panel: Verify user has at least one module assigned
2. If assigned: Have user refresh page (F5)
3. If still empty: Have user clear cache and logout/login
4. If still empty: Check browser console for errors, escalate if needed

### Issue 3: User Can Access Route After Permissions Revoked

**Symptom:** Admin revokes permission, but user still sees module

**Cause:** User hasn't refreshed/logged back in yet

**Solution:**
1. Explain that changes take effect on next page load/login
2. Have user refresh page (F5)
3. If still visible: Have user logout and login again
4. If STILL visible: Possible frontend bug, escalate to engineering

### Issue 4: Admin Panel Doesn't Load

**Symptom:** Admin user navigates to `/admin`, sees AccessDenied

**Cause:** User role is not 'admin' in users table

**Solution:**
1. Verify user role in `public.users`:
   ```sql
   SELECT email, role FROM public.users WHERE email = 'admin@example.com';
   ```
2. If role is not 'admin', update it:
   ```sql
   UPDATE public.users SET role = 'admin' WHERE email = 'admin@example.com';
   ```
3. Have user logout/login
4. Try `/admin` again

### Issue 5: New User Email Confirmation Link Expires

**Symptom:** User clicks email link, sees "Link expired" or "Invalid confirmation"

**Cause:** User took >24-48 hours to confirm, or link already used

**Solution:**
1. Have user go to login page and click "Resend confirmation email"
2. User clicks new link in email
3. If issue persists: Supabase dashboard → Authentication → Resend confirmation email manually

---

## Rollback Procedures

### Scenario: Critical RBAC Bug After Deployment

### Option A: Immediate Frontend Rollback (5 minutes)

If new RBAC code introduced security bug:

1. **Revert to last known good frontend commit:**
   ```bash
   git revert HEAD  # or git checkout <previous-commit>
   npm run build
   npm run deploy  # deploy to staging/production
   ```

2. **Users will see:**
   - Old version of app with previous RBAC code
   - May temporarily have broader access (intentional rollback)

3. **Timeline:** 5-10 minutes

### Option B: Disable RBAC Checks (Emergency Only)

**⚠️ SECURITY RISK — USE ONLY IN TRUE EMERGENCY**

If users are completely blocked from app:

1. **Frontend:** Modify `canAccessPath()` to return `true` for all routes
   ```typescript
   function canAccessPath() {
     return true  // TEMPORARY — grants all access
   }
   ```

2. **Deploy emergency build**

3. **Notify team immediately**

4. **Fix root cause in parallel**

5. **Re-enable RBAC as soon as possible**

### Option C: Backend RLS Disable (Last Resort)

**⚠️ EXTREME SECURITY RISK — DO NOT USE**

If backend RLS is blocking all queries:

```sql
-- TEMPORARY (max 30 minutes)
ALTER TABLE public.open_job_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
-- ... other tables
```

Then:
1. Notify security team
2. Fix RLS policies
3. Re-enable immediately:
   ```sql
   ALTER TABLE public.open_job_cards ENABLE ROW LEVEL SECURITY;
   ```

---

## Escalation Contacts

### Level 1: Operations (5 min response)

- **Issue:** User cannot access module despite permission
- **Contact:** Operations team lead
- **Action:** Run troubleshooting steps above, collect logs

### Level 2: Engineering (15 min response)

- **Issue:** Frontend RBAC logic bug, permission not saving
- **Contact:** Engineering on-call
- **Action:** Reproduce in staging, create bug ticket

### Level 3: Security (Immediate)

- **Issue:** Unauthorized data access, token bypass, RLS failure
- **Contact:** Security team + Engineering lead
- **Action:** Isolate affected user, initiate rollback, post-incident review

---

## Post-Incident Review Template

**Incident ID:** ___________  
**Date/Time:** ___________  
**Duration:** ___________  
**Severity:** ☐ Critical ☐ High ☐ Medium ☐ Low

**What Happened:**
(Describe the issue)

**Root Cause:**
(Why did it happen?)

**Impact:**
(How many users affected? What data exposed?)

**Resolution:**
(How was it fixed?)

**Prevention:**
(What changes prevent recurrence?)

---

## Maintenance & Updates

### Monthly Audit Checklist

- [ ] Review new user list, verify all have appropriate permissions
- [ ] Check for inactive users (no login >30 days), consider deactivation
- [ ] Verify module permission counts are reasonable per role
- [ ] Test RBAC manually (try as different role)
- [ ] Check logs for any permission errors
- [ ] Update this runbook if procedures changed

### Before Each Deployment

- [ ] Run QA tests from [RBAC_ROLE_MATRIX_TESTING.md](../RBAC_ROLE_MATRIX_TESTING.md)
- [ ] Run security tests from [RBAC_SECURITY_TESTING.md](../RBAC_SECURITY_TESTING.md)
- [ ] Create backup of current permissions (SQL export)
- [ ] Document any RBAC-related changes in commit message
- [ ] Communicate rollout to ops/admin team

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [RBAC-001_DAILY_STANDUP_CHECKLIST.md](../Implementation_plans/RBAC-001_DAILY_STANDUP_CHECKLIST.md) | Daily tracking |
| [MODULE_ROUTE_CONTRACT.md](./MODULE_ROUTE_CONTRACT.md) | Module/route mapping |
| [ONBOARDING_POLICY.md](./ONBOARDING_POLICY.md) | New user behavior |
| [RBAC_ROLE_MATRIX_TESTING.md](../RBAC_ROLE_MATRIX_TESTING.md) | QA test procedures |
| [RBAC_SECURITY_TESTING.md](../RBAC_SECURITY_TESTING.md) | Security test procedures |

---

**Last Updated:** 2026-05-23 by GitHub Copilot  
**Review Frequency:** Monthly or after incident  
**Next Audit:** 2026-06-23  
**Version:** 1.0
