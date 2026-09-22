-- MOBILE-012 / DBL-0068
-- Fix customer_get_settlement to return full settlement data including:
--   1. service_type, owner_name, branch, keep_on_credit fields
--   2. Payment lines from accounts_mechanical_payments (via jsonb_agg)
-- Root cause: anon client cannot directly SELECT from accounts_mechanical_invoices
-- or accounts_mechanical_payments (RLS blocks it). The RPC is SECURITY DEFINER
-- so all queries inside bypass RLS. Fix: return all needed data from inside the RPC.
-- Safe to re-run.

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

  -- 1. Check for an explicit customer_payment_payload pushed by accounts desk
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

  -- 2. accounts_mechanical_invoices with payments aggregated inline.
  --    SECURITY DEFINER bypasses RLS so anon callers get this data via RPC.
  if to_regclass('public.accounts_mechanical_invoices') is not null then
    execute
      $q$
      select jsonb_build_object(
        'source',              'accounts_mechanical_invoices',
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

  -- 3. Fallback: service_reception_entries expected_invoice_amount
  --    Used when accounts has not yet posted the billed_amount.
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
  'MOBILE-012 / DBL-0068: Full mechanical settlement with payments list.
   Priority: customer_payment_payload > accounts_mechanical_invoices+payments > reception_expected.
   SECURITY DEFINER bypasses RLS so anon callers get accounts data via RPC.
   payments field is always jsonb array (empty = []).';
