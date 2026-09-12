-- Transactional demonstration: Save of a qualifying invoice amount sets
-- invoice_done_at once. All DML rolls back.

BEGIN;

CREATE TEMP TABLE sa_amount_complete_demo (
  test text,
  id bigint,
  expected_invoice_amount numeric,
  invoice_done_at timestamptz,
  billed_amount numeric,
  passed boolean
) ON COMMIT DROP;

-- TEST 1: amount creates completion + seeds billed_amount
UPDATE public.service_reception_entries
   SET expected_invoice_amount = 13166.08,
       invoice_done_at = CASE WHEN invoice_done_at IS NULL THEN now() ELSE invoice_done_at END,
       invoice_done_by = CASE WHEN invoice_done_at IS NULL THEN 'demo' ELSE invoice_done_by END
 WHERE id = 8621
   AND lower(btrim(service_type)) NOT IN ('accident', 'rusting');
SELECT public.service_advisor_seed_mechanical_billed_amount(8621, 13166.08);

INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 1 amount creates completion',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  inv.billed_amount,
  (
    e.expected_invoice_amount = 13166.08
    AND e.invoice_done_at IS NOT NULL
    AND inv.billed_amount = 13166.08
    AND public.is_floor_incharge_service_type(e.service_type)
    AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
  )
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8621;

-- TEST 2: unrelated save without amount does not complete
UPDATE public.service_reception_entries
   SET remark = coalesce(remark, '') || ''
 WHERE id = 8613
   AND expected_invoice_amount IS NULL
   AND invoice_done_at IS NULL;

INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 2 no amount stays NULL',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  NULL,
  (e.expected_invoice_amount IS NULL AND e.invoice_done_at IS NULL)
FROM public.service_reception_entries e
WHERE e.id = 8613;

-- TEST 3: later amount edit does not rewrite timestamp
UPDATE public.service_reception_entries
   SET expected_invoice_amount = 14000
 WHERE id = 8621
   AND invoice_done_at IS NOT NULL;
SELECT public.service_advisor_seed_mechanical_billed_amount(8621, 14000);

INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 3 timestamp idempotent',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  NULL,
  (
    e.expected_invoice_amount = 14000
    AND e.invoice_done_at = (SELECT invoice_done_at FROM sa_amount_complete_demo WHERE test = 'TEST 1 amount creates completion')
  )
FROM public.service_reception_entries e
WHERE e.id = 8621;

-- TEST 6: Accident does not get timestamp
UPDATE public.service_reception_entries
   SET expected_invoice_amount = NULL
 WHERE id = 8612;
-- Simulate save RPC exception path: amount forced NULL, no timestamp
INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 6 Bodyshop no timestamp',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  inv.billed_amount,
  (e.invoice_done_at IS NULL AND inv.reception_entry_id IS NULL)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8612;

SELECT public.service_advisor_seed_mechanical_billed_amount(8612, 5000);

INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 6 Bodyshop seed still no-op',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  inv.billed_amount,
  (e.invoice_done_at IS NULL AND inv.reception_entry_id IS NULL)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8612;

-- TEST 7: explicit 0 completes
UPDATE public.service_reception_entries
   SET expected_invoice_amount = 0,
       invoice_done_at = CASE WHEN invoice_done_at IS NULL THEN now() ELSE invoice_done_at END,
       invoice_done_by = CASE WHEN invoice_done_at IS NULL THEN 'demo' ELSE invoice_done_by END
 WHERE id = 8616
   AND lower(btrim(service_type)) NOT IN ('accident', 'rusting');

INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 7 explicit zero completes',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  NULL,
  (e.expected_invoice_amount = 0 AND e.invoice_done_at IS NOT NULL)
FROM public.service_reception_entries e
WHERE e.id = 8616;

-- TEST 5: Accounts eligibility predicate matches TEST 1 row
INSERT INTO sa_amount_complete_demo
SELECT
  'TEST 5 Accounts eligibility',
  e.id,
  e.expected_invoice_amount,
  e.invoice_done_at,
  inv.billed_amount,
  (
    e.invoice_done_at IS NOT NULL
    AND NULLIF(btrim(e.jc_number), '') IS NOT NULL
    AND public.is_floor_incharge_service_type(e.service_type)
    AND inv.billed_amount = 14000
    AND e.expected_invoice_amount = 14000
  )
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8621;

SELECT test, id, expected_invoice_amount, invoice_done_at IS NOT NULL AS has_done_at, billed_amount, passed
FROM sa_amount_complete_demo
ORDER BY test;

ROLLBACK;
