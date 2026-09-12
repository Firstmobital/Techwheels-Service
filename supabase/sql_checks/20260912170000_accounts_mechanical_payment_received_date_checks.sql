-- Read-only verification checks for:
-- supabase/migrations/20260912170000_accounts_mechanical_payment_received_date.sql
-- Execution: This file can be run in one go.

-- 1) Column type + NOT NULL
SELECT
  c.data_type AS payment_received_date_type,
  c.is_nullable AS payment_received_date_nullable,
  (
    SELECT c2.data_type
    FROM information_schema.columns c2
    WHERE c2.table_schema = 'public'
      AND c2.table_name = 'accounts_mechanical_payment_lines'
      AND c2.column_name = 'posted_at'
  ) AS posted_at_type
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name = 'accounts_mechanical_payment_lines'
  AND c.column_name = 'payment_received_date';

-- 2) No leftover 4-arg overload; new signature is SECURITY DEFINER + auth EXECUTE
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment'
ORDER BY args;

-- 3) RPC still posts lines, recalcs, keeps posted_at = now(), writes received date
SELECT
  pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.accounts_mechanical_payment_lines%'
  AND pg_get_functiondef(p.oid) LIKE '%payment_received_date%'
  AND pg_get_functiondef(p.oid) LIKE '%p_payment_received_date%'
  AND pg_get_functiondef(p.oid) LIKE '%payment received date is required%'
  AND pg_get_functiondef(p.oid) LIKE '%now()%'
  AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_recalc%'
  AND pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%'
  AND pg_get_functiondef(p.oid) LIKE '%(v_amount - v_remaining) <= 1%'
    AS add_payment_writes_received_date_keeps_audit
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 4) List still returns the whole line row (new column included via to_jsonb)
SELECT
  pg_get_functiondef(p.oid) LIKE '%to_jsonb(l)%'
  AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
    AS list_returns_line_json
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_payments';

-- 5) Existing rows usable: every line has a received date
SELECT
  count(*) AS payment_lines,
  count(*) FILTER (WHERE payment_received_date IS NULL) AS null_received_dates,
  count(*) FILTER (
    WHERE payment_received_date = (posted_at AT TIME ZONE 'Asia/Kolkata')::date
  ) AS rows_matching_posted_at_ist_date
FROM public.accounts_mechanical_payment_lines;

-- 6) Backfill formula: 2026-09-12 15:32 IST -> 2026-09-12
SELECT
  (TIMESTAMPTZ '2026-09-12 15:32:00+05:30' AT TIME ZONE 'Asia/Kolkata')::date
    = DATE '2026-09-12' AS backfill_example_ist,
  (TIMESTAMPTZ '2026-09-11 23:30:00+05:30' AT TIME ZONE 'Asia/Kolkata')::date
    = DATE '2026-09-11' AS backfill_before_midnight_ist,
  (TIMESTAMPTZ '2026-09-12 00:30:00+00:00' AT TIME ZONE 'Asia/Kolkata')::date
    = DATE '2026-09-12' AS utc_does_not_shift_ist_morning;
