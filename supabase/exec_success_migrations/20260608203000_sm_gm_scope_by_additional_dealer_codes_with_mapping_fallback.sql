-- 2026-06-08
-- Purpose: Refine SM/GM service advisor visibility precedence.
-- Rule:
-- 1) If JWT dealer_codes array is present and non-empty, SM/GM see rows only for those dealer codes.
-- 2) If JWT dealer_codes is empty/missing, SM/GM fall back to mapped dealer_code rows only.
-- Existing policy names are preserved (no new policy family).

BEGIN;

DROP POLICY IF EXISTS service_reception_select_crm_dealer_scope ON public.service_reception_entries;

CREATE POLICY service_reception_select_crm_dealer_scope ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('service_advisor'::text)
    AND sa_employee_code IS NOT NULL
    AND (
      public.user_is_crm_for_dealer_sa(sa_employee_code)
      OR (
        (
          jsonb_array_length(
            CASE
              WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
              WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
              ELSE '[]'::jsonb
            END
          ) > 0
          AND EXISTS (
            SELECT 1
            FROM public.user_employee_links uel
            JOIN public.employee_master em
              ON em.employee_code = uel.employee_code
            WHERE uel.user_id = auth.uid()
              AND uel.is_active = true
              AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
          )
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE
                WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
                WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
                ELSE '[]'::jsonb
              END
            ) AS dc(code)
            WHERE upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
               OR upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
          )
        )
        OR
        (
          jsonb_array_length(
            CASE
              WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
              WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
              ELSE '[]'::jsonb
            END
          ) = 0
          AND EXISTS (
            SELECT 1
            FROM public.user_employee_links uel
            JOIN public.employee_master em
              ON em.employee_code = uel.employee_code
            WHERE uel.user_id = auth.uid()
              AND uel.is_active = true
              AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
              AND (
                upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
                OR upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
              )
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS service_reception_update_sa ON public.service_reception_entries;

CREATE POLICY service_reception_update_sa ON public.service_reception_entries
FOR UPDATE TO authenticated
USING (
  public.has_module_modify('service_advisor'::text)
  AND sa_employee_code IS NOT NULL
  AND (
    public.user_has_employee_code(sa_employee_code)
    OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    OR (
      (
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
            WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
            ELSE '[]'::jsonb
          END
        ) > 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
        )
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
              WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
              ELSE '[]'::jsonb
            END
          ) AS dc(code)
          WHERE upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
             OR upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
        )
      )
      OR
      (
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
            WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
            ELSE '[]'::jsonb
          END
        ) = 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
            AND (
              upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
              OR upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
            )
        )
      )
    )
  )
)
WITH CHECK (
  public.has_module_modify('service_advisor'::text)
  AND sa_employee_code IS NOT NULL
  AND (
    public.user_has_employee_code(sa_employee_code)
    OR public.user_is_crm_for_dealer_sa(sa_employee_code)
    OR (
      (
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
            WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
            ELSE '[]'::jsonb
          END
        ) > 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
        )
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
              WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
              ELSE '[]'::jsonb
            END
          ) AS dc(code)
          WHERE upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
             OR upper(btrim(coalesce(dc.code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
        )
      )
      OR
      (
        jsonb_array_length(
          CASE
            WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
            WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array' THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
            ELSE '[]'::jsonb
          END
        ) = 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em
            ON em.employee_code = uel.employee_code
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND lower(btrim(coalesce(em.role, ''))) = ANY (ARRAY['sm', 'gm'])
            AND (
              upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 1)))
              OR upper(btrim(coalesce(uel.dealer_code, ''))) = upper(btrim(split_part(coalesce(sa_employee_code, ''), '_', 2)))
            )
        )
      )
    )
  )
);

COMMIT;
