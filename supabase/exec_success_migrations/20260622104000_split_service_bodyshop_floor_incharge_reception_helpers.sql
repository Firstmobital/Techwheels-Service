-- Purpose:
-- 1) Split floor-incharge reception scope into two explicit helpers:
--    - Service floor-incharge helper (fuel-type scoped)
--    - Bodyshop floor-incharge helper (location scoped)
-- 2) Re-point service and bodyshop reception SELECT policies to the correct helper.
-- 3) Keep admin bypass unchanged.
-- 4) Leave existing data untouched (DDL/policy/function only).

BEGIN;

-- Service floor-incharge helper (Service department only, fuel-type scoped)
CREATE OR REPLACE FUNCTION public.user_has_service_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi
      ON fi.employee_code = uel_fi.employee_code
    JOIN public.employee_master sa
      ON upper(btrim(coalesce(sa.employee_code, ''))) = upper(btrim(coalesce(p_sa_employee_code, '')))
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND lower(btrim(coalesce(fi.role, ''))) IN ('floor incharge', 'floor_incharge')
      AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'SERVICE'
      AND nullif(lower(btrim(coalesce(fi.fuel_type, ''))), '') IS NOT NULL
      AND lower(btrim(coalesce(fi.fuel_type, ''))) = lower(btrim(coalesce(sa.fuel_type, '')))
  );
$$;

COMMENT ON FUNCTION public.user_has_service_floor_incharge_scope_for_sa_code(text)
IS 'Returns true when authenticated user is mapped as SERVICE floor incharge and fuel_type matches SA employee scope.';

-- Bodyshop floor-incharge helper (BODY SHOP department only, location scoped)
CREATE OR REPLACE FUNCTION public.user_has_bodyshop_floor_incharge_scope_for_sa_code(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH input_codes AS (
    SELECT
      upper(btrim(coalesce(p_sa_employee_code, ''))) AS code_upper,
      upper(btrim(coalesce(split_part(p_sa_employee_code, '_', 1), ''))) AS code_part1,
      upper(btrim(coalesce(split_part(p_sa_employee_code, '_', 2), ''))) AS code_part2
  ),
  sa_location AS (
    SELECT
      upper(
        btrim(
          coalesce(
            sa.location,
            CASE
              WHEN c.code_upper LIKE '%500A840%' OR c.code_part1 = '500A840' OR c.code_part2 = '500A840' THEN 'Sitapura'
              WHEN c.code_upper LIKE '%3000840%' OR c.code_part1 = '3000840' OR c.code_part2 = '3000840' THEN 'Sitapura'
              WHEN c.code_upper LIKE '%3001440%' OR c.code_part1 = '3001440' OR c.code_part2 = '3001440' THEN 'Ajmer Road'
              ELSE NULL
            END
          )
        )
      ) AS location_upper
    FROM input_codes c
    LEFT JOIN LATERAL (
      SELECT em.location
      FROM public.employee_master em
      WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (c.code_upper, c.code_part1, c.code_part2)
      ORDER BY
        CASE
          WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_upper THEN 1
          WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_part1 THEN 2
          WHEN upper(btrim(coalesce(em.employee_code, ''))) = c.code_part2 THEN 3
          ELSE 9
        END
      LIMIT 1
    ) sa ON true
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.user_employee_links uel_fi
    JOIN public.employee_master fi
      ON fi.employee_code = uel_fi.employee_code
    CROSS JOIN sa_location sal
    WHERE uel_fi.user_id = auth.uid()
      AND uel_fi.is_active = true
      AND lower(btrim(coalesce(fi.role, ''))) IN ('floor incharge', 'floor_incharge')
      AND upper(replace(btrim(coalesce(fi.department, '')), ' ', '')) = 'BODYSHOP'
      AND nullif(upper(btrim(coalesce(fi.location, ''))), '') IS NOT NULL
      AND nullif(sal.location_upper, '') IS NOT NULL
      AND upper(btrim(coalesce(fi.location, ''))) = sal.location_upper
  );
$$;

COMMENT ON FUNCTION public.user_has_bodyshop_floor_incharge_scope_for_sa_code(text)
IS 'Returns true when authenticated user is mapped as BODY SHOP floor incharge and location matches SA employee scope.';

-- Re-point Service floor-incharge reception policy to service helper
DROP POLICY IF EXISTS service_reception_select_floor_incharge ON public.service_reception_entries;

CREATE POLICY service_reception_select_floor_incharge
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('floor_incharge')
    AND sa_employee_code IS NOT NULL
    AND public.user_has_service_floor_incharge_scope_for_sa_code(sa_employee_code)
  )
);

-- Re-point Bodyshop floor reception policy to bodyshop helper
DROP POLICY IF EXISTS service_reception_select_bodyshop_v1 ON public.service_reception_entries;
DROP POLICY IF EXISTS service_reception_select_bodyshop_floor_incharge_v1 ON public.service_reception_entries;

CREATE POLICY service_reception_select_bodyshop_floor_incharge_v1
ON public.service_reception_entries
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR (
    coalesce(service_type, '') = 'Accident'
    AND sa_employee_code IS NOT NULL
    AND (
      public.has_module_view('bodyshop_floor')
      OR public.has_module_modify('bodyshop_floor')
    )
    AND public.user_has_bodyshop_floor_incharge_scope_for_sa_code(sa_employee_code)
  )
);

COMMIT;
