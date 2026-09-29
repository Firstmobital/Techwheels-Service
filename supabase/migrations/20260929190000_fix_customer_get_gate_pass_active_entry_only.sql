-- Fix customer_get_gate_pass showing stale gate pass from a prior service visit.
--
-- Root cause of the regression: when a vehicle has had multiple service entries
-- (e.g. old entry "Test Vinod 3" with gate pass issued, new entry "Test Vinod 4"
-- where work is still ongoing), customer_get_gate_pass was returning the old entry's
-- gate pass payload. This caused customer_get_visit_context to set gate_pass_issued=true
-- for the current visit and render the wrong customer details on the gate pass screen.
--
-- Fix: when p_reg_number is supplied, find the most recent service_reception_entry
-- for that vehicle first.
--   - If the current entry has gate_pass_issued = FALSE → return NULL immediately.
--     The current visit has no gate pass yet; don't fall back to a stale one.
--   - If the current entry has gate_pass_issued = TRUE → find the matching payload
--     by gate_pass_number (anchored lookup), then fall back to created_at-desc only
--     if the anchored lookup misses (e.g. older rows before this fix).
--   - If no service_reception_entry is found for the reg → fall back to the original
--     created_at-desc approach (preserves behaviour for edge cases).

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
  v_sess             record;
  v_reg              text;
  v_regs             text[];
  v_entry_issued     boolean;
  v_gp_no            text;
  v_text             text;
  v_payload          jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);

  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  -- Step 1: check the most recent reception entry for this vehicle.
  -- This tells us whether a gate pass has been issued for the CURRENT visit.
  select e.gate_pass_issued, e.gate_pass_number
  into v_entry_issued, v_gp_no
  from public.service_reception_entries e
  where (
    public.customer_last10_digits(e.owner_phone) = v_sess.phone
    or public.customer_norm_reg(e.reg_number) = any(v_regs)
  )
  and (v_reg is null or public.customer_norm_reg(e.reg_number) = v_reg)
  order by e.created_at desc
  limit 1;

  if found then
    -- A reception entry exists for this vehicle.
    -- If the current entry has NOT issued a gate pass, return null so that
    -- the portal does not display a stale gate pass from a previous visit.
    if not coalesce(v_entry_issued, false) then
      return null;
    end if;

    -- Gate pass issued for current entry — look up the payload by gate pass number.
    -- service_type is stored as 'Gate Pass #<gp_no>' by issue_accounts_mechanical_gatepass.
    if nullif(btrim(coalesce(v_gp_no, '')), '') is not null then
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
  end if;

  -- Step 2: fall back to original created_at-desc approach when:
  --   a) no service_reception_entry found for this vehicle (edge case), or
  --   b) entry has gate_pass_issued=true but the anchored lookup above found nothing
  --      (e.g. historical rows stored before this fix was deployed).
  if v_text is null then
    -- Only fall back if either no entry was found OR entry confirmed gate pass issued.
    -- (If entry found and gate pass NOT issued we already returned null above.)
    if not found or coalesce(v_entry_issued, false) then
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
