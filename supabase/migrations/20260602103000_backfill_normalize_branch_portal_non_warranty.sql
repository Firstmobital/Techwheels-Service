-- Backfill normalization for historical non-warranty imports.
-- Authority reference: local_folder/backups/full_database.sql
--
-- Goal:
-- 1) Stop merged labels in branch for non-warranty tables (e.g., 'Ajmer Road PV').
-- 2) Keep fuel split in dedicated portal column where available.
-- 3) Use dealer_code mapping for parts order rows when available:
--    3000840 => Sitapura/PV
--    500A840 => Sitapura/EV
--    3001440 => Ajmer Road/PV
--
-- IMPORTANT:
-- - This migration intentionally does NOT touch warranty_* tables.
-- - It does not create new tables/functions/triggers/RLS.

BEGIN;

-- Shared expression mapping for branch normalization from merged labels.
-- Ajmer Road PV/EV -> Ajmer Road
-- Sitapura PV/EV -> Sitapura

-- 1) Revenue/service tables without portal column
-- 1a) Pre-dedupe service_invoice_data on the post-normalization unique key
--     to avoid violating uq_service_invoice_conflict while updating branch.
--     Keep the most recently updated row (then newest id) per key.
WITH ranked_service_invoice AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY
        NULLIF(TRIM(BOTH FROM COALESCE(order_number, '')), ''),
        CASE
          WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
          WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
          ELSE branch
        END,
        invoice_date
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.service_invoice_data
  WHERE NULLIF(TRIM(BOTH FROM COALESCE(order_number, '')), '') IS NOT NULL
    AND invoice_date IS NOT NULL
    AND NULLIF(
      TRIM(BOTH FROM COALESCE(
        CASE
          WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
          WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
          ELSE branch
        END,
      '')),
    '') IS NOT NULL
)
DELETE FROM public.service_invoice_data t
USING ranked_service_invoice r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

UPDATE public.service_vas_jc_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.job_card_closed_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.service_invoice_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.service_invoice_order_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

-- 2) Parts consumption: normalize branch + derive portal from merged branch suffix
UPDATE public.service_parts_consumption_data
SET
  branch = CASE
    WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
    WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
    ELSE branch
  END,
  portal = CASE
    WHEN branch LIKE '% EV' THEN 'EV'
    WHEN branch LIKE '% PV' THEN 'PV'
    ELSE portal
  END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

-- 3) Parts stock: normalize branch + derive portal from merged branch suffix
UPDATE public.service_parts_stock_snapshot_data
SET
  branch = CASE
    WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
    WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
    ELSE branch
  END,
  portal = CASE
    WHEN branch LIKE '% EV' THEN 'EV'
    WHEN branch LIKE '% PV' THEN 'PV'
    ELSE portal
  END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

-- 4) Parts order: prefer dealer_code mapping when available, else branch suffix
UPDATE public.service_parts_order_data
SET
  branch = CASE
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%3001440%' THEN 'Ajmer Road'
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%3000840%' THEN 'Sitapura'
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%500A840%' THEN 'Sitapura'
    WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
    WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
    ELSE branch
  END,
  portal = CASE
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%3001440%' THEN 'PV'
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%3000840%' THEN 'PV'
    WHEN dealer_code IS NOT NULL AND upper(dealer_code) LIKE '%500A840%' THEN 'EV'
    WHEN branch LIKE '% EV' THEN 'EV'
    WHEN branch LIKE '% PV' THEN 'PV'
    ELSE portal
  END
WHERE
  branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')
  OR (dealer_code IS NOT NULL AND (
    upper(dealer_code) LIKE '%3001440%'
    OR upper(dealer_code) LIKE '%3000840%'
    OR upper(dealer_code) LIKE '%500A840%'
  ));

-- 5) Optional consistency for issue-log table used by import UI
UPDATE public.import_employee_mapping_issues
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

COMMIT;

-- Post-run verification queries (run manually after migration):
--
-- SELECT 'service_vas_jc_data' AS table_name, branch, COUNT(*)
-- FROM public.service_vas_jc_data
-- GROUP BY branch ORDER BY branch;
--
-- SELECT 'job_card_closed_data' AS table_name, branch, COUNT(*)
-- FROM public.job_card_closed_data
-- GROUP BY branch ORDER BY branch;
--
-- SELECT 'service_invoice_data' AS table_name, branch, COUNT(*)
-- FROM public.service_invoice_data
-- GROUP BY branch ORDER BY branch;
--
-- SELECT 'service_invoice_order_data' AS table_name, branch, COUNT(*)
-- FROM public.service_invoice_order_data
-- GROUP BY branch ORDER BY branch;
--
-- SELECT 'service_parts_consumption_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.service_parts_consumption_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'service_parts_order_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.service_parts_order_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'service_parts_stock_snapshot_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.service_parts_stock_snapshot_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'import_employee_mapping_issues' AS table_name, branch, COUNT(*)
-- FROM public.import_employee_mapping_issues
-- GROUP BY branch ORDER BY branch;
