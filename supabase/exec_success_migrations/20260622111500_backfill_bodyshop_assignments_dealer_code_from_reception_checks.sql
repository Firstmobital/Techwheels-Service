-- Read-only verification checks for:
-- supabase/migrations/20260622111500_backfill_bodyshop_assignments_dealer_code_from_reception.sql

-- 1) Count assignments still carrying branch/location labels instead of dealer code.
SELECT
  count(*) AS location_like_dealer_code_rows
FROM public.bodyshop_assignments
WHERE upper(btrim(coalesce(dealer_code, ''))) IN ('SITAPURA', 'AJMER ROAD');

-- 2) Check mismatch count between assignment dealer_code and linked reception dealer_code.
SELECT
  count(*) AS mismatch_rows
FROM public.bodyshop_assignments ba
JOIN public.service_reception_entries sre
  ON sre.id = ba.reception_entry_id
WHERE nullif(btrim(coalesce(sre.dealer_code, '')), '') IS NOT NULL
  AND upper(btrim(coalesce(ba.dealer_code, ''))) <> upper(btrim(coalesce(sre.dealer_code, '')));

-- 3) Focus check for known regression case.
SELECT
  ba.id,
  ba.job_card_number,
  ba.dealer_code AS assignment_dealer_code,
  ba.reception_entry_id,
  sre.dealer_code AS reception_dealer_code,
  sre.branch,
  sre.sa_employee_code
FROM public.bodyshop_assignments ba
LEFT JOIN public.service_reception_entries sre
  ON sre.id = ba.reception_entry_id
WHERE upper(btrim(coalesce(ba.job_card_number, ''))) = 'JC-AAAAA-DFDF-ERFDFG-0001';

-- 4) Quick sample for recent assignments after fix.
SELECT
  id,
  job_card_number,
  dealer_code,
  updated_at
FROM public.bodyshop_assignments
ORDER BY updated_at DESC
LIMIT 20;
