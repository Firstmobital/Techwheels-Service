-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Fix parts_request_advisor_mark_received — remove status bypass
-- Date: 2026-08-06
-- Bug: Previous version allowed Mark Received for ANY row with status in
--      ('Ordered','In Transit','Back Order','Partially Received') regardless
--      of stock — bypassing the stock/remark gate entirely.
-- Fix: Strictly enforce ONLY 2 rules, for ALL non-terminal statuses:
--   1. Stock = Available or Low Stock (parts_qty > 0)
--   2. Advisor Remark = 'Received from co-dealer' (even if stock is Pending)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.parts_request_advisor_mark_received(bigint);

CREATE FUNCTION public.parts_request_advisor_mark_received(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_owner    uuid;
  v_status   text;
  v_remarks  text;
  v_qty      numeric;
  v_can_receive boolean;
begin
  select advisor_user_id, parts_status, advisor_remarks, parts_qty
    into v_owner, v_status, v_remarks, v_qty
  from public.parts_requests
  where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  -- Block if already in a terminal/advanced status
  if v_status in ('Received', 'Ready', 'Done', 'Delivered to Workshop', 'Cancelled') then
    raise exception 'Cannot mark Received: current status is already %', v_status;
  end if;

  -- Strictly 2 rules, regardless of parts_status (Pending / Ordered / In Transit / Back Order / Partially Received):
  --   1. Stock = Available or Low Stock (parts_qty > 0)
  --   2. Advisor Remark = 'Received from co-dealer' (even if stock is Pending Update)
  v_can_receive :=
    coalesce(v_qty, 0) > 0
    or coalesce(btrim(v_remarks), '') = 'Received from co-dealer';

  if not v_can_receive then
    raise exception
      'Cannot mark Received: stock is Pending Update and advisor remark is not "Received from co-dealer" (current status: %)',
      v_status;
  end if;

  update public.parts_requests
  set parts_status      = 'Received',
      received_at       = now(),
      received_by_name  = public._parts_request_caller_name(),
      status_updated_at = now()
  where id = p_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.parts_request_advisor_mark_received(bigint)
  TO anon, authenticated, service_role;
