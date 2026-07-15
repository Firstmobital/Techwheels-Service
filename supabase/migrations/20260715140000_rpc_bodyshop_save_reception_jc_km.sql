-- Fix: statement timeout (57014) on bodyshop "Save Receiving" for jc_number / km_reading.
--
-- ROOT CAUSE (confirmed via pg_stat_statements)
-- The RLS policies on service_reception_entries — particularly
-- service_reception_select_crm_dealer_scope — contain three separate inline
-- EXISTS subqueries joining user_employee_links + employee_master written
-- directly in the USING clause (not wrapped in STABLE/SECURITY DEFINER
-- functions). PostgreSQL cannot cache inline subqueries the same way it
-- caches STABLE functions, so they execute per-row on every query touching
-- this table as the authenticated role. Even a single-row UPDATE by PK incurs
-- 1-4 s of RLS overhead as authenticated, routinely hitting the 8 s
-- statement_timeout.
--
-- FIX
-- Create a SECURITY DEFINER RPC that runs as postgres (bypasses RLS),
-- does its own lightweight authorization check, updates the two fields,
-- and returns the updated row. The frontend calls this instead of the
-- direct table UPDATE.
--
-- AUTHORIZATION LOGIC (mirrors service_reception_update_sa policy):
--   Caller must have module_modify('service_advisor') OR is_admin()
--   AND the reception entry's sa_employee_code must match the caller's
--   employee code (user_has_employee_code) OR the caller is admin.

CREATE OR REPLACE FUNCTION public.bodyshop_save_reception_jc_km(
  p_reception_entry_id bigint,
  p_jc_number          text    DEFAULT NULL,
  p_km_reading         integer DEFAULT NULL
)
RETURNS TABLE (
  id          bigint,
  jc_number   text,
  km_reading  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_caller_code      text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
BEGIN
  -- ── 1. Authorisation ────────────────────────────────────────────────────
  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  -- Fetch the SA employee code on the target row (runs as postgres, no RLS).
  SELECT sre.sa_employee_code
    INTO v_sa_employee_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Non-admins must be the SA on this row.
  IF NOT v_is_admin THEN
    v_caller_code := public.my_employee_code();
    IF upper(btrim(coalesce(v_caller_code, ''))) <>
       upper(btrim(coalesce(v_sa_employee_code, '')))
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── 2. Build and execute the UPDATE ─────────────────────────────────────
  -- Only update fields that were explicitly passed (non-NULL means "set it").
  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET jc_number  = COALESCE(p_jc_number,  sre.jc_number),
         km_reading = COALESCE(p_km_reading, sre.km_reading),
         updated_at = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.id, sre.jc_number, sre.km_reading;
END;
$$;

COMMENT ON FUNCTION public.bodyshop_save_reception_jc_km(bigint, text, integer)
IS 'SECURITY DEFINER RPC: updates jc_number and/or km_reading on a single '
   'service_reception_entries row. Bypasses expensive authenticated-role RLS '
   'policies (which cause statement_timeout) while enforcing the same '
   'authorization rules as the service_reception_update_sa policy. '
   'Caller must have module_modify(service_advisor) or be admin, and must be '
   'the SA on the row (or admin).';

-- Grant execute to authenticated users (anon cannot call this).
GRANT EXECUTE ON FUNCTION public.bodyshop_save_reception_jc_km(bigint, text, integer)
  TO authenticated;
