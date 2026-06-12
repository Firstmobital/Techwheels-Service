-- SUPABASE-002 checks: employee_master precedence portal backfill

-- 1) Coverage for mapped dealer-code SA rows in service_reception_entries
SELECT COUNT(*) AS unresolved_service_reception_portal_rows
FROM public.service_reception_entries s
WHERE s.sa_employee_code IS NOT NULL
  AND (
    upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(s.sa_employee_code, ''))) IN ('3000840', '500A840', '3001440')
  )
  AND s.portal IS NULL;
-- Expected: 0

-- 2) Coverage for mapped dealer-code SA rows in bodyshop_repair_cards
SELECT COUNT(*) AS unresolved_bodyshop_repair_portal_rows
FROM public.bodyshop_repair_cards b
WHERE b.sa_employee_code IS NOT NULL
  AND (
    upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(b.sa_employee_code, ''))) IN ('3000840', '500A840', '3001440')
  )
  AND b.portal IS NULL;
-- Expected: 0

-- 3) Coverage for mapped dealer-code employee rows in job_card_closed_data
SELECT COUNT(*) AS unresolved_job_card_closed_portal_rows
FROM public.job_card_closed_data j
WHERE j.employee_code IS NOT NULL
  AND (
    upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
    OR upper(btrim(coalesce(j.employee_code, ''))) IN ('3000840', '500A840', '3001440')
  )
  AND j.portal IS NULL;
-- Expected: 0

-- 4) Validate expected mapping outcomes
SELECT 'service_reception_entries' AS table_name, portal, COUNT(*) AS row_count
FROM public.service_reception_entries s
WHERE s.sa_employee_code IS NOT NULL
  AND (
    upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))) = '500A840'
    OR upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), ''))) = '500A840'
    OR upper(btrim(coalesce(s.sa_employee_code, ''))) = '500A840'
  )
GROUP BY portal
UNION ALL
SELECT 'job_card_closed_data', portal, COUNT(*)
FROM public.job_card_closed_data j
WHERE j.employee_code IS NOT NULL
  AND (
    upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) = '500A840'
    OR upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) = '500A840'
    OR upper(btrim(coalesce(j.employee_code, ''))) = '500A840'
  )
GROUP BY portal;
-- Expected: rows should include EV (subject to source-row presence)

-- 5) employee_master precedence spot-check (fuel type alignment)
SELECT COUNT(*) AS employee_master_fuel_mismatch_rows
FROM public.service_reception_entries s
JOIN public.employee_master em
  ON upper(btrim(coalesce(em.employee_code, ''))) IN (
    upper(btrim(coalesce(s.sa_employee_code, ''))),
    upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))),
    upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), '')))
  )
WHERE upper(btrim(coalesce(em.fuel_type, ''))) IN ('EV', 'PV')
  AND s.portal IS DISTINCT FROM upper(btrim(em.fuel_type));
-- Expected: 0 or explainable legacy duplicates requiring deterministic tie-break review

-- 6) Future-row guard: reception trigger function should assign NEW.portal.
SELECT
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%NEW.portal :=%' THEN 'portal_assignment_present'
    ELSE 'portal_assignment_missing'
  END AS trigger_function_portal_logic
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'apply_sa_business_mapping_on_reception';
-- Expected: portal_assignment_present
