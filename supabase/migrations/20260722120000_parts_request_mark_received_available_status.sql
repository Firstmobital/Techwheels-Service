-- Fix: parts_request_advisor_mark_received must allow transition from Pending
-- when parts_qty > 0 (the "Available" badge scenario — part is in stock and
-- can be issued directly without placing an SPM order).
--
-- This mirrors the frontend isAvailableBadge() check added on 2026-07-22:
--   isAvailableBadge = parts_status === 'Pending' && parts_qty > 0
--
-- Previously the function only had TWO valid paths to Mark Received:
--   1. Status in (Ordered, In Transit, Back Order, Partially Received)
--   2. Status = Pending AND advisor_remarks ilike '%part received%'
--
-- The new THIRD path:
--   3. Status = Pending AND parts_qty > 0  (stock already available, no order needed)
--
-- Remarks check is also widened to match frontend: requires '%part%' AND '%received%'
-- separately (handles "part received", "parts received", "received the parts", etc.)

create or replace function public.parts_request_advisor_mark_received(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Three valid paths to "Mark Received":
  --   1. Normal SPM workflow: status is Ordered / In Transit / Back Order / Partially Received
  --   2. Direct-vendor / locally-arranged: Pending + advisor wrote "part...received" in remarks
  --   3. In-stock part (Available badge): Pending + parts_qty > 0
  v_can_receive :=
    v_status in ('Ordered', 'In Transit', 'Back Order', 'Partially Received')
    or (v_status = 'Pending' and coalesce(v_remarks, '') ilike '%part%received%')
    or (v_status = 'Pending' and coalesce(v_qty, 0) > 0);

  if not v_can_receive then
    raise exception
      'Parts must be Ordered (or in-stock / locally received) before marking Received (current status: %)',
      v_status;
  end if;

  update public.parts_requests
  set parts_status      = 'Received',
      received_at       = now(),
      received_by_name  = public._parts_request_caller_name(),
      status_updated_at = now()
  where id = p_id;
end;
$function$;

grant execute on function public.parts_request_advisor_mark_received(bigint) to authenticated;
