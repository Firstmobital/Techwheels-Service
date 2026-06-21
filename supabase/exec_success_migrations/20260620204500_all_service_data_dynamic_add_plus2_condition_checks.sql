-- Plan: SUPABASE-002 follow-up
-- Read-only checks for plus-2 scheduled service date condition.

-- 1) Condition-level counts and overlap snapshot.
WITH evaluated AS (
  SELECT
    a.id,
    (
      a.chassis_no IS NOT NULL
      AND COALESCE(
        (
          SELECT bool_and(e.value IS NULL)
          FROM jsonb_each(
            to_jsonb(a) - ARRAY['id','chassis_no','created_at','last_updated_at']
          ) AS e(key, value)
        ),
        true
      )
    ) AS cond_all_null_except_technical,
    (
      a.chassis_no IS NOT NULL
      AND COALESCE(
        (
          CASE
            WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'YYYY-MM-DD')
            WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$'
              THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'DD-MM-YYYY')
            WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
              THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'DD/MM/YYYY')
            ELSE NULL
          END
        ) = (current_date + 2),
        false
      )
    ) AS cond_scheduled_date_plus_2
  FROM public.all_service_data a
)
SELECT
  COUNT(*) FILTER (WHERE cond_all_null_except_technical) AS cond1_count,
  COUNT(*) FILTER (WHERE cond_scheduled_date_plus_2) AS cond2_count,
  COUNT(*) FILTER (WHERE cond_all_null_except_technical AND cond_scheduled_date_plus_2) AS overlap_count,
  COUNT(*) FILTER (WHERE cond_all_null_except_technical OR cond_scheduled_date_plus_2) AS total_active_predicate_count
FROM evaluated;

-- 2) Target parity should hold.
SELECT
  (SELECT COUNT(*) FROM public.all_service_data a WHERE public.is_all_service_dynamic_match(a)) AS expected_count,
  (SELECT COUNT(*) FROM public.all_service_data_dynamic d) AS actual_count;

-- 3) Mismatch checks should return zero rows.
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a)
EXCEPT
SELECT d.id
FROM public.all_service_data_dynamic d;

SELECT d.id
FROM public.all_service_data_dynamic d
EXCEPT
SELECT a.id
FROM public.all_service_data a
WHERE public.is_all_service_dynamic_match(a);

-- 4) Sample rows for new plus-2 condition.
SELECT
  a.id,
  a.chassis_no,
  a.scheduled_next_service_date
FROM public.all_service_data a
WHERE
  a.chassis_no IS NOT NULL
  AND COALESCE(
    (
      CASE
        WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'YYYY-MM-DD')
        WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}-[0-9]{2}-[0-9]{4}$'
          THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'DD-MM-YYYY')
        WHEN nullif(btrim(a.scheduled_next_service_date), '') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
          THEN to_date(nullif(btrim(a.scheduled_next_service_date), ''), 'DD/MM/YYYY')
        ELSE NULL
      END
    ) = (current_date + 2),
    false
  )
ORDER BY a.id DESC
LIMIT 25;
