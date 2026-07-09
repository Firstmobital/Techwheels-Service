-- Enhancement request (2026-07-09):
-- 1. "Customer Update" column — free-text field advisors use to log the latest
--    communication shared with the customer, independent of internal Advisor Remarks.
-- 2. Allow "Mark Received" from Pending when the part was arranged locally / directly
--    from another vendor (no formal SPM order, so Order No. / Ordered Qty are never
--    populated) — signalled by the advisor typing "PART RECEIVED" into Advisor Remarks.
--    Server-side enforcement mirrors the client-side button gating so the RPC can't be
--    called out of band to skip the check.

alter table public.parts_requests
  add column if not exists customer_update text;

-- Lightweight, dedicated inline-save RPC for Customer Update — mirrors the ownership/
-- Done-lock rules already enforced by parts_request_update_advisor_fields, but avoids
-- re-running that function's registration/reception lookups for a single-field edit.
create or replace function public.parts_request_update_customer_update(p_id bigint, p_customer_update text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_current_status text;
begin
  select advisor_user_id, parts_status into v_owner, v_current_status
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;

  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  if v_current_status = 'Done' and not public.is_admin() then
    raise exception 'This request is marked Done and can no longer be edited';
  end if;

  update public.parts_requests
  set customer_update = nullif(btrim(coalesce(p_customer_update, '')), '')
  where id = p_id;
end;
$function$;

grant execute on function public.parts_request_update_customer_update(bigint, text) to authenticated;

-- Widen parts_request_advisor_mark_received: still valid from the normal Ordered/In
-- Transit/Back Order/Partially Received in-flight states, and NOW also valid straight
-- from Pending when advisor_remarks contains "PART RECEIVED" (case-insensitive) — the
-- locally-arranged / direct-vendor part scenario where no SPM order ever gets placed.
create or replace function public.parts_request_advisor_mark_received(p_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_status text;
  v_remarks text;
  v_direct_receive boolean;
begin
  select advisor_user_id, parts_status, advisor_remarks into v_owner, v_status, v_remarks
  from public.parts_requests where id = p_id;

  if v_owner is null then
    raise exception 'Parts request not found: %', p_id;
  end if;
  if not (v_owner = auth.uid() or public.is_admin()) then
    raise exception 'Insufficient permissions';
  end if;

  v_direct_receive := (v_status = 'Pending' and coalesce(v_remarks, '') ilike '%part received%');

  if v_status not in ('Ordered', 'In Transit', 'Back Order', 'Partially Received') and not v_direct_receive then
    raise exception 'Parts must be Ordered before they can be marked Received (current status: %)', v_status;
  end if;

  update public.parts_requests
  set parts_status = 'Received',
      received_at = now(),
      received_by_name = public._parts_request_caller_name(),
      status_updated_at = now()
  where id = p_id;
end;
$function$;
