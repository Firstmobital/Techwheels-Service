-- ============================================================
-- SUPABASE-002: Portal backfill hardening with employee_master precedence
-- Created: 2026-06-11
--
-- Business rules:
-- 1) Winning source: employee_master.location and employee_master.fuel_type.
-- 2) If no employee_master match, derive portal by dealer code mapping:
--    3000840 -> PV, 500A840 -> EV, 3001440 -> PV.
-- 3) Apply to operational tables carrying SA/employee identifiers.
-- ============================================================

BEGIN;

-- Helper expression notes:
-- - Supports both SA code formats like:
--   - 500A840_131  (dealer first)
--   - EPM_500A840  (dealer second)
-- - Attempts exact, part1, and part2 employee_code matches in employee_master.

-- 1) service_reception_entries (source: sa_employee_code)
WITH resolved AS (
  SELECT
    s.id,
    s.sa_employee_code,
    s.location AS old_location,
    s.portal AS old_portal,
    em_best.location AS em_location,
    em_best.fuel_type AS em_fuel_type,
    CASE
      WHEN upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(s.sa_employee_code, '_', 1)))
      WHEN upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(s.sa_employee_code, '_', 2)))
      WHEN upper(btrim(coalesce(s.sa_employee_code, ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(s.sa_employee_code))
      ELSE NULL
    END AS mapped_dealer_code,
    CASE
      WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% EV' THEN 'EV'
      WHEN upper(btrim(coalesce(s.branch, ''))) LIKE '% PV' THEN 'PV'
      ELSE NULL
    END AS branch_suffix_portal
  FROM public.service_reception_entries s
  LEFT JOIN LATERAL (
    SELECT em.location, em.fuel_type
    FROM public.employee_master em
    WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (
      upper(btrim(coalesce(s.sa_employee_code, ''))),
      upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))),
      upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), '')))
    )
    ORDER BY
      CASE
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(s.sa_employee_code, ''))) THEN 1
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 1), ''))) THEN 2
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(s.sa_employee_code, '_', 2), ''))) THEN 3
        ELSE 9
      END
    LIMIT 1
  ) em_best ON true
  WHERE s.sa_employee_code IS NOT NULL
)
UPDATE public.service_reception_entries s
SET
  location = COALESCE(
    NULLIF(btrim(resolved.em_location), ''),
    s.location,
    NULLIF(btrim(regexp_replace(coalesce(s.branch, ''), '(?i)\s+(EV|PV)$', '')), ''),
    NULLIF(btrim(s.branch), '')
  ),
  portal = COALESCE(
    CASE WHEN upper(btrim(coalesce(resolved.em_fuel_type, ''))) IN ('EV', 'PV') THEN upper(btrim(resolved.em_fuel_type)) ELSE NULL END,
    CASE resolved.mapped_dealer_code
      WHEN '500A840' THEN 'EV'
      WHEN '3000840' THEN 'PV'
      WHEN '3001440' THEN 'PV'
      ELSE NULL
    END,
    CASE WHEN upper(btrim(coalesce(s.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(s.portal)) ELSE NULL END,
    resolved.branch_suffix_portal
  ),
  branch_label = COALESCE(
    NULLIF(btrim(s.branch_label), ''),
    NULLIF(btrim(s.branch), ''),
    COALESCE(NULLIF(btrim(resolved.em_location), ''), NULLIF(btrim(s.location), ''))
  )
FROM resolved
WHERE s.id = resolved.id;

-- 2) bodyshop_repair_cards (source: sa_employee_code)
WITH resolved AS (
  SELECT
    b.id,
    b.sa_employee_code,
    em_best.location AS em_location,
    em_best.fuel_type AS em_fuel_type,
    CASE
      WHEN upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(b.sa_employee_code, '_', 1)))
      WHEN upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(b.sa_employee_code, '_', 2)))
      WHEN upper(btrim(coalesce(b.sa_employee_code, ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(b.sa_employee_code))
      ELSE NULL
    END AS mapped_dealer_code,
    CASE
      WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% EV' THEN 'EV'
      WHEN upper(btrim(coalesce(b.branch, ''))) LIKE '% PV' THEN 'PV'
      ELSE NULL
    END AS branch_suffix_portal
  FROM public.bodyshop_repair_cards b
  LEFT JOIN LATERAL (
    SELECT em.location, em.fuel_type
    FROM public.employee_master em
    WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (
      upper(btrim(coalesce(b.sa_employee_code, ''))),
      upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 1), ''))),
      upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 2), '')))
    )
    ORDER BY
      CASE
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(b.sa_employee_code, ''))) THEN 1
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 1), ''))) THEN 2
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(b.sa_employee_code, '_', 2), ''))) THEN 3
        ELSE 9
      END
    LIMIT 1
  ) em_best ON true
  WHERE b.sa_employee_code IS NOT NULL
)
UPDATE public.bodyshop_repair_cards b
SET
  location = COALESCE(
    NULLIF(btrim(resolved.em_location), ''),
    b.location,
    NULLIF(btrim(regexp_replace(coalesce(b.branch, ''), '(?i)\s+(EV|PV)$', '')), ''),
    NULLIF(btrim(b.branch), '')
  ),
  portal = COALESCE(
    CASE WHEN upper(btrim(coalesce(resolved.em_fuel_type, ''))) IN ('EV', 'PV') THEN upper(btrim(resolved.em_fuel_type)) ELSE NULL END,
    CASE resolved.mapped_dealer_code
      WHEN '500A840' THEN 'EV'
      WHEN '3000840' THEN 'PV'
      WHEN '3001440' THEN 'PV'
      ELSE NULL
    END,
    CASE WHEN upper(btrim(coalesce(b.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(b.portal)) ELSE NULL END,
    resolved.branch_suffix_portal
  ),
  branch_label = COALESCE(
    NULLIF(btrim(b.branch_label), ''),
    NULLIF(btrim(b.branch), ''),
    COALESCE(NULLIF(btrim(resolved.em_location), ''), NULLIF(btrim(b.location), ''))
  )
FROM resolved
WHERE b.id = resolved.id;

-- 3) job_card_closed_data (source: employee_code)
WITH resolved AS (
  SELECT
    j.id,
    j.employee_code,
    em_best.location AS em_location,
    em_best.fuel_type AS em_fuel_type,
    CASE
      WHEN upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(j.employee_code, '_', 1)))
      WHEN upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(split_part(j.employee_code, '_', 2)))
      WHEN upper(btrim(coalesce(j.employee_code, ''))) IN ('3000840', '500A840', '3001440')
        THEN upper(btrim(j.employee_code))
      ELSE NULL
    END AS mapped_dealer_code,
    CASE
      WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% EV' THEN 'EV'
      WHEN upper(btrim(coalesce(j.branch, ''))) LIKE '% PV' THEN 'PV'
      ELSE NULL
    END AS branch_suffix_portal
  FROM public.job_card_closed_data j
  LEFT JOIN LATERAL (
    SELECT em.location, em.fuel_type
    FROM public.employee_master em
    WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (
      upper(btrim(coalesce(j.employee_code, ''))),
      upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))),
      upper(btrim(coalesce(split_part(j.employee_code, '_', 2), '')))
    )
    ORDER BY
      CASE
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(j.employee_code, ''))) THEN 1
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(j.employee_code, '_', 1), ''))) THEN 2
        WHEN upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(split_part(j.employee_code, '_', 2), ''))) THEN 3
        ELSE 9
      END
    LIMIT 1
  ) em_best ON true
  WHERE j.employee_code IS NOT NULL
)
UPDATE public.job_card_closed_data j
SET
  location = COALESCE(
    NULLIF(btrim(resolved.em_location), ''),
    j.location,
    NULLIF(btrim(regexp_replace(coalesce(j.branch, ''), '(?i)\s+(EV|PV)$', '')), ''),
    NULLIF(btrim(j.branch), '')
  ),
  portal = COALESCE(
    CASE WHEN upper(btrim(coalesce(resolved.em_fuel_type, ''))) IN ('EV', 'PV') THEN upper(btrim(resolved.em_fuel_type)) ELSE NULL END,
    CASE resolved.mapped_dealer_code
      WHEN '500A840' THEN 'EV'
      WHEN '3000840' THEN 'PV'
      WHEN '3001440' THEN 'PV'
      ELSE NULL
    END,
    CASE WHEN upper(btrim(coalesce(j.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(j.portal)) ELSE NULL END,
    resolved.branch_suffix_portal
  ),
  branch_label = COALESCE(
    NULLIF(btrim(j.branch_label), ''),
    NULLIF(btrim(j.branch), ''),
    COALESCE(NULLIF(btrim(resolved.em_location), ''), NULLIF(btrim(j.location), ''))
  )
FROM resolved
WHERE j.id = resolved.id;

-- 4) Future-proofing: keep reception trigger semantics aligned for new rows.
-- Existing trigger calls public.apply_sa_business_mapping_on_reception().
CREATE OR REPLACE FUNCTION public.apply_sa_business_mapping_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code_upper text;
  code_part1 text;
  code_part2 text;
  employee_location text;
  employee_fuel_type text;
  mapped_dealer_code text;
BEGIN
  code_upper := upper(btrim(coalesce(NEW.sa_employee_code, '')));
  code_part1 := upper(btrim(coalesce(split_part(NEW.sa_employee_code, '_', 1), '')));
  code_part2 := upper(btrim(coalesce(split_part(NEW.sa_employee_code, '_', 2), '')));

  IF code_upper = '' THEN
    RETURN NEW;
  END IF;

  SELECT
    NULLIF(btrim(em.location), ''),
    CASE WHEN upper(btrim(coalesce(em.fuel_type, ''))) IN ('EV', 'PV') THEN upper(btrim(em.fuel_type)) ELSE NULL END
  INTO employee_location, employee_fuel_type
  FROM public.employee_master em
  WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (code_upper, code_part1, code_part2)
  ORDER BY
    CASE
      WHEN upper(btrim(coalesce(em.employee_code, ''))) = code_upper THEN 1
      WHEN upper(btrim(coalesce(em.employee_code, ''))) = code_part1 THEN 2
      WHEN upper(btrim(coalesce(em.employee_code, ''))) = code_part2 THEN 3
      ELSE 9
    END
  LIMIT 1;

  IF code_part1 IN ('3000840', '500A840', '3001440') THEN
    mapped_dealer_code := code_part1;
  ELSIF code_part2 IN ('3000840', '500A840', '3001440') THEN
    mapped_dealer_code := code_part2;
  ELSIF code_upper IN ('3000840', '500A840', '3001440') THEN
    mapped_dealer_code := code_upper;
  ELSE
    mapped_dealer_code := NULL;
  END IF;

  -- Preserve existing dealer_code mapping behavior.
  IF mapped_dealer_code IS NOT NULL THEN
    NEW.dealer_code := mapped_dealer_code;
  END IF;

  -- Winning source for location is employee_master.location, fallback to legacy mapping.
  NEW.branch := COALESCE(
    employee_location,
    NEW.branch,
    CASE mapped_dealer_code
      WHEN '500A840' THEN 'Sitapura'
      WHEN '3000840' THEN 'Sitapura'
      WHEN '3001440' THEN 'Ajmer Road'
      ELSE NULL
    END
  );

  NEW.location := COALESCE(
    employee_location,
    NULLIF(btrim(coalesce(NEW.location, '')), ''),
    NULLIF(btrim(regexp_replace(coalesce(NEW.branch, ''), '(?i)\s+(EV|PV)$', '')), ''),
    NULLIF(btrim(coalesce(NEW.branch, '')), '')
  );

  NEW.portal := COALESCE(
    employee_fuel_type,
    CASE mapped_dealer_code
      WHEN '500A840' THEN 'EV'
      WHEN '3000840' THEN 'PV'
      WHEN '3001440' THEN 'PV'
      ELSE NULL
    END,
    CASE
      WHEN upper(btrim(coalesce(NEW.branch, ''))) LIKE '% EV' THEN 'EV'
      WHEN upper(btrim(coalesce(NEW.branch, ''))) LIKE '% PV' THEN 'PV'
      ELSE NULL
    END,
    CASE WHEN upper(btrim(coalesce(NEW.portal, ''))) IN ('EV', 'PV') THEN upper(btrim(NEW.portal)) ELSE NULL END
  );

  NEW.branch_label := COALESCE(
    NULLIF(btrim(coalesce(NEW.branch_label, '')), ''),
    NULLIF(btrim(coalesce(NEW.branch, '')), ''),
    NEW.location
  );

  RETURN NEW;
END;
$$;

COMMIT;
