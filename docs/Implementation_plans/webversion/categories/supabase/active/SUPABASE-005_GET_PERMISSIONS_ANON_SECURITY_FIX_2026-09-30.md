# SUPABASE-005 — Fix `get_permissions_for_user` Anon Security Gap

**Priority:** P0 — Critical  
**Effort:** ~30 minutes  
**Risk:** Zero — no app code changes required  
**Created:** 2026-09-30

---

## Problem

The database migration grants `ALL` on `public.get_permissions_for_user(target_user_id uuid)` to the `anon` role. This function is `SECURITY DEFINER`, so it runs with elevated privileges. Any unauthenticated HTTP call to the Supabase REST endpoint can pass any user UUID and receive their full module-permission matrix.

The function body contains the comment `-- Only admin users may call this` but has no enforcement code.

## Confirmed: No breaking changes

- **Web app** — only calls this function from `App.tsx:1373` for admin impersonation ("View As User"). The caller is always an authenticated admin, never `anon`.
- **Staff mobile** — uses `get_all_my_permissions` (different function). Never calls `get_permissions_for_user`.
- **Customer mobile** — no impersonation feature; never calls this function.

Revoking `anon` only blocks unauthenticated external API probing.

## Fix

Create a new migration:

```sql
-- 1. Add admin guard inside the function body
CREATE OR REPLACE FUNCTION public.get_permissions_for_user(target_user_id uuid)
RETURNS TABLE(...) -- keep existing return signature
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
  -- ... existing body unchanged ...
END;
$$;

-- 2. Revoke anon grant
REVOKE ALL ON FUNCTION public.get_permissions_for_user(uuid) FROM anon;
```

## Verification

After deploying:
1. Call the function via Supabase REST with no Authorization header → expect 403/error.
2. Call as a logged-in admin → expect normal permission data returned.
3. Admin "View As User" impersonation in the web app → must still work.
