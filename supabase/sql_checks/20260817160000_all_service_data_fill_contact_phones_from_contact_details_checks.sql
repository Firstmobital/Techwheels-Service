-- Read-only verification checks for:
-- supabase/migrations/20260817160000_all_service_data_fill_contact_phones_from_contact_details.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Supporting index exists with Customer + phone predicate.
SELECT
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_def
FROM pg_class i
JOIN pg_namespace n ON n.oid = i.relnamespace
WHERE n.nspname = 'public'
  AND i.relname = 'idx_contact_details_customer_chassis_norm';

-- 2) Functions exist with expected signatures.
SELECT p.oid::regprocedure::text AS function_signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'lookup_customer_phone_from_contact_details',
    'refresh_all_service_data_from_contact_details',
    'trg_fill_all_service_data_contact_phones_from_contact_details',
    'trg_refresh_all_service_data_from_contact_details',
    'reconcile_all_service_data_from_contact_details_chunked'
  )
ORDER BY 1;

-- 3) Triggers are attached to the expected tables/events.
SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_fill_all_service_data_contact_phones_from_contact_details',
    'trg_refresh_all_service_data_from_contact_details'
  )
ORDER BY c.relname, t.tgname;

-- 4) Smoke: no-match refresh must not error.
SELECT public.refresh_all_service_data_from_contact_details('__NO_MATCH_CHASSIS__');

-- 5) Remaining fillable rows after backfill (eligible Customer phone, blank target).
-- Expected: 0 after a complete apply. Non-zero means catch-up reconcile is still needed.
SELECT count(*) AS remaining_fillable_rows
FROM public.all_service_data t
WHERE NULLIF(btrim(t.contact_phones), '') IS NULL
  AND public.lookup_customer_phone_from_contact_details(t.chassis_no) IS NOT NULL;

-- 6) No-overwrite invariant: non-blank target phones must not equal a different
-- latest Customer source phone in a way that proves overwrite. This counts rows
-- where target already had a phone; it is informational, not a fail if source
-- and target differ (overwrite is forbidden, so differences are allowed).
SELECT
  count(*) FILTER (
    WHERE NULLIF(btrim(t.contact_phones), '') IS NOT NULL
  ) AS target_rows_with_phone,
  count(*) FILTER (
    WHERE NULLIF(btrim(t.contact_phones), '') IS NULL
  ) AS target_rows_without_phone
FROM public.all_service_data t;

-- 7) Source eligibility snapshot.
SELECT
  count(*) AS customer_rows_with_phone,
  count(DISTINCT upper(btrim(chassis_no))) AS customer_chassis_with_phone
FROM public.contact_details
WHERE lower(btrim(COALESCE(contact_status, ''))) = 'customer'
  AND NULLIF(btrim(cell_phone_no), '') IS NOT NULL
  AND NULLIF(upper(btrim(chassis_no)), '') IS NOT NULL;
