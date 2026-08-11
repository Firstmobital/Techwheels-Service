-- Reception / dealer_code_in_scope uses my_effective_dealer_codes().
-- Previous behavior: non-empty JWT dealer_codes REPLACED mappings entirely, and
-- ignored scalar JWT dealer_code plus string-typed dealer_codes values.
--
-- New behavior: UNION of
--   1) JWT user_metadata/app_metadata.dealer_codes (array or delimited string)
--   2) JWT scalar dealer_code
--   3) active user_employee_links.dealer_code
-- so Additional Dealer Codes + mappings both expand EV/PV visibility.
--
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260811131500_effective_dealer_codes_union_jwt_and_mappings.sql

CREATE OR REPLACE FUNCTION public.my_effective_dealer_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'auth', 'public'
AS $$
  WITH jwt AS (
    SELECT auth.jwt() AS token
  ),
  jwt_array_codes AS (
    SELECT DISTINCT upper(btrim(value)) AS code
    FROM jwt
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(token -> 'user_metadata' -> 'dealer_codes') = 'array'
          THEN token -> 'user_metadata' -> 'dealer_codes'
        WHEN jsonb_typeof(token -> 'app_metadata' -> 'dealer_codes') = 'array'
          THEN token -> 'app_metadata' -> 'dealer_codes'
        ELSE '[]'::jsonb
      END
    ) AS t(value)
    WHERE btrim(value) <> ''
  ),
  jwt_string_codes AS (
    SELECT DISTINCT upper(btrim(part)) AS code
    FROM jwt
    CROSS JOIN LATERAL regexp_split_to_table(
      COALESCE(
        CASE
          WHEN jsonb_typeof(token -> 'user_metadata' -> 'dealer_codes') = 'string'
            THEN token -> 'user_metadata' ->> 'dealer_codes'
          WHEN jsonb_typeof(token -> 'app_metadata' -> 'dealer_codes') = 'string'
            THEN token -> 'app_metadata' ->> 'dealer_codes'
          ELSE NULL
        END,
        ''
      ),
      '[[:space:],]+'
    ) AS part
    WHERE btrim(part) <> ''
      AND btrim(part) NOT IN ('[', ']', '[]')
  ),
  jwt_primary AS (
    SELECT DISTINCT upper(btrim(code)) AS code
    FROM (
      SELECT NULLIF(token -> 'user_metadata' ->> 'dealer_code', '') AS code FROM jwt
      UNION ALL
      SELECT NULLIF(token -> 'app_metadata' ->> 'dealer_code', '') AS code FROM jwt
    ) primary_codes
    WHERE btrim(coalesce(code, '')) <> ''
  ),
  mapped_codes AS (
    SELECT DISTINCT upper(btrim(coalesce(uel.dealer_code, ''))) AS code
    FROM public.user_employee_links uel
    WHERE uel.user_id = auth.uid()
      AND uel.is_active = true
      AND btrim(coalesce(uel.dealer_code, '')) <> ''
  ),
  all_codes AS (
    SELECT code FROM jwt_array_codes
    UNION
    SELECT code FROM jwt_string_codes
    UNION
    SELECT code FROM jwt_primary
    UNION
    SELECT code FROM mapped_codes
  )
  SELECT COALESCE(
    ARRAY(SELECT code FROM all_codes WHERE code <> '' ORDER BY 1),
    ARRAY[]::text[]
  );
$$;

COMMENT ON FUNCTION public.my_effective_dealer_codes() IS
  'Canonical dealer scope list: UNION of JWT dealer_codes (array or string), JWT dealer_code, and active mapping dealer codes.';

GRANT EXECUTE ON FUNCTION public.my_effective_dealer_codes() TO anon;
GRANT EXECUTE ON FUNCTION public.my_effective_dealer_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_effective_dealer_codes() TO service_role;
