-- Ensure idempotent re-imports for service_parts_consumption_data.
-- 1) Remove existing duplicates by (branch, portal, source_row_hash), keeping latest row.
-- 2) Enforce uniqueness on (branch, portal, source_row_hash) for future upserts.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY branch, portal, source_row_hash
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.service_parts_consumption_data
  WHERE branch IS NOT NULL
    AND portal IS NOT NULL
    AND source_row_hash IS NOT NULL
)
DELETE FROM public.service_parts_consumption_data t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_consumption_branch_portal_source_row_hash
  ON public.service_parts_consumption_data (branch, portal, source_row_hash)
  WHERE branch IS NOT NULL
    AND portal IS NOT NULL
    AND source_row_hash IS NOT NULL;
