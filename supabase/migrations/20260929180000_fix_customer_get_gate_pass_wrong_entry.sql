-- Fix customer_get_gate_pass returning gate pass from the wrong service entry.
--
-- Root cause: the old implementation picked the most recently CREATED row in
-- post_feedback_bot_data for the vehicle, but issue_accounts_mechanical_gatepass
-- UPDATES an existing row (keeping its original created_at) when re-issuing a gate
-- pass for the same vehicle. When a vehicle has had multiple service entries (e.g.
-- an old mechanical entry "Test Vinod 3" and a new entry "Test Vinod 4"), the row
-- for the old entry might have a newer created_at than the new entry's row, causing
-- the wrong customer details to appear on the customer portal gate pass screen.
--
-- Fix: first look up the gate_pass_number stored on the most recent reception entry
-- (service_reception_entries.gate_pass_number), then fetch the matching
-- post_feedback_bot_data row by service_type = 'Gate Pass #<gp_no>'.
-- Fall back to the original created_at-desc approach only if that lookup finds nothing.

CREATE OR REPLACE FUNCTION public.customer_get_gate_pass(
  p_session_token text,
  p_reg_number    text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_sess    record;
  v_reg     text;
  v_regs    text[];
  v_gp_no   text;
  v_text    text;
  v_payload jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  -- Step 1: find the gate pass number from the most recent reception entry that has
  -- one issued — this anchors the lookup to the current visit, not a past visit.
  select e.gate_pass_number into v_gp_no
  from public.service_reception_entries e
  where e.gate_pass_issued = true
    and nullif(btrim(coalesce(e.gate_pass_number, '')), '') is not null
    and (
      public.customer_last10_digits(e.owner_phone) = v_sess.phone
      or public.customer_norm_reg(e.reg_number) = any(v_regs)
    )
    and (v_reg is null or public.customer_norm_reg(e.reg_number) = v_reg)
  order by e.created_at desc
  limit 1;

  -- Step 2: fetch the matching post_feedback_bot_data row using the gate pass number.
  -- service_type is stored as 'Gate Pass #<gp_no>' by issue_accounts_mechanical_gatepass.
  if v_gp_no is not null then
    select b.feedback_text into v_text
    from public.post_feedback_bot_data b
    where b.mode = 'customer_gatepass_payload'
      and b.service_type = 'Gate Pass #' || v_gp_no
      and (
        public.customer_last10_digits(b.mobile_number) = v_sess.phone
        or public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
      )
      and (v_reg is null or public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
    order by b.created_at desc
    limit 1;
  end if;

  -- Step 3: fall back to the original most-recent-created_at approach if the
  -- targeted lookup above returned nothing (e.g. bodyshop gate passes that may
  -- use a different service_type format, or historical rows before this migration).
  if v_text is null then
    select b.feedback_text into v_text
    from public.post_feedback_bot_data b
    where b.mode = 'customer_gatepass_payload'
      and (
        public.customer_last10_digits(b.mobile_number) = v_sess.phone
        or public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
      )
      and (v_reg is null or public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
    order by b.created_at desc
    limit 1;
  end if;

  if v_text is not null then
    begin
      v_payload := v_text::jsonb;
    exception when others then
      v_payload := null;
    end;
    if v_payload is not null
      and nullif(btrim(coalesce(v_payload->>'gate_pass_no', '')), '') is not null
    then
      return v_payload;
    end if;
  end if;

  return null;
end;
$$;
