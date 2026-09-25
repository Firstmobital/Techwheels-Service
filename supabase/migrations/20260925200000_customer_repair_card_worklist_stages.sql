-- Customer journey: per-stage done/pending from bodyshop_stage_worklist_projection (all 18 stages).

begin;

create or replace function public.customer_bodyshop_stage_label(p_stage integer)
returns text
language sql
immutable
as $$
  select case p_stage
    when 1 then 'Vehicle Receiving'
    when 2 then 'Receiving Photos'
    when 3 then 'Job Card'
    when 4 then 'Customer Group'
    when 5 then 'Documentation'
    when 6 then 'Estimation'
    when 7 then 'Estimation Approval'
    when 8 then 'Claim Intimation'
    when 9 then 'Survey'
    when 10 then 'Parts Status'
    when 11 then 'Floor Assignment'
    when 12 then 'Additional Approval'
    when 13 then 'Quality Check'
    when 14 then 'Re-Inspection'
    when 15 then 'Billing'
    when 16 then 'DO Status'
    when 17 then 'Delivery'
    when 18 then 'Payment'
    else 'In progress'
  end;
$$;

create or replace function public.customer_get_repair_card(p_session_token text, p_reg_number text default null)
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
  v_row jsonb;
  v_card public.bodyshop_repair_cards%rowtype;
  v_effective integer;
  v_display integer;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  end if;

  select b.*
  into v_card
  from public.bodyshop_repair_cards b
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and (v_reg is null or public.customer_norm_reg(b.reg_number) = v_reg)
  order by b.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  v_effective := public.customer_bodyshop_effective_stage(v_card);

  select coalesce(max(p.stage_no), v_effective)
  into v_display
  from public.bodyshop_stage_worklist_projection p
  where p.repair_card_id = v_card.id
    and p.is_pending = true;

  select
    (to_jsonb(b) - 'sa_employee_code' - 'created_by')
    || jsonb_build_object(
      'customer_effective_stage', v_effective,
      'customer_effective_stage_name', public.customer_bodyshop_stage_label(v_effective),
      'customer_display_stage', v_display,
      'customer_display_stage_name', public.customer_bodyshop_stage_label(v_display),
      'pending_worklist_stages',
      coalesce(
        (
          select jsonb_agg(p.stage_no order by p.stage_no)
          from public.bodyshop_stage_worklist_projection p
          where p.repair_card_id = b.id
            and p.is_pending = true
        ),
        '[]'::jsonb
      ),
      'worklist_stages',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'stage_no', p.stage_no,
              'is_done', p.is_done,
              'is_pending', p.is_pending,
              'is_ready', p.is_ready
            )
            order by p.stage_no
          )
          from public.bodyshop_stage_worklist_projection p
          where p.repair_card_id = b.id
        ),
        '[]'::jsonb
      ),
      'estimate_document',
      (
        select jsonb_build_object(
          'doc_key', d.doc_key,
          'file_name', d.file_name,
          'content_type', d.content_type,
          'drive_url', nullif(btrim(coalesce(d.drive_url, '')), ''),
          'drive_file_id', nullif(btrim(coalesce(d.drive_file_id, '')), ''),
          'storage_bucket', coalesce(nullif(btrim(d.storage_bucket), ''), 'autodoc'),
          'storage_path', d.storage_path,
          'uploaded_at', d.uploaded_at,
          'uploaded_by', d.uploaded_by
        )
        from public.bodyshop_repair_card_documents d
        where d.repair_card_id = b.id
          and d.doc_key = 'doc_estimate'
        order by d.uploaded_at desc nulls last, d.id desc
        limit 1
      ),
      'uploaded_documents',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'doc_key', doc.doc_key,
              'file_name', doc.file_name,
              'uploaded_at', doc.uploaded_at
            )
            order by doc.doc_key
          )
          from public.bodyshop_repair_card_documents doc
          where doc.repair_card_id = b.id
        ),
        '[]'::jsonb
      ),
      'intake_photo_count',
      (
        select count(*)::int
        from public.bodyshop_intake_vehicle_photos p
        where p.repair_card_id = b.id
           or (b.reception_entry_id is not null and p.reception_entry_id = b.reception_entry_id)
      ),
      'settlement',
      (
        select jsonb_build_object(
          'invoice_number', s.invoice_number,
          'invoice_date', s.invoice_date,
          'invoice_amount', s.invoice_amount,
          'do_amount', s.do_amount,
          'insurance_due_amount', s.insurance_due_amount,
          'customer_diff_amount', s.customer_diff_amount,
          'customer_remaining_amount', s.customer_remaining_amount,
          'do_payment_status', s.do_payment_status,
          'derived_payment_status', s.derived_payment_status
        )
        from public.bodyshop_settlements s
        where s.repair_card_id = b.id
        limit 1
      )
    )
  into v_row
  from public.bodyshop_repair_cards b
  where b.id = v_card.id;

  return v_row;
end;
$$;

revoke all on function public.customer_bodyshop_stage_label(integer) from public;

commit;
