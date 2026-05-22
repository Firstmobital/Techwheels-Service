# SEC-001 Deployment Checklist

**Commit Hash:** 7376427  
**Date:** 2026-05-22  
**Status:** Ready for Production Deployment  

---

## ✅ Pre-Deployment Verification (COMPLETED)

- ✅ Phase 1: Service key audit complete
- ✅ Phase 2: Edge Functions created and validated
- ✅ Phase 3: Frontend refactored (no service key in code/build)
- ✅ Phase 4: Audit logs table migration created
- ✅ All changes committed to git (7376427)

---

## 📋 Production Deployment Steps (READY TO EXECUTE)

### Step 1: Apply Audit Logs Table Migration

**In Supabase Dashboard:**
1. Go to your project → SQL Editor
2. Run the migration from: `supabase/migrations/003_create_audit_logs.sql`
3. Verify table created: `SELECT * FROM pg_tables WHERE tablename = 'audit_logs'`

**Or via Supabase CLI:**
```bash
supabase db push --remote production
```

---

### Step 2: Deploy Updated Frontend

**If using Vercel:**
```bash
vercel deploy --prod
```

**If using custom hosting:**
1. Run: `npm run build`
2. Upload `dist/` folder to your hosting
3. Clear any CDN caches

**Verification:**
```bash
# Verify no service key in deployed code
curl https://your-domain.com | grep VITE_SUPABASE_SERVICE_KEY
# Should return nothing (empty result = safe)
```

---

### Step 3: Deploy Edge Functions

**Via Supabase CLI:**
```bash
# First, get your project ID
supabase projects list

# Deploy to production
supabase deploy --project-ref YOUR_PROJECT_ID functions
```

**Verify deployment:**
```bash
# Test edge function endpoint (should fail with auth error = good)
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/confirm-user-email \
  -H "Content-Type: application/json" \
  -d '{"userId": "test"}'
# Expected: 401 or 400 error (no auth header)
```

---

### Step 4: Test in Production

**Before rotating service key, verify:**

1. **Login to admin panel** (your deployed frontend)
2. **Try to activate a test user**
   - Click "Activate" on any user
   - Should succeed (calls edge function)
   - Check browser console - no service key visible
3. **Try to set dealer code**
   - Edit dealer code on a user
   - Should succeed (calls edge function)
4. **Check audit logs**
   ```sql
   SELECT * FROM public.audit_logs 
   WHERE timestamp > NOW() - INTERVAL '5 minutes'
   ORDER BY timestamp DESC;
   ```
   - Should see entries for email_confirmed and dealer_metadata_updated

---

### Step 5: ⚠️ CRITICAL - Rotate Service Key

**IMPORTANT:**
- Only do this AFTER Steps 1-4 are complete
- Key rotation is PERMANENT - cannot be reversed
- Old key will be invalid immediately
- All subsequent admin operations use new key in Edge Functions

**Steps:**

1. **Go to Supabase Dashboard**
   - Project Settings → API
   - Under "Service Role Key" click "Rotate"
   - Confirm the rotation

2. **Update Edge Functions with new key**
   - The new key is automatically available in Edge Functions environment
   - No code changes needed - Supabase manages this

3. **Verify operations still work**
   - Try activating another user
   - Try setting dealer code
   - Both should still work (using new key)

4. **Monitor logs**
   ```sql
   SELECT * FROM audit_logs 
   WHERE timestamp > NOW() - INTERVAL '24 hours'
   ORDER BY timestamp DESC;
   ```

---

### Step 6: Monitor for 24 Hours

**Watch for:**
- ✅ Edge function error logs: `supabase functions logs --project-ref YOUR_PROJECT_ID --tail`
- ✅ Audit logs for unexpected operations
- ✅ User reports of broken functionality
- ✅ Browser console errors

**Success Indicators:**
- ✅ Admin panel fully functional
- ✅ User activation works
- ✅ Dealer code assignment works
- ✅ Zero console errors
- ✅ Audit logs populated with every admin action

---

## 🎯 What's Deployed

### Frontend Changes
- ✅ `src/pages/AdminPage.tsx` - Uses Edge Functions instead of direct API calls
- ✅ `.env.local` - Service key removed, default dealer vars added
- ✅ Build passes with zero service key exposure

### Backend Changes
- ✅ `supabase/functions/confirm-user-email/` - Email confirmation edge function
- ✅ `supabase/functions/sync-dealer-metadata/` - Dealer metadata sync edge function
- ✅ `supabase/functions/_shared/auth.ts` - JWT validation utility
- ✅ `supabase/functions/_shared/cors.ts` - CORS headers utility
- ✅ `supabase/functions/_shared/audit.ts` - Audit logging utility
- ✅ `supabase/migrations/003_create_audit_logs.sql` - Audit logs table

### Documentation
- ✅ `docs/ADMIN_OPERATIONS_SECURITY.md` - Secure pattern documentation

---

## 🔐 Security Achieved

| Before | After |
|--------|-------|
| ❌ Service key in frontend | ✅ Service key server-side only |
| ❌ Direct Auth API calls | ✅ Edge Function boundary |
| ❌ No authorization check | ✅ JWT + admin role validation |
| ❌ No audit trail | ✅ All operations logged |
| ❌ Key exposure risk | ✅ Zero key exposure |

---

## ⏮️ Rollback Plan (If Needed)

**If deployment fails:**

1. **Before Key Rotation:**
   - Redeploy previous frontend version
   - Disable/delete broken edge functions
   - Do NOT rotate service key yet
   - Investigate issue

2. **After Key Rotation:**
   - Cannot revert key rotation (permanent)
   - But system still works with new key
   - If edge functions broke: redeploy corrected version
   - Old exposed key is already invalid

---

## 📊 Success Criteria

- ✅ No `VITE_SUPABASE_SERVICE_KEY` in frontend code/build
- ✅ All admin operations go through Edge Functions
- ✅ Edge functions validate JWT and admin role
- ✅ Audit logs table exists and populated
- ✅ Service key rotated (irreversible)
- ✅ Admin panel fully functional in production
- ✅ Zero errors in production logs (first 24h)
- ✅ Users can activate, set dealer code, etc. normally

---

## 🚀 Next Steps (Post-Deployment)

1. **After 24-hour monitoring period:**
   - Update implementation plan status to COMPLETED
   - Archive SEC-001 in docs

2. **For future admin features:**
   - Always use Edge Function pattern (see ADMIN_OPERATIONS_SECURITY.md)
   - Never expose service key in frontend

3. **Optional enhancements:**
   - Set up alerts for bulk operations
   - Implement permission-based admin actions
   - Add 2FA for admin login
   - Export audit logs to external compliance system

---

**Status:** 🟢 READY FOR PRODUCTION  
**Git Commit:** 7376427  
**Time to Complete All Phases:** ~4 hours elapsed + 1 hour deployment = 5 hours total  
