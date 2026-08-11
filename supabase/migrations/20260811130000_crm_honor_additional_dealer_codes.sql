-- CRM SA visibility: honor JWT Additional Dealer Codes the same way SM/GM does.
-- Precedence: my_effective_dealer_codes() when non-empty, else active CRM mapping dealer codes.
-- Still requires at least one active CRM employee mapping.
--
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260811130000_crm_honor_additional_dealer_codes.sql

CREATE OR REPLACE FUNCTION public.user_is_crm_for_dealer_sa(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH sa_parts AS (
    SELECT
      upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 1))) AS part1,
      upper(btrim(split_part(coalesce(p_sa_employee_code, ''), '_', 2))) AS part2
  ),
  jwt_codes AS (
    SELECT upper(btrim(code)) AS code
    FROM unnest(public.my_effective_dealer_codes()) AS code
    WHERE btrim(coalesce(code, '')) <> ''
  )
  SELECT
    btrim(coalesce(p_sa_employee_code, '')) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'CRM')
    )
    AND (
      (
        (SELECT count(*)::int FROM jwt_codes) > 0
        AND EXISTS (
          SELECT 1
          FROM jwt_codes dc
          CROSS JOIN sa_parts sp
          WHERE dc.code IN (sp.part1, sp.part2)
            AND dc.code <> ''
        )
      )
      OR (
        (SELECT count(*)::int FROM jwt_codes) = 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em ON em.employee_code = uel.employee_code
          CROSS JOIN sa_parts sp
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND public.employee_has_business_role(em.role, 'CRM')
            AND upper(btrim(coalesce(uel.dealer_code, ''))) IN (sp.part1, sp.part2)
            AND upper(btrim(coalesce(uel.dealer_code, ''))) <> ''
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_is_crm_for_dealer_sa(text) IS
  'CRM dealer-scoped SA helper. Requires an active CRM mapping. When my_effective_dealer_codes() is non-empty (JWT Additional Dealer Codes), those take precedence; otherwise falls back to CRM mapping dealer codes. Handles both SA code formats (500A840_131 and EPM_500A840). SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.user_is_crm_for_dealer_sa(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_crm_for_dealer_sa(text) TO service_role;

CREATE OR REPLACE FUNCTION public.user_has_crm_dealer_scope(p_dealer_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH jwt_codes AS (
    SELECT upper(btrim(code)) AS code
    FROM unnest(public.my_effective_dealer_codes()) AS code
    WHERE btrim(coalesce(code, '')) <> ''
  ),
  target AS (
    SELECT upper(btrim(coalesce(p_dealer_code, ''))) AS code
  )
  SELECT
    btrim(coalesce(p_dealer_code, '')) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_employee_links uel
      JOIN public.employee_master em ON em.employee_code = uel.employee_code
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND public.employee_has_business_role(em.role, 'CRM')
    )
    AND (
      (
        (SELECT count(*)::int FROM jwt_codes) > 0
        AND EXISTS (
          SELECT 1
          FROM jwt_codes dc
          CROSS JOIN target t
          WHERE dc.code = t.code
            AND dc.code <> ''
        )
      )
      OR (
        (SELECT count(*)::int FROM jwt_codes) = 0
        AND EXISTS (
          SELECT 1
          FROM public.user_employee_links uel
          JOIN public.employee_master em ON em.employee_code = uel.employee_code
          CROSS JOIN target t
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND public.employee_has_business_role(em.role, 'CRM')
            AND upper(btrim(coalesce(uel.dealer_code, ''))) = t.code
            AND t.code <> ''
        )
      )
    );
$$;

COMMENT ON FUNCTION public.user_has_crm_dealer_scope(text) IS
  'Returns true when authenticated user has an active CRM mapping and the dealer is in scope. JWT Additional Dealer Codes (my_effective_dealer_codes) take precedence when non-empty; otherwise falls back to CRM mapping dealer codes. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.user_has_crm_dealer_scope(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_crm_dealer_scope(text) TO service_role;
