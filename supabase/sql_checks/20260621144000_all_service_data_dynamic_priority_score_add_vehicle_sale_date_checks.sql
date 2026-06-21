-- Read-only verification checks for:
-- 20260621144000_all_service_data_dynamic_priority_score_add_vehicle_sale_date.sql

-- 1) Verify 3-arg scorer exists and mentions vehicle_sale_date parsing.
SELECT
  pg_get_functiondef('public.calc_all_service_dynamic_priority_score(date,text,text)'::regprocedure) ILIKE '%parse_all_service_date_text%' AS scorer_parses_vehicle_sale_date,
  pg_get_functiondef('public.calc_all_service_dynamic_priority_score(date,text,text)'::regprocedure) ILIKE '%vehicle_sale_dt%' AS scorer_mentions_vehicle_sale_dt;

-- 2) Stored score parity against V2 scorer.
SELECT COUNT(*) AS priority_score_v2_mismatch_rows
FROM public.all_service_data_dynamic d
WHERE d.priority_score IS DISTINCT FROM public.calc_all_service_dynamic_priority_score(
  d.assumed_next_service_date,
  d.assumed_next_service_type,
  d.vehicle_sale_date
);

-- 3) Sync function includes 3-arg scorer call with NEW.vehicle_sale_date.
SELECT
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%calc_all_service_dynamic_priority_score(%' AS sync_mentions_scorer,
  pg_get_functiondef('public.sync_all_service_data_dynamic()'::regprocedure) ILIKE '%NEW.vehicle_sale_date%' AS sync_mentions_new_vehicle_sale_date;

-- 4) Ordered preview with tertiary vehicle_sale_date behavior.
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

-- 5) Focus sample for rows sharing sold_dealer/date/type to inspect newer vehicle_sale_date precedence.
SELECT
  sold_dealer,
  assumed_next_service_date,
  assumed_next_service_type,
  vehicle_sale_date,
  priority_score,
  id
FROM public.all_service_data_dynamic
WHERE sold_dealer = 'Techwheels'
  AND assumed_next_service_date IS NOT NULL
  AND assumed_next_service_type IN ('First Free Service','Second Free Service','Third Free Service','Paid Service','Unknown')
ORDER BY priority_bucket ASC, priority_score DESC, id ASC
LIMIT 50;
