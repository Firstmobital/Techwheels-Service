-- Rollback: Revert Reception backfill inserted by 05_backfill_reception_from_psf_20260530_31.sql
-- Scope:
-- - Deletes only rows inserted with source tag: 'PSF Revenue Backfill (30-31 May 2026)'
-- - Optional dealer filter included for safer rollback
--
-- Usage:
-- 1) Set target_dealer_code to the same value used in backfill script.
-- 2) Run in Supabase SQL Editor.
-- 3) Review deleted row count output.

BEGIN;

WITH params AS (
  SELECT
    '3000840'::text AS target_dealer_code,
    'PSF Revenue Backfill (30-31 May 2026)'::text AS backfill_source
),
deleted AS (
  DELETE FROM public.service_reception_entries r
  USING params p
  WHERE r.source = p.backfill_source
    AND r.dealer_code = p.target_dealer_code
  RETURNING r.id
)
SELECT count(*) AS deleted_rows FROM deleted;

COMMIT;
