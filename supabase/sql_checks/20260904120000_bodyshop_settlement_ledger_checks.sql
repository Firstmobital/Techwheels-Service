-- Read-only verification checks for:
-- supabase/migrations/20260904120000_bodyshop_settlement_ledger.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Card cache columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bodyshop_repair_cards'
  AND column_name IN ('do_payment_status', 'customer_payment_status', 'customer_settlement_kind', 'payment_status')
ORDER BY column_name;

-- 2) payment_status CHECK includes partial
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bodyshop_repair_cards'::regclass
  AND conname IN (
    'bodyshop_repair_cards_payment_status_check',
    'bodyshop_repair_cards_do_payment_status_check',
    'bodyshop_repair_cards_customer_payment_status_check',
    'bodyshop_repair_cards_customer_settlement_kind_check'
  )
ORDER BY conname;

-- 3) New tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_settlements', 'bodyshop_settlement_lines')
ORDER BY table_name;

-- 4) RPCs exist
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'upsert_bodyshop_settlement_header',
    'add_bodyshop_settlement_line',
    'reverse_bodyshop_settlement_line',
    'mark_bodyshop_settlement_not_received',
    'get_bodyshop_settlement',
    'recalc_bodyshop_settlement'
  )
ORDER BY p.proname;

-- 5) Golden case 005071 header after backfill (no invented lines)
SELECT
  s.job_card_no,
  s.invoice_number,
  s.invoice_amount,
  s.do_amount,
  s.customer_diff_amount,
  s.customer_settlement_kind,
  s.do_payment_status,
  s.customer_payment_status,
  s.derived_payment_status,
  s.needs_accounts_review,
  (SELECT count(*) FROM public.bodyshop_settlement_lines l WHERE l.settlement_id = s.id) AS line_count
FROM public.bodyshop_settlements s
WHERE upper(btrim(s.job_card_no)) = 'JC-MBTPLT-JP1-2627-005071';

-- 6) Card cache for 005071 must not stay received without lines
SELECT id, payment_status, do_payment_status, customer_payment_status, customer_settlement_kind,
       billed_amount, do_amount, customer_diff_amount
FROM public.bodyshop_repair_cards
WHERE id = 630;

-- 7) RLS enabled
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bodyshop_settlements', 'bodyshop_settlement_lines')
ORDER BY c.relname;
