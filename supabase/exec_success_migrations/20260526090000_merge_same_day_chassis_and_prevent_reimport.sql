-- Merge same-day duplicate chassis rows in job_card_closed_data
-- and prevent re-importing the same source rows again.

BEGIN;

-- 1) Keep list of all job cards merged into a single chassis/day row.
ALTER TABLE public.job_card_closed_data
  ADD COLUMN IF NOT EXISTS merged_job_cards text[] NOT NULL DEFAULT '{}';

-- 2) Registry of imported row signatures (idempotency guard).
CREATE TABLE IF NOT EXISTS public.job_card_closed_data_import_signatures (
  signature text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Helpful index for same-day chassis merge lookups.
CREATE INDEX IF NOT EXISTS idx_jc_closed_branch_invoice_chassis
  ON public.job_card_closed_data (branch, invoice_date, chassis_number);

-- 4) Seed signature registry from already present rows.
INSERT INTO public.job_card_closed_data_import_signatures (signature)
SELECT DISTINCT
  md5(
    coalesce(branch, '') || '|' ||
    coalesce(invoice_date::text, '') || '|' ||
    upper(trim(coalesce(job_card_number, ''))) || '|' ||
    upper(trim(coalesce(chassis_number, ''))) || '|' ||
    coalesce(final_labour_amount, 0)::text || '|' ||
    coalesce(final_spares_amount, 0)::text || '|' ||
    coalesce(total_invoice_amount, 0)::text
  )
FROM public.job_card_closed_data
ON CONFLICT (signature) DO NOTHING;

-- 5) One-time backfill: collapse existing duplicates by (branch, invoice_date, chassis_number).
WITH grouped AS (
  SELECT
    branch,
    invoice_date,
    upper(trim(coalesce(chassis_number, ''))) AS norm_chassis,
    min(id) AS keeper_id,
    array_remove(array_agg(DISTINCT nullif(upper(trim(coalesce(job_card_number, ''))), '')), NULL) AS job_cards,
    sum(coalesce(final_labour_amount, 0)) AS labour_sum,
    sum(coalesce(final_spares_amount, 0)) AS spares_sum,
    sum(coalesce(total_invoice_amount, 0)) AS total_sum,
    array_agg(id) AS all_ids,
    count(*) AS row_count
  FROM public.job_card_closed_data
  WHERE invoice_date IS NOT NULL
    AND nullif(trim(coalesce(chassis_number, '')), '') IS NOT NULL
  GROUP BY branch, invoice_date, upper(trim(coalesce(chassis_number, '')))
  HAVING count(*) > 1
),
updated AS (
  UPDATE public.job_card_closed_data t
  SET
    chassis_number = g.norm_chassis,
    final_labour_amount = g.labour_sum,
    final_spares_amount = g.spares_sum,
    total_invoice_amount = g.total_sum,
    merged_job_cards = g.job_cards,
    updated_at = now()
  FROM grouped g
  WHERE t.id = g.keeper_id
  RETURNING t.id
)
DELETE FROM public.job_card_closed_data d
USING grouped g
WHERE d.id = ANY(g.all_ids)
  AND d.id <> g.keeper_id;

-- 6) Trigger function: idempotent insert + same-day chassis merge.
CREATE OR REPLACE FUNCTION public.fn_jc_closed_dedupe_and_merge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_signature text;
  v_keeper_id bigint;
  v_new_job_cards text[];
BEGIN
  -- Enforce normalized keys.
  NEW.chassis_number := upper(trim(coalesce(NEW.chassis_number, '')));
  NEW.job_card_number := nullif(upper(trim(coalesce(NEW.job_card_number, ''))), '');

  -- If invoice_date/chassis is missing, do normal insert (cannot merge by same-day chassis rule).
  IF NEW.invoice_date IS NULL OR NEW.chassis_number = '' THEN
    RETURN NEW;
  END IF;

  v_signature := md5(
    coalesce(NEW.branch, '') || '|' ||
    coalesce(NEW.invoice_date::text, '') || '|' ||
    coalesce(NEW.job_card_number, '') || '|' ||
    coalesce(NEW.chassis_number, '') || '|' ||
    coalesce(NEW.final_labour_amount, 0)::text || '|' ||
    coalesce(NEW.final_spares_amount, 0)::text || '|' ||
    coalesce(NEW.total_invoice_amount, 0)::text
  );

  -- Exact row already imported earlier => ignore (prevents double counting on re-upload).
  INSERT INTO public.job_card_closed_data_import_signatures(signature)
  VALUES (v_signature)
  ON CONFLICT (signature) DO NOTHING;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id
    INTO v_keeper_id
  FROM public.job_card_closed_data
  WHERE branch IS NOT DISTINCT FROM NEW.branch
    AND invoice_date = NEW.invoice_date
    AND upper(trim(coalesce(chassis_number, ''))) = NEW.chassis_number
  ORDER BY id
  LIMIT 1;

  -- First row of this (branch, invoice_date, chassis) group.
  IF v_keeper_id IS NULL THEN
    NEW.merged_job_cards := CASE
      WHEN NEW.job_card_number IS NULL THEN '{}'::text[]
      ELSE ARRAY[NEW.job_card_number]
    END;
    RETURN NEW;
  END IF;

  v_new_job_cards := CASE
    WHEN NEW.job_card_number IS NULL THEN '{}'::text[]
    ELSE ARRAY[NEW.job_card_number]
  END;

  -- Merge incoming row into existing keeper row and skip insert.
  UPDATE public.job_card_closed_data t
  SET
    final_labour_amount = coalesce(t.final_labour_amount, 0) + coalesce(NEW.final_labour_amount, 0),
    final_spares_amount = coalesce(t.final_spares_amount, 0) + coalesce(NEW.final_spares_amount, 0),
    total_invoice_amount = coalesce(t.total_invoice_amount, 0) + coalesce(NEW.total_invoice_amount, 0),
    merged_job_cards = (
      SELECT array(
        SELECT DISTINCT x
        FROM unnest(coalesce(t.merged_job_cards, '{}'::text[]) || v_new_job_cards) AS x
        WHERE x IS NOT NULL AND x <> ''
      )
    ),
    updated_at = now()
  WHERE t.id = v_keeper_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_jc_closed_dedupe_and_merge ON public.job_card_closed_data;
CREATE TRIGGER trg_jc_closed_dedupe_and_merge
BEFORE INSERT ON public.job_card_closed_data
FOR EACH ROW
EXECUTE FUNCTION public.fn_jc_closed_dedupe_and_merge();

COMMIT;
