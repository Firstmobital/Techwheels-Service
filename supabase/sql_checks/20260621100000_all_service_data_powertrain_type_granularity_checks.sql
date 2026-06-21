-- Plan: SUPABASE-002 Phase 5 (Fuel Granularity)
-- Read-only checks for powertrain_type derivation rollout.

-- 1) Coverage and value distribution snapshot.
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE nullif(btrim(COALESCE(a.product_line, '')), '') IS NULL) AS blank_product_line_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type IS NULL) AS powertrain_null_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type = 'EV') AS powertrain_ev_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type = 'CNG') AS powertrain_cng_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type = 'DIESEL') AS powertrain_diesel_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type = 'PETROL') AS powertrain_petrol_rows,
  COUNT(*) FILTER (WHERE a.powertrain_type = 'UNKNOWN') AS powertrain_unknown_rows
FROM public.all_service_data a;

-- 2) Parity check: stored vs deterministic function.
SELECT COUNT(*) AS mapping_mismatch_rows
FROM public.all_service_data a
WHERE a.powertrain_type IS DISTINCT FROM public.calc_all_service_powertrain_type(a.product_line);

-- 3) Blank-input behavior: blank product_line should map to NULL.
SELECT
  COUNT(*) FILTER (
    WHERE nullif(btrim(COALESCE(a.product_line, '')), '') IS NULL
  ) AS blank_input_rows,
  COUNT(*) FILTER (
    WHERE nullif(btrim(COALESCE(a.product_line, '')), '') IS NULL
      AND a.powertrain_type IS NULL
  ) AS blank_input_correctly_null_rows,
  COUNT(*) FILTER (
    WHERE nullif(btrim(COALESCE(a.product_line, '')), '') IS NULL
      AND a.powertrain_type IS NOT NULL
  ) AS blank_input_incorrect_non_null_rows
FROM public.all_service_data a;

-- 4) UNKNOWN distribution for audit hardening.
SELECT
  btrim(a.product_line) AS product_line,
  COUNT(*) AS rows
FROM public.all_service_data a
WHERE a.powertrain_type = 'UNKNOWN'
GROUP BY 1
ORDER BY rows DESC, product_line
LIMIT 200;

-- 4b) Active override rules snapshot.
SELECT
  o.id,
  o.match_pattern,
  o.powertrain_type,
  o.priority,
  o.is_active,
  o.updated_at
FROM public.all_service_data_powertrain_overrides o
ORDER BY o.is_active DESC, o.priority ASC, o.id ASC
LIMIT 200;

-- 5) Mismatch sample rows for manual review (should be zero after backfill).
SELECT
  a.id,
  a.product_line,
  a.powertrain_type AS stored_powertrain_type,
  public.calc_all_service_powertrain_type(a.product_line) AS expected_powertrain_type
FROM public.all_service_data a
WHERE a.powertrain_type IS DISTINCT FROM public.calc_all_service_powertrain_type(a.product_line)
ORDER BY a.id DESC
LIMIT 100;
