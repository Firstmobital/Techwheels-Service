-- Plan: SUPABASE-002 Phase 4 (Concrete v2)
-- Read-only checks for assumed_next_service_type mapping and sync rollout.

-- 1) Mapping parity between stored and computed values.
SELECT COUNT(*) AS mapping_mismatch_rows
FROM public.all_service_data a
WHERE a.assumed_next_service_type IS DISTINCT FROM public.calc_all_service_assumed_next_service_type(
  a.last_service_type
);

-- 2) Blank-input behavior check (blank/NULL last_service_type should map to NULL).
SELECT
  COUNT(*) FILTER (
    WHERE lower(btrim(COALESCE(a.last_service_type, ''))) = ''
  ) AS blank_input_rows,
  COUNT(*) FILTER (
    WHERE lower(btrim(COALESCE(a.last_service_type, ''))) = ''
      AND a.assumed_next_service_type IS NULL
  ) AS blank_input_correctly_null_rows,
  COUNT(*) FILTER (
    WHERE lower(btrim(COALESCE(a.last_service_type, ''))) = ''
      AND a.assumed_next_service_type IS NOT NULL
  ) AS blank_input_incorrect_non_null_rows
FROM public.all_service_data a;

-- 3) Unknown input distribution: non-blank values outside explicit mapping and not containing "service".
SELECT
  lower(btrim(a.last_service_type)) AS normalized_last_service_type,
  COUNT(*) AS rows
FROM public.all_service_data a
WHERE lower(btrim(COALESCE(a.last_service_type, ''))) <> ''
  AND lower(btrim(a.last_service_type)) NOT IN (
    'new',
    'first free service',
    'second free service',
    'tma-first free service',
    'tma-second free service',
    'tma-third free service',
    'schedule service'
  )
  AND lower(btrim(a.last_service_type)) NOT LIKE '%service%'
GROUP BY 1
ORDER BY rows DESC, normalized_last_service_type;

-- 4) Mapping distribution snapshot (source -> assumed next type).
SELECT
  lower(btrim(COALESCE(a.last_service_type, ''))) AS normalized_last_service_type,
  public.calc_all_service_assumed_next_service_type(a.last_service_type) AS expected_assumed_next_service_type,
  COUNT(*) AS rows
FROM public.all_service_data a
GROUP BY 1, 2
ORDER BY rows DESC, normalized_last_service_type;

-- 5) Sample mismatches for manual review (should return zero rows after backfill).
SELECT
  a.id,
  a.last_service_type,
  a.assumed_next_service_type AS stored_assumed_next_service_type,
  public.calc_all_service_assumed_next_service_type(a.last_service_type) AS expected_assumed_next_service_type
FROM public.all_service_data a
WHERE a.assumed_next_service_type IS DISTINCT FROM public.calc_all_service_assumed_next_service_type(
  a.last_service_type
)
ORDER BY a.id DESC
LIMIT 100;
