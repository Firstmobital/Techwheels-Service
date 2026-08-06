-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Add parts_order_number column to parts_requests table
--            and update parts_request_spm_update RPC to accept it.
-- Date: 2026-08-06
-- Purpose: Allow SPM to manually enter/edit Order No. when it's not
--          available from the auto-lookup (service_parts_order_data).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the new column (nullable, defaults to NULL)
ALTER TABLE public.parts_requests
  ADD COLUMN IF NOT EXISTS parts_order_number text;

COMMENT ON COLUMN public.parts_requests.parts_order_number IS
  'Manual order number override entered by SPM. When NULL, the UI falls back to auto-lookup from service_parts_order_data (sap_order_number / crm_order_number).';

-- 2. Drop the old function signature so we can recreate with the new parameter
DROP FUNCTION IF EXISTS public.parts_request_spm_update(
  bigint, text, date, text, text, numeric
);

-- 3. Recreate with the new p_parts_order_number parameter
CREATE FUNCTION public.parts_request_spm_update(
  p_id bigint,
  p_parts_number text,
  p_parts_order_date date,
  p_parts_status text,
  p_spm_remarks text,
  p_parts_qty numeric DEFAULT NULL::numeric,
  p_parts_order_number text DEFAULT NULL::text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_status text := btrim(coalesce(p_parts_status, ''));
begin
  if not (public.is_admin() or public.has_module_modify('parts_spm')) then
    raise exception 'Insufficient permissions';
  end if;

  if v_status = '' then
    raise exception 'Parts status is required';
  end if;

  if v_status not in (
    'Pending', 'Ordered', 'Back Order', 'In Transit',
    'Received', 'Partially Received', 'Cancelled', 'Delivered to Workshop',
    'Ready', 'Done'
  ) then
    raise exception 'Invalid parts status: %', v_status;
  end if;

  update public.parts_requests
  set parts_number = nullif(btrim(coalesce(p_parts_number, '')), ''),
      parts_order_date = p_parts_order_date,
      parts_status = v_status,
      spm_remarks = nullif(btrim(coalesce(p_spm_remarks, '')), ''),
      parts_qty = coalesce(p_parts_qty, parts_qty),
      parts_order_number = nullif(btrim(coalesce(p_parts_order_number, '')), ''),
      status_updated_at = now(),
      advisor_seen = false
  where id = p_id;
end;
$$;

-- 4. Grant permissions (same as the original function)
GRANT EXECUTE ON FUNCTION public.parts_request_spm_update(
  bigint, text, date, text, text, numeric, text
) TO anon, authenticated, service_role;
