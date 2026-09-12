-- Transactional demonstration of SA -> Accounts amount handoff.
-- All DML is rolled back. Schema from DBL-0051 remains.

BEGIN;

CREATE TEMP TABLE sa_accounts_handoff_demo (
  test text,
  id bigint,
  expected_invoice_amount numeric,
  billed_amount numeric,
  invoice_number text,
  invoice_date date,
  passed boolean
) ON COMMIT DROP;

-- TEST 1: persist SA amount 13166.08 on an unlocked mechanical row
UPDATE public.service_reception_entries
   SET expected_invoice_amount = 13166.08
 WHERE id = 8621;
SELECT public.service_advisor_seed_mechanical_billed_amount(8621, 13166.08);

INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 1 persist 13166.08',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (e.expected_invoice_amount = 13166.08 AND inv.billed_amount = 13166.08)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8621;

-- TEST 2 + 3 + 4: unsaved Mark Done amount 2500 seeds billed_amount and does not write invoice_date
UPDATE public.service_reception_entries
   SET expected_invoice_amount = 2500
 WHERE id = 8616;
SELECT public.service_advisor_seed_mechanical_billed_amount(8616, 2500);

INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 2/3/4 seed 2500, no invoice_date write',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (e.expected_invoice_amount = 2500 AND inv.billed_amount = 2500 AND inv.invoice_date IS NULL AND inv.invoice_number IS NULL)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8616;

-- TEST 6 write-lock: later SA amount must not replace saved Accounts billed/date
UPDATE public.accounts_mechanical_invoices
   SET invoice_number = 'INV-SAVED',
       invoice_date = DATE '2026-08-20',
       billed_amount = 9999.00
 WHERE reception_entry_id = 8621;
SELECT public.service_advisor_seed_mechanical_billed_amount(8621, 111.11);

INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 6 saved Accounts amount/date win',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (inv.billed_amount = 9999.00 AND inv.invoice_date = DATE '2026-08-20' AND inv.invoice_number = 'INV-SAVED')
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8621;

-- TEST 7: Bodyshop seed is a no-op
SELECT public.service_advisor_seed_mechanical_billed_amount(8612, 5000);
INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 7 Bodyshop seed no-op',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (inv.reception_entry_id IS NULL)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8612;

-- TEST 8: Rusting seed is a no-op
SELECT public.service_advisor_seed_mechanical_billed_amount(7359, 5000);
INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 8 Rusting seed no-op',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (inv.reception_entry_id IS NULL)
FROM public.service_reception_entries e
LEFT JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 7359;

-- TEST 6 live saved invoice (read-only): 8568 already has 13166.08 / 2026-09-11
INSERT INTO sa_accounts_handoff_demo
SELECT
  'TEST 6 live saved invoice unchanged',
  e.id,
  e.expected_invoice_amount,
  inv.billed_amount,
  inv.invoice_number,
  inv.invoice_date,
  (inv.billed_amount = 13166.08 AND inv.invoice_date = DATE '2026-09-11' AND inv.invoice_number = 'IMBTAI2627007400')
FROM public.service_reception_entries e
JOIN public.accounts_mechanical_invoices inv ON inv.reception_entry_id = e.id
WHERE e.id = 8568;

SELECT test, id, expected_invoice_amount, billed_amount, invoice_number, invoice_date, passed
FROM sa_accounts_handoff_demo
ORDER BY test;

ROLLBACK;
