-- Fix: statement timeout (57014) when Service Advisor saves job card rows.
--
-- ROOT CAUSE (confirmed via postgres_logs + pg_stat_statements)
-- 1. updateServiceAdvisorEntry() used direct PostgREST UPDATE on
--    service_reception_entries as authenticated — expensive RLS (~1–4s).
-- 2. UPDATE OF jc_number fires sync_reception_jc_to_legacy_technician_assignments,
--    which UPDATEs technician_assignments as the SA user (not SECURITY DEFINER).
--    That hits has_module_modify('floor_incharge') RLS and adds more latency.
-- 3. Combined work exceeds Supabase statement_timeout (~8s).
--
-- FIX
-- A) SECURITY DEFINER RPC for SA save (mirrors bodyshop_save_reception_jc_km pattern).
-- B) Make sync_reception_jc_to_legacy_technician_assignments SECURITY DEFINER so
--    legacy RECEPTION-{id} → real JC sync bypasses technician_assignments RLS.

CREATE OR REPLACE FUNCTION public.service_advisor_save_reception_entry(
  p_reception_entry_id bigint,
  p_service_type       text,
  p_jc_number          text    DEFAULT NULL,
  p_km_reading         integer DEFAULT NULL,
  p_remark             text    DEFAULT NULL
)
RETURNS SETOF public.service_reception_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sa_employee_code text;
  v_is_admin         boolean;
  v_has_sa_modify    boolean;
  v_service_type     text;
BEGIN
  v_service_type := btrim(coalesce(p_service_type, ''));
  IF v_service_type = '' THEN
    RAISE EXCEPTION 'service_type is required'
      USING ERRCODE = '22023';
  END IF;

  v_is_admin      := public.is_admin();
  v_has_sa_modify := public.has_module_modify('service_advisor');

  IF NOT (v_is_admin OR v_has_sa_modify) THEN
    RAISE EXCEPTION 'permission denied: requires service_advisor modify or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT sre.sa_employee_code
    INTO v_sa_employee_code
    FROM public.service_reception_entries sre
   WHERE sre.id = p_reception_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reception entry % not found', p_reception_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_admin THEN
    IF v_sa_employee_code IS NULL
       OR NOT public.user_has_employee_code(v_sa_employee_code)
    THEN
      RAISE EXCEPTION 'permission denied: caller is not the SA on this reception entry'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.service_reception_entries sre
     SET service_type = v_service_type,
         jc_number    = NULLIF(upper(btrim(coalesce(p_jc_number, ''))), ''),
         km_reading   = p_km_reading,
         remark       = NULLIF(btrim(coalesce(p_remark, '')), ''),
         updated_at   = now()
   WHERE sre.id = p_reception_entry_id
   RETURNING sre.*;
END;
$$;

COMMENT ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text
)
IS 'SECURITY DEFINER RPC: updates service_type, jc_number, km_reading, and remark '
   'on a single service_reception_entries row. Bypasses expensive authenticated-role '
   'RLS (57014 on direct PostgREST UPDATE) while enforcing the same authorization '
   'rules as service_reception_update_sa and enforce_service_reception_sa_update.';

GRANT EXECUTE ON FUNCTION public.service_advisor_save_reception_entry(
  bigint, text, text, integer, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_reception_jc_to_legacy_technician_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_jc text;
BEGIN
  new_jc := upper(btrim(coalesce(NEW.jc_number, '')));
  IF new_jc = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.technician_assignments
     SET job_card_number = new_jc,
         updated_at = now()
   WHERE upper(btrim(job_card_number)) = ('RECEPTION-' || NEW.id::text);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_reception_jc_to_legacy_technician_assignments()
IS 'Syncs legacy RECEPTION-{reception_id} technician_assignments rows to the real '
   'JC number when reception jc_number is set. SECURITY DEFINER: internal sync must '
   'not run under SA RLS on technician_assignments (57014 on SA save).';
