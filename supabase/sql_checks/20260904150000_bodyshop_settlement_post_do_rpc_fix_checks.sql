-- Read-only verification checks for:
-- supabase/migrations/20260904150000_bodyshop_settlement_post_do_rpc_fix.sql
-- Execution: This file can be run in one go.

-- 1) Write RPC has row_security = off
SELECT p.proname, unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'add_bodyshop_settlement_line',
    'upsert_bodyshop_settlement_header',
    'recalc_bodyshop_settlement'
  )
ORDER BY p.proname, cfg;

-- 2) INSERT policies exist on settlement tables
SELECT c.relname, pol.polname, pol.polcmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bodyshop_settlements', 'bodyshop_settlement_lines')
  AND pol.polname LIKE '%insert_internal'
ORDER BY c.relname, pol.polname;

-- 3) Authenticated still has no INSERT privilege
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_settlements', 'bodyshop_settlement_lines')
  AND grantee = 'authenticated'
ORDER BY table_name, privilege_type;

-- 4) Golden case still has no invented lines until the user posts
SELECT
  s.job_card_no,
  s.do_amount,
  s.do_released_amount,
  s.do_payment_status,
  (SELECT count(*) FROM public.bodyshop_settlement_lines l WHERE l.settlement_id = s.id) AS line_count
FROM public.bodyshop_settlements s
WHERE upper(btrim(s.job_card_no)) = 'JC-MBTPLT-JP1-2627-005071';
