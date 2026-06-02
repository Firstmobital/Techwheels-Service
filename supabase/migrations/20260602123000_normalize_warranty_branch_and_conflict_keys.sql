-- Normalize warranty branch model to location-only branch + separate portal.
-- Authority reference: local_folder/backups/full_database.sql
--
-- Changes:
-- 1) branch values from merged labels to location-only values.
-- 2) branch CHECK constraints updated to ('Ajmer Road', 'Sitapura').
-- 3) unique conflict key updated from (branch, source_row_hash)
--    to (branch, portal, source_row_hash).
--
-- IMPORTANT:
-- - Applies only to warranty_* import tables.
-- - No new tables/functions/triggers/RLS are introduced.

BEGIN;

-- Drop old unique constraints (branch, source_row_hash)
ALTER TABLE IF EXISTS public.warranty_claim_settlement_report_data
  DROP CONSTRAINT IF EXISTS warranty_claim_settlement_report_dat_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_part_wc_data
  DROP CONSTRAINT IF EXISTS warranty_part_wc_data_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_updation_claim_data
  DROP CONSTRAINT IF EXISTS warranty_updation_claim_data_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_goodwill_data
  DROP CONSTRAINT IF EXISTS warranty_goodwill_data_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_amc_data
  DROP CONSTRAINT IF EXISTS warranty_amc_data_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_fsb_data
  DROP CONSTRAINT IF EXISTS warranty_fsb_data_branch_source_row_hash_key;
ALTER TABLE IF EXISTS public.warranty_wc_data
  DROP CONSTRAINT IF EXISTS warranty_wc_data_branch_source_row_hash_key;

-- Drop old branch checks (branch included PV/EV suffix)
ALTER TABLE IF EXISTS public.warranty_claim_settlement_report_data
  DROP CONSTRAINT IF EXISTS warranty_claim_settlement_report_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_part_wc_data
  DROP CONSTRAINT IF EXISTS warranty_part_wc_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_updation_claim_data
  DROP CONSTRAINT IF EXISTS warranty_updation_claim_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_goodwill_data
  DROP CONSTRAINT IF EXISTS warranty_goodwill_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_amc_data
  DROP CONSTRAINT IF EXISTS warranty_amc_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_fsb_data
  DROP CONSTRAINT IF EXISTS warranty_fsb_data_branch_check;
ALTER TABLE IF EXISTS public.warranty_wc_data
  DROP CONSTRAINT IF EXISTS warranty_wc_data_branch_check;

-- Backfill branch values to location-only values.
UPDATE public.warranty_claim_settlement_report_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_part_wc_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_updation_claim_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_goodwill_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_amc_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_fsb_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

UPDATE public.warranty_wc_data
SET branch = CASE
  WHEN branch IN ('Ajmer Road PV', 'Ajmer Road EV') THEN 'Ajmer Road'
  WHEN branch IN ('Sitapura PV', 'Sitapura EV') THEN 'Sitapura'
  ELSE branch
END
WHERE branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV');

-- Re-add branch checks (location-only branch values)
ALTER TABLE public.warranty_claim_settlement_report_data
  ADD CONSTRAINT warranty_claim_settlement_report_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_part_wc_data
  ADD CONSTRAINT warranty_part_wc_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_updation_claim_data
  ADD CONSTRAINT warranty_updation_claim_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_goodwill_data
  ADD CONSTRAINT warranty_goodwill_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_amc_data
  ADD CONSTRAINT warranty_amc_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_fsb_data
  ADD CONSTRAINT warranty_fsb_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));
ALTER TABLE public.warranty_wc_data
  ADD CONSTRAINT warranty_wc_data_branch_check
  CHECK (branch IN ('Ajmer Road', 'Sitapura'));

-- Re-add unique conflict keys including portal.
ALTER TABLE public.warranty_claim_settlement_report_data
  ADD CONSTRAINT warranty_claim_settlement_report_dat_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_part_wc_data
  ADD CONSTRAINT warranty_part_wc_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_updation_claim_data
  ADD CONSTRAINT warranty_updation_claim_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_goodwill_data
  ADD CONSTRAINT warranty_goodwill_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_amc_data
  ADD CONSTRAINT warranty_amc_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_fsb_data
  ADD CONSTRAINT warranty_fsb_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);
ALTER TABLE public.warranty_wc_data
  ADD CONSTRAINT warranty_wc_data_branch_portal_source_row_hash_key
  UNIQUE (branch, portal, source_row_hash);

COMMIT;

-- Post-run verification (manual):
-- SELECT 'warranty_claim_settlement_report_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_claim_settlement_report_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_part_wc_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_part_wc_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_updation_claim_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_updation_claim_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_goodwill_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_goodwill_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_amc_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_amc_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_fsb_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_fsb_data
-- GROUP BY branch, portal ORDER BY branch, portal;
--
-- SELECT 'warranty_wc_data' AS table_name, branch, portal, COUNT(*)
-- FROM public.warranty_wc_data
-- GROUP BY branch, portal ORDER BY branch, portal;
