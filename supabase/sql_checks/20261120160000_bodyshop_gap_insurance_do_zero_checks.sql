-- Post-deploy: insurance_do_zero row keys and type alignment.
-- Run as authenticated staff with bodyshop_tracker view (not management API).

SELECT gap_type, count(*) AS n
FROM public.list_bodyshop_dms_missing_on_tracker(
  NULL::date,
  NULL::date,
  NULL::text,
  true
)
WHERE gap_type = 'insurance_do_zero'
GROUP BY 1;

SELECT row_key, gap_type, job_card_number, invoice_number, total_invoice_amount, tracker_note
FROM public.list_bodyshop_dms_missing_on_tracker(
  '2026-11-01'::date,
  '2026-11-30'::date,
  NULL::text,
  true
)
WHERE gap_type = 'insurance_do_zero'
ORDER BY event_date DESC
LIMIT 15;