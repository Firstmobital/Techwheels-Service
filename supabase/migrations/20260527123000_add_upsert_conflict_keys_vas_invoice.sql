-- Prepare VAS + Invoice tables for idempotent day-2/day-N re-uploads.
-- Creates stable unique conflict keys required by Postgres ON CONFLICT / Supabase upsert.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- =========================================
-- 1) VAS: de-duplicate existing rows
-- Natural key: (job_card_number, branch, sr_type)
-- Keep latest record by updated_at/created_at/id.
-- =========================================
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        upper(trim(job_card_number)),
        trim(branch),
        upper(trim(sr_type))
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.service_vas_jc_data
  WHERE nullif(trim(coalesce(job_card_number, '')), '') IS NOT NULL
    AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
    AND nullif(trim(coalesce(sr_type, '')), '') IS NOT NULL
)
DELETE FROM public.service_vas_jc_data t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- Create unique key used by upsert(onConflict: 'job_card_number,branch,sr_type').
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_vas_conflict
  ON public.service_vas_jc_data (job_card_number, branch, sr_type)
  WHERE nullif(trim(coalesce(job_card_number, '')), '') IS NOT NULL
    AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
    AND nullif(trim(coalesce(sr_type, '')), '') IS NOT NULL;


-- =========================================
-- 2) Invoice: de-duplicate existing rows
-- Natural key: (<detected key>, branch, invoice_date)
-- Key detection priority: job_card_number -> order_number -> sr_number -> invoice_number
-- Keep latest record by updated_at/created_at/id.
-- =========================================
DO $$
DECLARE
  invoice_key_col text;
  dedupe_sql text;
  create_idx_sql text;
BEGIN
  SELECT c.column_name
    INTO invoice_key_col
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'service_invoice_data'
    AND c.column_name IN ('job_card_number', 'order_number', 'sr_number', 'invoice_number')
  ORDER BY array_position(ARRAY['job_card_number', 'order_number', 'sr_number', 'invoice_number'], c.column_name)
  LIMIT 1;

  IF invoice_key_col IS NULL THEN
    RAISE EXCEPTION 'service_invoice_data: none of expected key columns found (job_card_number/order_number/sr_number/invoice_number)';
  END IF;

  dedupe_sql := format($f$
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY
            upper(trim(%1$I)),
            trim(branch),
            invoice_date
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM public.service_invoice_data
      WHERE nullif(trim(coalesce(%1$I, '')), '') IS NOT NULL
        AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
        AND invoice_date IS NOT NULL
    )
    DELETE FROM public.service_invoice_data t
    USING ranked r
    WHERE t.id = r.id
      AND r.rn > 1;
  $f$, invoice_key_col);

  EXECUTE dedupe_sql;

  EXECUTE 'DROP INDEX IF EXISTS public.uq_service_invoice_conflict';

  create_idx_sql := format($f$
    CREATE UNIQUE INDEX IF NOT EXISTS uq_service_invoice_conflict
      ON public.service_invoice_data (%1$I, branch, invoice_date)
      WHERE nullif(trim(coalesce(%1$I, '')), '') IS NOT NULL
        AND nullif(trim(coalesce(branch, '')), '') IS NOT NULL
        AND invoice_date IS NOT NULL;
  $f$, invoice_key_col);

  EXECUTE create_idx_sql;
END $$;

COMMIT;
