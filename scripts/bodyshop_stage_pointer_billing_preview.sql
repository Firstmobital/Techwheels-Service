-- BODYSHOP-STAGE-002 Phase 2 PREVIEW (read-only, SELECT only). Changes nothing.
-- Shows what migration 20261116170000 step 4 would do to active cards with pointer >= 15.
-- Rule (same as the new reconcile): pointer 17 is kept; DO received OR any payment posted -> 18;
-- billed -> 16; otherwise unchanged. Pointer only moves up.
-- Run QUERY 1, then QUERY 2 (the SQL editor shows only the last result).

-- ===== QUERY 1: summary by current pointer -> new pointer =====
WITH t AS (
  SELECT b.id, b.current_stage,
    (lower(btrim(COALESCE(b.parts_entry_status,''))) = 'billed' AND b.billed_amount IS NOT NULL) AS billed,
    (lower(btrim(COALESCE(b.do_status,''))) = 'received' AND b.do_amount IS NOT NULL)            AS do_received,
    (lower(btrim(COALESCE(b.do_payment_status,''))) IN ('partial','received')
      OR lower(btrim(COALESCE(b.customer_payment_status,''))) IN ('partial','received'))         AS any_payment
  FROM public.bodyshop_repair_cards b
  WHERE b.overall_status = 'active' AND b.current_stage >= 15
),
r AS (
  SELECT *,
    CASE
      WHEN current_stage = 17 THEN 17
      WHEN do_received OR any_payment THEN GREATEST(current_stage, 18)
      WHEN billed THEN GREATEST(current_stage, 16)
      ELSE current_stage
    END AS new_stage
  FROM t
)
SELECT current_stage, new_stage, count(*) AS cards,
       count(*) FILTER (WHERE new_stage <> current_stage) AS would_change
FROM r
GROUP BY current_stage, new_stage
ORDER BY current_stage, new_stage;

-- ===== QUERY 2: the cards that would change =====
WITH t AS (
  SELECT b.id, b.job_card_no, b.current_stage, b.created_at::date AS created,
    b.parts_entry_status, b.billed_amount, b.do_status, b.do_amount, b.do_payment_status, b.customer_payment_status,
    (lower(btrim(COALESCE(b.parts_entry_status,''))) = 'billed' AND b.billed_amount IS NOT NULL) AS billed,
    (lower(btrim(COALESCE(b.do_status,''))) = 'received' AND b.do_amount IS NOT NULL)            AS do_received,
    (lower(btrim(COALESCE(b.do_payment_status,''))) IN ('partial','received')
      OR lower(btrim(COALESCE(b.customer_payment_status,''))) IN ('partial','received'))         AS any_payment
  FROM public.bodyshop_repair_cards b
  WHERE b.overall_status = 'active' AND b.current_stage >= 15
)
SELECT id, job_card_no, created, current_stage,
       CASE WHEN current_stage = 17 THEN 17
            WHEN do_received OR any_payment THEN GREATEST(current_stage, 18)
            WHEN billed THEN GREATEST(current_stage, 16)
            ELSE current_stage END AS new_stage,
       parts_entry_status, billed_amount, do_status, do_amount, do_payment_status, customer_payment_status
FROM t
WHERE current_stage <> CASE WHEN current_stage = 17 THEN 17
                            WHEN do_received OR any_payment THEN GREATEST(current_stage, 18)
                            WHEN billed THEN GREATEST(current_stage, 16)
                            ELSE current_stage END
ORDER BY created, id;
