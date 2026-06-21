-- Plan: SUPABASE-002 Phase 4 (Concrete v1)
-- Read-only checks for assumed_next_service_date derivation rollout.

-- 1) Null/coverage snapshot.
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE public.parse_all_service_date_text(a.last_service_date) IS NOT NULL) AS parseable_last_service_date_rows,
  COUNT(*) FILTER (WHERE public.parse_all_service_date_text(a.last_service_date) IS NULL) AS unparseable_or_blank_last_service_date_rows,
  COUNT(*) FILTER (WHERE a.assumed_next_service_date IS NOT NULL) AS assumed_next_service_date_populated_rows,
  COUNT(*) FILTER (WHERE a.assumed_next_service_date IS NULL) AS assumed_next_service_date_null_rows
FROM public.all_service_data a;

-- 2) Verify persisted value equals formula for parseable rows.
SELECT COUNT(*) AS formula_mismatch_rows
FROM public.all_service_data a
WHERE public.parse_all_service_date_text(a.last_service_date) IS NOT NULL
  AND a.assumed_next_service_date IS DISTINCT FROM public.calc_all_service_assumed_next_service_date(
    a.last_service_date,
    a.last_service_type,
    current_date
  );

-- 3) Verify parseable rows are not left NULL.
SELECT COUNT(*) AS parseable_but_null_assumed_date_rows
FROM public.all_service_data a
WHERE public.parse_all_service_date_text(a.last_service_date) IS NOT NULL
  AND a.assumed_next_service_date IS NULL;

-- 4) Distribution by target bucket inferred from last_service_type.
SELECT
  CASE
    WHEN lower(btrim(COALESCE(a.last_service_type, ''))) IN ('', 'new') THEN 'target_60'
    WHEN lower(btrim(COALESCE(a.last_service_type, ''))) IN ('first free service', 'tma-first free service') THEN 'target_120'
    ELSE 'target_180'
  END AS target_bucket,
  COUNT(*) AS rows_in_bucket,
  COUNT(*) FILTER (WHERE a.assumed_next_service_date IS NOT NULL) AS populated_rows_in_bucket
FROM public.all_service_data a
GROUP BY 1
ORDER BY 1;

-- 5) Sample rows for manual sanity checks.
SELECT
  a.id,
  a.last_service_type,
  a.last_service_date,
  public.parse_all_service_date_text(a.last_service_date) AS parsed_last_service_date,
  MOD(GREATEST(0, (current_date - public.parse_all_service_date_text(a.last_service_date))::int), 180) AS done_days,
  public.calc_all_service_assumed_next_service_date(a.last_service_date, a.last_service_type, current_date) AS expected_assumed_next_service_date,
  a.assumed_next_service_date AS stored_assumed_next_service_date
FROM public.all_service_data a
WHERE public.parse_all_service_date_text(a.last_service_date) IS NOT NULL
ORDER BY a.id DESC
LIMIT 50;
