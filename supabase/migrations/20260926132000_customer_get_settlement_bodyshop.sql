-- Customer Payments must read the Accounts desk bodyshop settlement,
-- not only mechanical invoices.

begin;

create or replace function public.customer_get_settlement(p_session_token text, p_reg_number text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to public, extensions
set row_security = off
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

  -- 1. Bodyshop Accounts desk bill (bodyshop_settlements).
  select jsonb_build_object(
    'source', 'bodyshop_settlements',
    'is_bodyshop', true,
    'is_insurance_claim',
      coalesce(s.do_amount, 0) > 0
      or nullif(btrim(coalesce(b.insurance_company, '')), '') is not null
      or nullif(btrim(coalesce(b.claim_intimation_no, '')), '') is not null,
    'repair_card_id', b.id,
    'reception_entry_id', b.reception_entry_id,
    'reg_number', b.reg_number,
    'jc_number', coalesce(s.job_card_no, b.job_card_no),
    'owner_name', b.customer_name,
    'branch', b.branch,
    'service_type', 'Accidental / Bodyshop Repair',
    'insurance_company', nullif(btrim(coalesce(b.insurance_company, s.invoice_account, '')), ''),
    'insurance_policy_no', b.insurance_policy_no,
    'claim_intimation_no', b.claim_intimation_no,
    'invoice_no', s.invoice_number,
    'invoice_date', s.invoice_date,
    'total_billed', coalesce(s.invoice_amount, 0),
    'billed_amount', coalesce(s.invoice_amount, 0),
    'do_amount', coalesce(s.do_amount, 0),
    'do_remaining', coalesce(s.insurance_due_amount, 0),
    'customer_diff_amount', coalesce(s.customer_diff_amount, 0),
    'customer_posted_amount', coalesce(s.customer_posted_amount, 0),
    'customer_remaining_amount', coalesce(s.customer_remaining_amount, 0),
    'customer_settlement_kind', s.customer_settlement_kind,
    'outstanding_amount', coalesce(s.outstanding_amount, 0),
    'amount_received', coalesce(s.customer_posted_amount, 0),
    'remaining_amount', coalesce(s.customer_remaining_amount, 0),
    'remaining_due', coalesce(s.customer_remaining_amount, 0),
    'status', coalesce(s.derived_payment_status, s.customer_payment_status, 'pending'),
    'do_payment_status', s.do_payment_status,
    'customer_payment_status', s.customer_payment_status,
    'updated_at', coalesce(s.updated_at, s.created_at),
    'payments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'amount', l.amount,
          'payment_mode', coalesce(nullif(btrim(l.payment_mode), ''), 'Accounts Cleared'),
          'reference', l.reference,
          'posted_at', coalesce(l.created_at, l.txn_date::timestamptz),
          'payment_received_date', to_char(l.txn_date, 'DD Mon YYYY'),
          'voucher_no', l.voucher_no
        )
        order by l.txn_date desc nulls last, l.id desc
      )
      from public.bodyshop_settlement_lines l
      where l.repair_card_id = b.id
        and l.party = 'customer'
        and coalesce(l.is_reversed, false) = false
        and l.line_type = 'receipt'
    ), '[]'::jsonb)
  )
  into v_row
  from public.bodyshop_settlements s
  join public.bodyshop_repair_cards b on b.id = s.repair_card_id
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and (v_reg is null or public.customer_norm_reg(b.reg_number) = v_reg)
    and (
      s.invoice_amount is not null
      or nullif(btrim(coalesce(s.invoice_number, '')), '') is not null
    )
  order by coalesce(s.updated_at, s.created_at) desc nulls last
  limit 1;

  if v_row is not null then
    return v_row;
  end if;

  -- 2. Explicit payload pushed by accounts, when it actually has a bill.
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
    if v_payload is not null
      and coalesce((v_payload->>'total_billed')::numeric, (v_payload->>'billed_amount')::numeric, 0) > 0
    then
      return v_payload || jsonb_build_object('source', 'customer_payment_payload');
    end if;
  end if;

  -- 3. Mechanical invoices.
  if to_regclass('public.accounts_mechanical_invoices') is not null then
    execute
      $q$
      select jsonb_build_object(
        'source',              'accounts_mechanical_invoices',
        'is_bodyshop',         false,
        'reception_entry_id',  s.id,
        'reg_number',          s.reg_number,
        'jc_number',           coalesce(inv.jc_number, s.jc_number),
        'owner_name',          s.owner_name,
        'branch',              s.branch,
        'service_type',        s.service_type,
        'invoice_no',          inv.invoice_number,
        'invoice_date',        inv.invoice_date,
        'total_billed',        inv.billed_amount,
        'billed_amount',       inv.billed_amount,
        'amount_received',     coalesce(inv.amount_received, 0),
        'remaining_amount',    public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received),
        'remaining_due',       public.accounts_mechanical_remaining_amount(inv.billed_amount, inv.amount_received),
        'status',              inv.payment_status,
        'keep_on_credit',      coalesce(inv.keep_on_credit, false),
        'keep_on_credit_reason', inv.keep_on_credit_reason,
        'invoice_drive_url',   s.invoice_drive_url,
        'invoice_storage_path', s.invoice_storage_path,
        'updated_at',          coalesce(inv.updated_at, inv.captured_at, s.created_at),
        'payments',            coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id',                   p.id,
              'amount',               p.amount,
              'payment_mode',         p.payment_mode,
              'reference',            p.reference,
              'remark',               p.remark,
              'posted_at',            p.posted_at,
              'payment_received_date', p.payment_received_date,
              'voucher_no',           p.voucher_no
            )
            order by p.posted_at desc
          )
          from public.accounts_mechanical_payment_lines p
          where p.reception_entry_id = s.id
        ), '[]'::jsonb)
      )
      from public.accounts_mechanical_invoices inv
      join public.service_reception_entries s on s.id = inv.reception_entry_id
      where public.customer_norm_reg(s.reg_number) = any($1)
        and ($2::text is null or public.customer_norm_reg(s.reg_number) = $2)
        and inv.billed_amount is not null
      order by coalesce(inv.updated_at, inv.captured_at, s.created_at) desc nulls last
      limit 1
      $q$
    into v_row
    using v_regs, v_reg;
    if v_row is not null then
      return v_row;
    end if;
  end if;

  -- 4. Expected amount only, before Accounts posts a bill.
  select jsonb_build_object(
    'source',             'reception_expected',
    'reception_entry_id', s.id,
    'reg_number',         s.reg_number,
    'jc_number',          s.jc_number,
    'owner_name',         s.owner_name,
    'branch',             s.branch,
    'service_type',       s.service_type,
    'total_billed',       s.expected_invoice_amount,
    'billed_amount',      s.expected_invoice_amount,
    'amount_received',    0,
    'remaining_amount',   s.expected_invoice_amount,
    'remaining_due',      s.expected_invoice_amount,
    'status',             case when s.invoice_done_at is null then 'pending' else 'invoiced' end,
    'invoice_drive_url',  s.invoice_drive_url,
    'invoice_storage_path', s.invoice_storage_path,
    'payments',           '[]'::jsonb,
    'updated_at',         coalesce(s.invoice_done_at, s.created_at)
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

comment on function public.customer_get_settlement(text, text) is
  'Customer payments. Priority: bodyshop_settlements (Accounts desk) > payment payload > mechanical invoice > reception expected.';

commit;
