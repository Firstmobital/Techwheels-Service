# Service Key Rotation - Manual Steps

**Date:** 2026-05-22  
**Status:** Ready for Manual Completion  
**Prerequisites:** ✅ All completed (Audit logs, Frontend, Edge Functions tested and working)

---

## Current Status

✅ **All Edge Functions Are Working in Production**
- sync-dealer-metadata: Tested successfully - dealer codes assigned to users
- confirm-user-email: Tested successfully - user activation/deactivation working
- Both functions use SERVICE_ROLE_KEY automatically (environment variable)

✅ **Production Testing Complete (Step 4)**
- Admin panel deployed to Vercel
- Dealer assignment tested and confirmed working
- User activation/deactivation tested and confirmed working

---

## Step 5: Rotate Service Key (Manual Instructions)

### Why Rotate?
The old service key may have been exposed in the browser frontend (.env.local). Once rotated, the old key will be completely invalid and cannot be used for any operations.

### Warning ⚠️
- Key rotation is **PERMANENT** and **IRREVERSIBLE**
- Old key will stop working **immediately**
- New key is automatically available in Edge Functions (no code changes needed)
- All admin operations automatically use the new key

### Instructions

#### 1. Log in to Supabase Dashboard
Go to: https://supabase.com/dashboard/project/jmdndcphkmaljhwgzqxq

#### 2. Navigate to Project Settings
In the left sidebar, click on the **Settings** icon (gear icon)

#### 3. Go to API Settings
Click on **API** in the settings menu

#### 4. Find Service Role Key
Look for the section titled "Service Role Key (secret)"

#### 5. Rotate the Key
Click the **"Rotate Key"** button next to the Service Role Key

#### 6. Confirm the Rotation
- A confirmation dialog will appear
- Read the warning about the key becoming invalid immediately
- Click **"Rotate"** to confirm

#### 7. Copy the New Key (Optional)
The new key will be displayed in the dashboard. You can copy it, but it's not needed for your app since:
- Edge Functions automatically receive the new key from Supabase environment variables
- Frontend has zero key exposure (refactored to use Edge Functions only)

---

## Verification After Rotation

### Test That Operations Still Work

1. **Open the admin panel:** https://techwheels-service.vercel.app/admin

2. **Try to set a dealer code:**
   - Click "Set Dealer" on any user
   - Enter a dealer code (e.g., 3000840)
   - Click "Save Dealer"
   - Should succeed with ✅ message

3. **Try to activate/deactivate a user:**
   - Click "Deactivate" on any user
   - Status should change to "Inactive"
   - Click "Activate"
   - Status should change back to "Active"

4. **Check Edge Function logs** (in Supabase Dashboard):
   - Go to Functions → click on function name
   - Should see successful execution logs
   - No permission errors or key issues

### Expected Results
- ✅ All operations succeed
- ✅ No error messages in browser console
- ✅ Edge Function logs show successful execution
- ✅ Confirms new key is working correctly

---

## Monitoring (Step 6)

### For 24 Hours After Rotation

#### Monitor Edge Function Logs
```bash
supabase functions logs --project-ref jmdndcphkmaljhwgzqxq --tail
```

#### Check Audit Logs
```bash
# In Supabase SQL Editor, run:
SELECT action, actor_id, resource_id, details, timestamp 
FROM public.audit_logs 
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC
LIMIT 20;
```

#### Watch For
- ✅ All operations succeed (dealers being assigned, users being activated)
- ❌ No authentication errors
- ❌ No "unauthorized" errors
- ❌ No "key not found" errors

### Success Criteria
- ✅ All 6 deployment steps completed
- ✅ Edge Functions operating normally
- ✅ Zero service key exposure in production
- ✅ Audit trail recording all operations
- ✅ 24-hour monitoring window with no errors

---

## If Rotation Fails

If you encounter any issues during or after rotation:

1. **Check Edge Function Status**
   ```bash
   supabase functions list --project-ref jmdndcphkmaljhwgzqxq
   ```
   Both functions should show status: ACTIVE

2. **Check Supabase Status**
   - Visit: https://status.supabase.com
   - Ensure no ongoing incidents

3. **Redeploy Functions** (if needed)
   ```bash
   cd /Users/vkbin/Techwheels-Service
   supabase functions deploy --project-ref jmdndcphkmaljhwgzqxq
   ```

4. **Contact Supabase Support**
   - Go to Supabase Dashboard → Help menu
   - Include error message and function logs

---

## Rollback Plan (If Needed Before Rotation)

If you need to undo all changes and restore service key usage:

1. Revert commits:
   ```bash
   git revert HEAD~2..HEAD
   git push
   ```

2. Redeploy old frontend:
   ```bash
   vercel deploy --prod
   ```

3. The service key in .env.local will be restored

**Note:** This is a rollback. The security vulnerability returns once you do this. Only use if rotation completely breaks the system.

---

## Completion Checklist

- [ ] Navigated to Supabase Dashboard
- [ ] Went to Settings → API → Service Role Key
- [ ] Clicked "Rotate Key"
- [ ] Confirmed rotation in dialog
- [ ] Verified dealer assignment works in admin panel
- [ ] Verified user activation works in admin panel
- [ ] Checked Edge Function logs (no errors)
- [ ] Monitored audit logs for 24 hours
- [ ] Zero errors in monitoring period
- [ ] ✅ **Security Refactor Complete** - Service key fully rotated and old key invalidated

