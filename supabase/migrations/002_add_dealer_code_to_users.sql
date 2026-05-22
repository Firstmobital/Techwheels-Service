-- Migration: add dealer_code + dealer_name to public.users
-- File: supabase/migrations/002_add_dealer_code_to_users.sql
--
-- Why here rather than auth.users only:
--   auth.users.raw_user_meta_data carries dealer_code in the JWT so RLS works.
--   But the AdminPage reads from public.users, so we mirror the fields here for
--   easy SELECT/display without needing the service-role key.
--
-- Sync strategy:
--   createUser  → write to both user_metadata (via signUp options.data) AND public.users
--   updateDealer → write to public.users directly; call Admin API to sync JWT if
--                  VITE_SUPABASE_SERVICE_KEY is available (falls back gracefully)

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS dealer_code TEXT,
    ADD COLUMN IF NOT EXISTS dealer_name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_dealer_code ON public.users(dealer_code);

COMMENT ON COLUMN public.users.dealer_code IS
    'TML dealer code, e.g. TN123456.  Must match vehicles.dealer_code for RLS to allow access.';
COMMENT ON COLUMN public.users.dealer_name IS
    'Display name of the dealership shown in the topbar.';
