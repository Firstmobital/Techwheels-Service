# Secure Admin Operations Pattern

## Overview
All admin operations must be performed through Supabase Edge Functions, never directly from frontend with service key.

## Why This Pattern

**Before (Vulnerable):**
- Service key exposed in frontend code (AdminPage.tsx)
- Attacker could extract key from DevTools or bundled JS
- Attacker could call Supabase Auth API directly
- Could create/delete any user, bypass RLS, export all data

**After (Secure):**
- Service key stays in Edge Functions (server-side only)
- Frontend calls signed Edge Function endpoints
- JWT validated on each request
- Admin role verified server-side
- All operations logged in audit_logs table

## Implementation Pattern

### 1. Define Operation in Edge Function
- **Location:** `supabase/functions/[operation-name]/index.ts`
- **Validate JWT:** Use `validateRequest(req)` from shared auth
- **Check admin role:** Included in `validateRequest()`
- **Use service key:** Only inside Edge Function (server-side)
- **Audit log:** Call `logAuditEvent()` before returning

Example structure:
```typescript
import { validateRequest } from '../_shared/auth.ts'
import { logAuditEvent } from '../_shared/audit.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse()
  
  try {
    // 1. Validate JWT + admin role
    const caller = await validateRequest(req)
    
    // 2. Get service role client (NEVER in frontend)
    const admin = createClient(supabaseUrl, serviceRoleKey)
    
    // 3. Perform operation
    const { error } = await admin.auth.admin.updateUserById(...)
    
    // 4. Log audit event
    await logAuditEvent({ actor_id: caller.userId, action: '...', ... })
    
    // 5. Return success
    return successResponse()
  } catch (err) {
    return errorResponse(err)
  }
})
```

### 2. Call from Frontend
Never expose service key. Always use Supabase client:

```typescript
// ✅ CORRECT: Call Edge Function
const { error } = await supabase.functions.invoke('[operation-name]', {
  body: { /* parameters */ },
})

// ❌ WRONG: Direct API call with service key
const res = await fetch(`${supabaseUrl}/auth/v1/admin/...`, {
  headers: { Authorization: `Bearer ${serviceKey}` }  // NEVER DO THIS
})
```

### 3. Handle Errors
- Edge function returns 401 if not admin → Frontend shows permission denied
- Edge function returns 400 if invalid params → Frontend validates input
- Edge function returns 500 if operation fails → Frontend handles gracefully
- **Non-fatal:** Admin can re-login if JWT needs refresh

```typescript
const { error } = await supabase.functions.invoke('operation', { body: {} })
if (error) {
  if (error.message.includes('admin')) {
    showError('Only admins can perform this operation')
  } else {
    showWarning('Operation failed - you may need to re-login')
  }
}
```

## Existing Secure Operations

### 1. confirm-user-email
- **Purpose:** Confirm user email on activation
- **Location:** `supabase/functions/confirm-user-email/index.ts`
- **Input:** `{ userId: string }`
- **Auth Check:** Admin role required
- **Action:** Sets `email_confirm = true` in auth.users
- **Audit:** Logs "email_confirmed" event

**Frontend Usage:**
```typescript
const { error } = await supabase.functions.invoke('confirm-user-email', {
  body: { userId: 'abc123...' },
})
```

### 2. sync-dealer-metadata
- **Purpose:** Set dealer code/name in user JWT
- **Location:** `supabase/functions/sync-dealer-metadata/index.ts`
- **Input:** `{ userId: string, dealerCode: string, dealerName: string }`
- **Auth Check:** Admin role required
- **Action:** Merges fields into auth.users.user_metadata
- **Audit:** Logs "dealer_metadata_updated" event

**Frontend Usage:**
```typescript
const { error } = await supabase.functions.invoke('sync-dealer-metadata', {
  body: { userId: 'abc123...', dealerCode: 'TN123456', dealerName: 'Techwheels' },
})
```

## Security Checklist for New Admin Features

Before adding new admin operations, verify:

- [ ] **Edge Function Created** - Not direct frontend API call
- [ ] **JWT Validated** - Uses `validateRequest()` from shared auth
- [ ] **Admin Role Checked** - Included in `validateRequest()`
- [ ] **Service Key NOT in Frontend** - Only in Edge Function
- [ ] **Audit Logged** - Calls `logAuditEvent()` with action details
- [ ] **Error Messages Safe** - Don't leak sensitive info (e.g., user IDs)
- [ ] **Code Reviewed** - Check for privilege escalation risks
- [ ] **Tested with Non-Admin** - Verify 401 rejection for non-admins
- [ ] **Tested with Invalid JWT** - Verify 401 rejection for expired tokens
- [ ] **Documentation Updated** - Describe operation in this file

## Future Operations (Use Same Pattern)

1. **Create user with specific role**
   - Input: email, password, fullName, role, dealerCode
   - Operation: supabase.auth.admin.createUser()
   - Audit: "user_created"

2. **Change user role**
   - Input: userId, newRole
   - Operation: Update public.users.role
   - Audit: "user_role_changed"

3. **Reset user password**
   - Input: userId, newPassword
   - Operation: supabase.auth.admin.updateUserById(password)
   - Audit: "user_password_reset"

4. **Assign module permissions**
   - Input: userId, permissions[]
   - Operation: Insert into user_permissions table
   - Audit: "permissions_updated"

**All follow the same pattern:**
1. Edge Function
2. JWT validation + admin role check
3. Service key used server-side only
4. Audit logged
5. Frontend calls via supabase.functions.invoke()

## Monitoring & Compliance

**Query audit logs:**
```sql
-- All operations by an admin
SELECT * FROM public.audit_logs 
WHERE actor_id = 'abc123...' 
ORDER BY timestamp DESC;

-- All user creations
SELECT * FROM public.audit_logs 
WHERE action = 'user_created' 
ORDER BY timestamp DESC;

-- Recent email confirmations
SELECT * FROM public.audit_logs 
WHERE action = 'email_confirmed' 
  AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

**Set up alerts (future):**
- Multiple failed auth attempts → block IP
- Bulk user deletions → notify security team
- Dealer metadata changes → audit approval required

## Related Documentation

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Auth Admin API](https://supabase.com/docs/reference/javascript/admin-api)
- [JWT Validation in Edge Functions](https://supabase.com/docs/guides/auth/auth-jwt)
- [Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Last Updated:** 2026-05-22  
**Status:** ✅ Pattern Established  
**Criticality:** 🔴 HIGH - All admin features must follow this pattern
