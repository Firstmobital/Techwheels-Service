-- MOBILE-011: bodyshop customer-portal parity RPCs (settlement, booking, repair card, KM).
-- Still SECURITY DEFINER, session-phone scoped. Does not GRANT workshop tables to anon.
-- Does not mint QR tokens. Run in SQL editor if db push is blocked.

begin;

create or replace function public.customer_submit_complaint(p_session_token text, p_reg_number text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_id bigint;
  v_text text;
  v_km numeric;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  v_text := nullif(btrim(coalesce(p_payload->>'text', p_payload->>'feedback_text', '')), '');
  if v_text is null and jsonb_typeof(p_payload->'problems') = 'array' then
    select string_agg('Point ' || ord::text || ': ' || btrim(elem), E'\n')
    into v_text
    from jsonb_array_elements_text(p_payload->'problems') with ordinality as t(elem, ord)
    where btrim(elem) <> '';
    if coalesce(btrim(p_payload->>'notes'), '') <> '' then
      v_text := trim(both E'\n' from coalesce(v_text, '') || E'\nAdditional Notes: ' || btrim(p_payload->>'notes'));
    end if;
  end if;

  begin
    v_km := nullif(p_payload->>'current_km', '')::numeric;
  exception when others then
    v_km := null;
  end;
  if v_km is not null and v_km > 0 then
    v_text := trim(both E'\n' from 'KM: ' || trim(to_char(v_km, 'FM999999990')) || E'\n' || coalesce(v_text, ''));
  end if;

  if v_text is null or btrim(v_text) = '' then
    raise exception 'Complaint text is required.';
  end if;

  insert into public.post_feedback_bot_data (
    vehicle_registration_number,
    customer_name,
    mobile_number,
    rating,
    feedback_text,
    service_type,
    service_advisor_name,
    branch,
    model,
    mode,
    complaint_date_time
  ) values (
    v_reg,
    nullif(btrim(coalesce(p_payload->>'owner_name', '')), ''),
    v_sess.phone,
    null,
    v_text,
    coalesce(nullif(btrim(p_payload->>'service_type'), ''), 'Customer Reported Issues'),
    nullif(btrim(coalesce(p_payload->>'sa_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'model', '')), ''),
    'customer_portal_concern',
    now()::text
  )
  returning id into v_id;

  if v_km is not null and v_km > 0 then
    update public.service_reception_entries s
    set km_reading = v_km
    where public.customer_norm_reg(s.reg_number) = v_reg
      and s.invoice_done_at is null;
  end if;

  return jsonb_build_object('id', v_id, 'mode', 'customer_portal_concern');
end;
$$;

create or replace function public.customer_get_settlement(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_text text;
  v_payload jsonb;
  v_row jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select b.feedback_text
  into v_text
  from public.post_feedback_bot_data b
  where b.mode = 'customer_payment_payload'
    and (
      public.customer_last10_digits(b.mobile_number) = v_sess.phone
      or public.customer_norm_reg(b.vehicle_registration_number) = any(v_regs)
    )
    and (v_reg is null or public.customer_norm_reg(b.vehicle_registration_number) = v_reg)
  order by b.created_at desc
  limit 1;

  if v_text is not null then
    begin
      v_payload := v_text::jsonb;
    exception when others then
      v_payload := null;
    end;
    if v_payload is not null and (
      v_payload ? 'total_billed' or v_payload ? 'billed_amount' or v_payload ? 'amount_received'
    ) then
      return v_payload || jsonb_build_object('source', 'customer_payment_payload');
    end if;
  end if;

  if to_regclass('public.accounts_mechanical_invoices') is not null then
    execute
      $q$
      select jsonb_build_object(
        'source', 'accounts_mechanical_invoices',
        'reg_number', s.reg_number,
        'jc_number', coalesce(inv.jc_number, s.jc_number),
        'invoice_no', inv.invoice_number,
        'invoice_date', inv.invoice_date,
        'total_billed', inv.billed_amount,
        'billed_amount', inv.billed_amount,
        'amount_received', inv.amount_received,
        'remaining_amount', public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received),
        'status', inv.payment_status,
        'updated_at', inv.updated_at
      )
      from public.accounts_mechanical_invoices inv
      join public.service_reception_entries s on s.id = inv.reception_entry_id
      where public.customer_norm_reg(s.reg_number) = any($1)
        and ($2::text is null or public.customer_norm_reg(s.reg_number) = $2)
        and inv.billed_amount is not null
      order by inv.updated_at desc nulls last
      limit 1
      $q$
    into v_row
    using v_regs, v_reg;
    if v_row is not null then
      return v_row;
    end if;
  end if;

  select jsonb_build_object(
    'source', 'reception_expected',
    'reg_number', s.reg_number,
    'jc_number', s.jc_number,
    'total_billed', s.expected_invoice_amount,
    'billed_amount', s.expected_invoice_amount,
    'amount_received', null,
    'remaining_amount', null,
    'status', case when s.invoice_done_at is null then 'pending' else 'invoiced' end,
    'invoice_drive_url', s.invoice_drive_url,
    'updated_at', coalesce(s.invoice_done_at, s.created_at)
  )
  into v_row
  from public.service_reception_entries s
  where public.customer_norm_reg(s.reg_number) = any(v_regs)
    and (v_reg is null or public.customer_norm_reg(s.reg_number) = v_reg)
    and s.expected_invoice_amount is not null
    and s.expected_invoice_amount > 0
  order by (s.invoice_done_at is null) desc, s.created_at desc
  limit 1;

  return v_row;
end;
$$;

create or replace function public.customer_submit_booking(p_session_token text, p_reg_number text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_id bigint;
  v_type text;
  v_date text;
  v_pickup boolean;
  v_address text;
  v_remarks text;
  v_text text;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  v_type := nullif(btrim(coalesce(p_payload->>'service_type', '')), '');
  v_date := nullif(btrim(coalesce(p_payload->>'preferred_date', '')), '');
  v_pickup := coalesce((p_payload->>'pickup_required')::boolean, false);
  v_address := nullif(btrim(coalesce(p_payload->>'address', '')), '');
  v_remarks := nullif(btrim(coalesce(p_payload->>'remarks', '')), '');

  if v_type is null then
    raise exception 'Service type is required.';
  end if;
  if v_date is null then
    raise exception 'Preferred date is required.';
  end if;
  if v_pickup and v_address is null then
    raise exception 'Pickup address is required.';
  end if;

  v_text :=
    'Service booking request' || E'\n'
    || 'Type: ' || v_type || E'\n'
    || 'Preferred date: ' || v_date || E'\n'
    || 'Pickup: ' || case when v_pickup then 'Yes' else 'No' end
    || case when v_pickup then E'\nAddress: ' || v_address else '' end
    || case when v_remarks is not null then E'\nInstructions: ' || v_remarks else '' end;

  insert into public.post_feedback_bot_data (
    vehicle_registration_number,
    customer_name,
    mobile_number,
    rating,
    feedback_text,
    service_type,
    service_advisor_name,
    branch,
    model,
    mode,
    complaint_date_time
  ) values (
    v_reg,
    nullif(btrim(coalesce(p_payload->>'owner_name', '')), ''),
    v_sess.phone,
    null,
    v_text,
    v_type,
    nullif(btrim(coalesce(p_payload->>'sa_name', '')), ''),
    nullif(btrim(coalesce(p_payload->>'branch', '')), ''),
    nullif(btrim(coalesce(p_payload->>'model', '')), ''),
    'customer_booking_portal',
    now()::text
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'mode', 'customer_booking_portal');
end;
$$;

create or replace function public.customer_get_repair_card(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_row jsonb;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select jsonb_build_object(
    'id', b.id,
    'reg_number', b.reg_number,
    'job_card_no', b.job_card_no,
    'customer_name', b.customer_name,
    'sa_name', b.sa_name,
    'branch', b.branch,
    'overall_status', b.overall_status,
    'current_stage', b.current_stage,
    'current_stage_name', b.current_stage_name,
    'insurance_company', b.insurance_company,
    'claim_intimation_no', b.claim_intimation_no,
    'surveyor_name', b.surveyor_name,
    'estimated_amount', b.estimated_amount,
    'qc_status', b.qc_status,
    'delivered_at', b.delivered_at
  )
  into v_row
  from public.bodyshop_repair_cards b
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and (v_reg is null or public.customer_norm_reg(b.reg_number) = v_reg)
  order by b.created_at desc
  limit 1;

  return v_row;
end;
$$;

revoke all on function public.customer_get_settlement(text, text) from public;
revoke all on function public.customer_submit_booking(text, text, jsonb) from public;
revoke all on function public.customer_get_repair_card(text, text) from public;
revoke all on function public.customer_submit_complaint(text, text, jsonb) from public;

grant execute on function public.customer_get_settlement(text, text) to anon;
grant execute on function public.customer_submit_booking(text, text, jsonb) to anon;
grant execute on function public.customer_get_repair_card(text, text) to anon;
grant execute on function public.customer_submit_complaint(text, text, jsonb) to anon;

commit;
