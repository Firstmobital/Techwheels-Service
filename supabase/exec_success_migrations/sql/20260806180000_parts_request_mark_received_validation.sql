-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Update parts_request_advisor_mark_received validation logic
-- Date: 2026-08-06
-- Purpose: Enforce conditional "Mark Received" visibility:
--   ✅ Allow if stock = Available (qty >= 5)
--   ✅ Allow if stock = Low Stock (1 <= qty < 5)
--   ✅ Allow if advisor_remarks = 'Received from co-dealer' (even if qty null/0)
--   ❌ Reject if stock = Pending Update (null/0) AND remarks != 'Received from co-dealer'
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

  -- Valid paths to "Mark Received":
  --   1. Normal SPM workflow: status is Ordered / In Transit / Back Order / Partially Received
  --   2. In-stock part (Available badge): Pending + parts_qty >= 5
  --   3. Low stock part: Pending + parts_qty > 0 (1-4)
  --   4. Co-dealer: Pending + advisor_remarks = 'Received from co-dealer'
  v_can_receive :=
    v_status in ('Ordered', 'In Transit', 'Back Order', 'Partially Received')
    or (v_status = 'Pending' and coalesce(v_qty, 0) > 0)
    or (v_status = 'Pending' and coalesce(btrim(v_remarks), '') = 'Received from co-dealer');

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

-- Grant permissions (same as original)
GRANT EXECUTE ON FUNCTION public.parts_request_advisor_mark_received(bigint)
  TO anon, authenticated, service_role;
