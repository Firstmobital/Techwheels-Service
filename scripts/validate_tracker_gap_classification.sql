-- READ-ONLY: sanity checks for list_bodyshop_dms_missing_on_tracker logic.
-- Run after changing gap SQL or before trusting Gaps & health counts.
-- Default month = Nov 2026; adjust p_from / p_to as needed.

-- 1) jc_missing must never emit when this JC exists on a live card (regression like RJ14TH4562).
WITH gaps AS (
  SELECT *
  FROM public.list_bodyshop_dms_missing_on_tracker('2026-11-01'::date, '2026-11-30'::date, NULL, true)
)
SELECT 'jc_missing_but_jc_on_card' AS check_id, g.*
FROM gaps g
WHERE g.gap_type IN ('jc_missing', 'jc_missing_same_reg', 'jc_missing_extra_visit')
  AND EXISTS (
    SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = upper(btrim(g.job_card_number))
  );

-- 2) invoice gaps must only emit when JC matches a live card.
WITH gaps AS (
  SELECT *
  FROM public.list_bodyshop_dms_missing_on_tracker('2026-11-01'::date, '2026-11-30'::date, NULL, true)
)
SELECT 'invoice_gap_without_jc_on_card' AS check_id, g.*
FROM gaps g
WHERE g.gap_type IN ('invoice_missing', 'invoice_mismatch', 'invoice_pending')
  AND NOT EXISTS (
    SELECT 1 FROM public.bodyshop_repair_cards c
    WHERE c.overall_status <> 'cancelled'
      AND upper(btrim(c.job_card_no)) = upper(btrim(g.job_card_number))
  );

-- 3) row_key prefix should align with gap_type (catches API/UI skew).
WITH gaps AS (
  SELECT *
  FROM public.list_bodyshop_dms_missing_on_tracker('2026-11-01'::date, '2026-11-30'::date, NULL, true)
)
SELECT 'row_key_gap_type_mismatch' AS check_id, row_key, gap_type
FROM gaps
WHERE (row_key LIKE 'inv-mismatch:%' AND gap_type <> 'invoice_mismatch')
   OR (row_key LIKE 'inv-missing:%' AND gap_type <> 'invoice_missing')
   OR (row_key LIKE 'rec:%' AND gap_type <> 'reception_no_card')
   OR (row_key LIKE 'ph:%' AND gap_type <> 'placeholder_jc');

-- 4) duplicate DMS keys in one result set (should be 0 rows per jc+inv).
WITH gaps AS (
  SELECT *
  FROM public.list_bodyshop_dms_missing_on_tracker('2026-11-01'::date, '2026-11-30'::date, NULL, true)
)
SELECT 'duplicate_jc_inv' AS check_id, job_card_number, invoice_number, count(*) AS n, array_agg(gap_type) AS types
FROM gaps
WHERE job_card_number IS NOT NULL AND invoice_number IS NOT NULL
GROUP BY job_card_number, invoice_number
HAVING count(*) > 1;