-- Enforce SA code -> dealer/branch/fuel business logic
--
-- Business mapping:
--   * %3000840% -> dealer_code=3000840, location/branch=Sitapura, fuel_type=PV
--   * %500A840% -> dealer_code=500A840, location/branch=Sitapura, fuel_type=EV
--   * %3001440% -> dealer_code=3001440, location/branch=Ajmer Road, fuel_type=PV
--
-- This migration does 3 things:
-- 1) Backfills existing employee_master rows (location, fuel_type)
-- 2) Backfills existing service_reception_entries rows (dealer_code, branch)
-- 3) Adds triggers so future writes stay aligned with business logic

BEGIN;

-- -----------------------------------------------------------------------------
-- A) Backfill employee master metadata from employee_code
-- -----------------------------------------------------------------------------
WITH sa_rules AS (
  SELECT 1 AS priority, '500A840'::text AS code_fragment, '500A840'::text AS dealer_code, 'Sitapura'::text AS location, 'EV'::text AS fuel_type
  UNION ALL
  SELECT 2, '3001440', '3001440', 'Ajmer Road', 'PV'
  UNION ALL
  SELECT 3, '3000840', '3000840', 'Sitapura', 'PV'
), matched AS (
  SELECT
    em.id,
    r.location,
    r.fuel_type,
    row_number() OVER (PARTITION BY em.id ORDER BY r.priority) AS rn
  FROM public.employee_master em
  JOIN sa_rules r
    ON upper(coalesce(em.employee_code, '')) LIKE '%' || upper(r.code_fragment) || '%'
)
UPDATE public.employee_master em
SET
  location = m.location,
  fuel_type = m.fuel_type,
  updated_at = now()
FROM matched m
WHERE m.rn = 1
  AND em.id = m.id
  AND (
    coalesce(em.location, '') <> m.location
    OR coalesce(em.fuel_type, '') <> m.fuel_type
  );

-- -----------------------------------------------------------------------------
-- B) Backfill reception rows from sa_employee_code
-- -----------------------------------------------------------------------------
WITH sa_rules AS (
  SELECT 1 AS priority, '500A840'::text AS code_fragment, '500A840'::text AS dealer_code, 'Sitapura'::text AS branch
  UNION ALL
  SELECT 2, '3001440', '3001440', 'Ajmer Road'
  UNION ALL
  SELECT 3, '3000840', '3000840', 'Sitapura'
), matched AS (
  SELECT
    r.id,
    s.dealer_code,
    s.branch,
    row_number() OVER (PARTITION BY r.id ORDER BY s.priority) AS rn
  FROM public.service_reception_entries r
  JOIN sa_rules s
    ON upper(coalesce(r.sa_employee_code, '')) LIKE '%' || upper(s.code_fragment) || '%'
)
UPDATE public.service_reception_entries r
SET
  dealer_code = m.dealer_code,
  branch = m.branch,
  updated_at = now()
FROM matched m
WHERE m.rn = 1
  AND r.id = m.id
  AND (
    coalesce(r.dealer_code, '') <> m.dealer_code
    OR coalesce(r.branch, '') <> m.branch
  );

-- -----------------------------------------------------------------------------
-- C) Trigger: enforce mapping on service_reception_entries writes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sa_business_mapping_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_upper text;
BEGIN
  code_upper := upper(btrim(coalesce(NEW.sa_employee_code, '')));

  IF code_upper = '' THEN
    RETURN NEW;
  END IF;

  IF code_upper LIKE '%500A840%' THEN
    NEW.dealer_code := '500A840';
    NEW.branch := 'Sitapura';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.dealer_code := '3001440';
    NEW.branch := 'Ajmer Road';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.dealer_code := '3000840';
    NEW.branch := 'Sitapura';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_sa_business_mapping_on_reception ON public.service_reception_entries;
CREATE TRIGGER trg_apply_sa_business_mapping_on_reception
BEFORE INSERT OR UPDATE OF sa_employee_code ON public.service_reception_entries
FOR EACH ROW
EXECUTE FUNCTION public.apply_sa_business_mapping_on_reception();

-- -----------------------------------------------------------------------------
-- D) Trigger: enforce mapping on employee_master writes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sa_business_mapping_on_employee_master()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_upper text;
BEGIN
  code_upper := upper(btrim(coalesce(NEW.employee_code, '')));

  IF code_upper = '' THEN
    RETURN NEW;
  END IF;

  IF code_upper LIKE '%500A840%' THEN
    NEW.location := 'Sitapura';
    NEW.fuel_type := 'EV';
  ELSIF code_upper LIKE '%3001440%' THEN
    NEW.location := 'Ajmer Road';
    NEW.fuel_type := 'PV';
  ELSIF code_upper LIKE '%3000840%' THEN
    NEW.location := 'Sitapura';
    NEW.fuel_type := 'PV';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_sa_business_mapping_on_employee_master ON public.employee_master;
CREATE TRIGGER trg_apply_sa_business_mapping_on_employee_master
BEFORE INSERT OR UPDATE OF employee_code ON public.employee_master
FOR EACH ROW
EXECUTE FUNCTION public.apply_sa_business_mapping_on_employee_master();

COMMIT;

-- -----------------------------------------------------------------------------
-- Post-run verification queries (run manually after migration)
-- -----------------------------------------------------------------------------
-- 1) Verify employee_master mapping
-- SELECT
--   CASE
--     WHEN upper(employee_code) LIKE '%500A840%' THEN '500A840'
--     WHEN upper(employee_code) LIKE '%3001440%' THEN '3001440'
--     WHEN upper(employee_code) LIKE '%3000840%' THEN '3000840'
--     ELSE 'OTHER'
--   END AS code_bucket,
--   location,
--   fuel_type,
--   count(*) AS rows_count
-- FROM public.employee_master
-- GROUP BY 1,2,3
-- ORDER BY 1,2,3;

-- 2) Verify service_reception_entries mapping
-- SELECT
--   CASE
--     WHEN upper(sa_employee_code) LIKE '%500A840%' THEN '500A840'
--     WHEN upper(sa_employee_code) LIKE '%3001440%' THEN '3001440'
--     WHEN upper(sa_employee_code) LIKE '%3000840%' THEN '3000840'
--     ELSE 'OTHER'
--   END AS code_bucket,
--   dealer_code,
--   branch,
--   count(*) AS rows_count
-- FROM public.service_reception_entries
-- WHERE sa_employee_code IS NOT NULL
-- GROUP BY 1,2,3
-- ORDER BY 1,2,3;

-- 3) Ensure no mismatch left for the 3 business buckets
-- SELECT
--   id,
--   sa_employee_code,
--   dealer_code,
--   branch,
--   updated_at
-- FROM public.service_reception_entries
-- WHERE sa_employee_code IS NOT NULL
--   AND (
--     (upper(sa_employee_code) LIKE '%500A840%' AND (dealer_code <> '500A840' OR branch <> 'Sitapura'))
--     OR (upper(sa_employee_code) LIKE '%3001440%' AND (dealer_code <> '3001440' OR branch <> 'Ajmer Road'))
--     OR (upper(sa_employee_code) LIKE '%3000840%' AND (dealer_code <> '3000840' OR branch <> 'Sitapura'))
--   )
-- ORDER BY updated_at DESC
-- LIMIT 200;
