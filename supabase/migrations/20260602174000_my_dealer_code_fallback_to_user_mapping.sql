-- Fallback dealer resolution: prefer JWT metadata, then active user mapping.
-- This removes the need to maintain dealer_code in two places for RLS.

CREATE OR REPLACE FUNCTION public.my_dealer_code() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'auth', 'public'
    AS $$
    SELECT COALESCE(
        NULLIF(auth.jwt() -> 'user_metadata' ->> 'dealer_code', ''),
        NULLIF(auth.jwt() -> 'app_metadata'  ->> 'dealer_code', ''),
        (
          SELECT uel.dealer_code
          FROM public.user_employee_links AS uel
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
            AND uel.is_primary = true
          ORDER BY uel.updated_at DESC, uel.id DESC
          LIMIT 1
        ),
        (
          SELECT uel.dealer_code
          FROM public.user_employee_links AS uel
          WHERE uel.user_id = auth.uid()
            AND uel.is_active = true
          ORDER BY uel.is_primary DESC, uel.updated_at DESC, uel.id DESC
          LIMIT 1
        )
    )
$$;

COMMENT ON FUNCTION public.my_dealer_code() IS
'Returns dealer_code from JWT metadata; falls back to active user_employee_links mapping when metadata is missing.';
