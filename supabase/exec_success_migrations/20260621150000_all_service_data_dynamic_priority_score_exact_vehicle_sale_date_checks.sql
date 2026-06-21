-- Read-only verification checks for:
-- 20260621150000_all_service_data_dynamic_priority_score_exact_vehicle_sale_date.sql

-- 1) Verify priority_score column is bigint.
SELECT
  data_type = 'bigint' AS priority_score_is_bigint
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data_dynamic'
  AND column_name = 'priority_score';

-- 2) Verify scorer includes parser and expanded multiplier for exact day-level tertiary ordering.
SELECT
  pg_get_functiondef('public.calc_all_service_dynamic_priority_score(date,text,text)'::regprocedure) ILIKE '%parse_all_service_date_text%' AS scorer_parses_vehicle_sale_date,
  pg_get_functiondef('public.calc_all_service_dynamic_priority_score(date,text,text)'::regprocedure) ILIKE '%* 10000000%' AS scorer_uses_expanded_weight;

-- 3) Stored score parity against V3 scorer.
SELECT COUNT(*) AS priority_score_v3_mismatch_rows
FROM public.all_service_data_dynamic d
WHERE d.priority_score IS DISTINCT FROM public.calc_all_service_dynamic_priority_score(
  d.assumed_next_service_date,
  d.assumed_next_service_type,
  d.vehicle_sale_date
);

-- 4) Monotonic check inside (sold_dealer, assumed_next_service_date, assumed_next_service_type):
--    when sorted by score desc then id asc, parsed vehicle_sale_date must not increase.
WITH ordered AS (
  SELECT
    sold_dealer,
    assumed_next_service_date,
    assumed_next_service_type,
    public.parse_all_service_date_text(vehicle_sale_date) AS vehicle_sale_dt,
    priority_score,
    id,
    LAG(public.parse_all_service_date_text(vehicle_sale_date)) OVER (
      PARTITION BY sold_dealer, assumed_next_service_date, assumed_next_service_type
      ORDER BY priority_score DESC, id ASC
    ) AS prev_vehicle_sale_dt
  FROM public.all_service_data_dynamic
)
SELECT COUNT(*) AS vehicle_sale_date_monotonic_violations
FROM ordered
WHERE vehicle_sale_dt IS NOT NULL
  AND prev_vehicle_sale_dt IS NOT NULL
  AND vehicle_sale_dt > prev_vehicle_sale_dt;

-- 5) Sync function still calls 3-arg scorer with NEW.vehicle_sale_date.
SELECT
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%calc_all_service_dynamic_priority_score(%' AS sync_mentions_scorer,
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%NEW.vehicle_sale_date%' AS sync_mentions_new_vehicle_sale_date;

-- 6) Ordered preview.
SELECT
  id,
  sold_dealer,
  assumed_next_service_date,
  assumed_next_service_type,
  vehicle_sale_date,
  priority_bucket,
  priority_score
FROM public.all_service_data_dynamic
ORDER BY priority_bucket ASC, priority_score DESC, id ASC
LIMIT 100;
