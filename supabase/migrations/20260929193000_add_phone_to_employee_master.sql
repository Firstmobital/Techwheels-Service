-- Migration: Add phone column to employee_master and project sa_phone into customer endpoints
-- Timestamp: 20260929193000
-- Plan: CUSTOMER-ADVISOR-PHONE-001 / DBL-0088

-- 1. Add phone column to employee_master
alter table public.employee_master add column if not exists phone text;

comment on column public.employee_master.phone is 'Contact phone/mobile number for service advisor or employee used for direct customer call & WhatsApp';

-- 2. Update customer_collect_vehicles to include sa_phone
create or replace function public.customer_collect_vehicles(p_phone text) returns jsonb
    language plpgsql stable security definer
    set search_path to 'public'
    as $$
declare
  v_phone text := public.customer_last10_digits(p_phone);
  v_rows jsonb := '[]'::jsonb;
begin
  if v_phone is null then
    return '[]'::jsonb;
  end if;

  with rec as (
    select
      1 as src_rank,
      s.id::text as source_id,
      'reception'::text as source,
      public.customer_norm_reg(s.reg_number) as reg_key,
      s.reg_number,
      s.model,
      null::text as vin,
      s.owner_name,
      s.owner_phone,
      s.service_type,
      s.sa_name,
      s.sa_display_name,
      coalesce(
        em.phone,
        (select em2.phone from public.employee_master em2 where nullif(btrim(s.sa_name), '') is not null and em2.employee_name = s.sa_name and em2.phone is not null limit 1)
      ) as sa_phone,
      s.jc_number,
      s.branch,
      s.created_at,
      s.invoice_done_at,
      s.km_reading::numeric as km_reading,
      s.remark,
      s.estimate_storage_path,
      s.estimate_drive_url,
      s.invoice_storage_path,
      s.invoice_drive_url
    from public.service_reception_entries s
    left join public.employee_master em on (
      nullif(btrim(s.sa_employee_code), '') is not null
      and em.employee_code = s.sa_employee_code
    )
    where public.customer_last10_digits(s.owner_phone) = v_phone
      and public.customer_norm_reg(s.reg_number) is not null
  ),
  veh as (
    select
      2 as src_rank,
      public.customer_norm_reg(v.reg_number) as source_id,
      'vehicles'::text as source,
      public.customer_norm_reg(v.reg_number) as reg_key,
      v.reg_number,
      v.model,
      v.vin,
      v.owner_name,
      v.owner_phone,
      null::text as service_type,
      null::text as sa_name,
      null::text as sa_display_name,
      null::text as sa_phone,
      null::text as jc_number,
      null::text as branch,
      v.created_at,
      null::timestamptz as invoice_done_at,
      null::numeric as km_reading,
      null::text as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.vehicles v
    where public.customer_last10_digits(v.owner_phone) = v_phone
      and public.customer_norm_reg(v.reg_number) is not null
  ),
  bs as (
    select
      3 as src_rank,
      b.id::text as source_id,
      'bodyshop'::text as source,
      public.customer_norm_reg(b.reg_number) as reg_key,
      b.reg_number,
      null::text as model,
      null::text as vin,
      b.customer_name as owner_name,
      b.customer_phone as owner_phone,
      'Body & Paint'::text as service_type,
      b.sa_name,
      b.sa_name as sa_display_name,
      coalesce(
        em.phone,
        (select em2.phone from public.employee_master em2 where nullif(btrim(b.sa_name), '') is not null and em2.employee_name = b.sa_name and em2.phone is not null limit 1)
      ) as sa_phone,
      b.job_card_no as jc_number,
      b.branch,
      b.created_at,
      b.delivered_at as invoice_done_at,
      null::numeric as km_reading,
      b.overall_status as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.bodyshop_repair_cards b
    left join public.employee_master em on (
      nullif(btrim(b.sa_employee_code), '') is not null
      and em.employee_code = b.sa_employee_code
    )
    where public.customer_last10_digits(b.customer_phone) = v_phone
      and public.customer_norm_reg(b.reg_number) is not null
  ),
  asd as (
    select
      4 as src_rank,
      a.id::text as source_id,
      'all_service_data'::text as source,
      public.customer_norm_reg(a.vehicle_registration_number) as reg_key,
      a.vehicle_registration_number as reg_number,
      a.model,
      a.chassis_no as vin,
      nullif(btrim(concat_ws(' ', a.first_name, a.last_name)), '') as owner_name,
      coalesce(
        public.customer_last10_digits(a.last_service_customer_mobile_no),
        v_phone
      ) as owner_phone,
      a.last_service_type as service_type,
      a.last_service_dealer as sa_name,
      a.last_service_dealer as sa_display_name,
      null::text as sa_phone,
      a.extended_warranty_order_no as jc_number,
      a.sold_dealer as branch,
      coalesce(a.last_service_date::timestamptz, a.created_at) as created_at,
      a.last_service_date::timestamptz as invoice_done_at,
      nullif(regexp_replace(coalesce(a.last_service_km, ''), '[^0-9]', '', 'g'), '')::numeric as km_reading,
      a.product_line as remark,
      null::text as estimate_storage_path,
      null::text as estimate_drive_url,
      null::text as invoice_storage_path,
      null::text as invoice_drive_url
    from public.all_service_data a
    where public.customer_norm_reg(a.vehicle_registration_number) is not null
      and (
        public.customer_last10_digits(a.last_service_customer_mobile_no) = v_phone
        or exists (
          select 1
          from unnest(regexp_split_to_array(coalesce(a.contact_phones, ''), '[,;/|]+')) as part
          where public.customer_last10_digits(part) = v_phone
        )
      )
  ),
  united as (
    select * from rec
    union all
    select * from veh
    union all
    select * from bs
    union all
    select * from asd
  ),
  picked as (
    select distinct on (reg_key)
      source_id,
      source,
      reg_key,
      reg_number,
      model,
      vin,
      owner_name,
      owner_phone,
      service_type,
      sa_name,
      sa_display_name,
      sa_phone,
      jc_number,
      branch,
      created_at,
      invoice_done_at,
      km_reading,
      remark,
      estimate_storage_path,
      estimate_drive_url,
      invoice_storage_path,
      invoice_drive_url
    from united
    where reg_key is not null
    order by reg_key, src_rank, created_at desc nulls last
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', source_id,
        'source', source,
        'reg_number', reg_number,
        'reg_key', reg_key,
        'model', model,
        'vin', vin,
        'owner_name', owner_name,
        'owner_phone', owner_phone,
        'service_type', service_type,
        'sa_name', sa_name,
        'sa_display_name', sa_display_name,
        'sa_phone', sa_phone,
        'jc_number', jc_number,
        'branch', branch,
        'created_at', created_at,
        'invoice_done_at', invoice_done_at,
        'km_reading', km_reading,
        'remark', remark,
        'estimate_storage_path', estimate_storage_path,
        'estimate_drive_url', estimate_drive_url,
        'invoice_storage_path', invoice_storage_path,
        'invoice_drive_url', invoice_drive_url
      )
      order by reg_number
    ),
    '[]'::jsonb
  )
  into v_rows
  from picked;

  return v_rows;
end;
$$;

-- 3. Update customer_get_repair_card to include sa_phone
create or replace function public.customer_get_repair_card(p_session_token text, p_reg_number text default null::text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_session_phone text;
  v_reg text;
  v_card record;
  v_effective int;
  v_display int;
begin
  v_session_phone := public.customer_require_session(p_session_token);

  if p_reg_number is not null and btrim(p_reg_number) <> '' then
    v_reg := public.customer_assert_reg(v_session_phone, p_reg_number);
  end if;

  select *
  into v_card
  from public.bodyshop_repair_cards b
  where public.customer_last10_digits(b.customer_phone) = v_session_phone
    and (v_reg is null or public.customer_norm_reg(b.reg_number) = v_reg)
  order by b.created_at desc nulls last
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
      'sa_phone', (
        select coalesce(
          (select em.phone from public.employee_master em where nullif(btrim(b.sa_employee_code), '') is not null and em.employee_code = b.sa_employee_code and em.phone is not null limit 1),
          (select em2.phone from public.employee_master em2 where nullif(btrim(b.sa_name), '') is not null and em2.employee_name = b.sa_name and em2.phone is not null limit 1)
        )
      ),
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
      'job_card_document',
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
          and d.doc_key = 'doc_job_card'
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
      ),
      'settlement',
      (
        select jsonb_build_object(
          'invoice_account', s.invoice_account,
          'bill_to', s.bill_to,
          'status', s.status,
          'final_bill_amount', s.final_bill_amount,
          'settled_amount', s.settled_amount,
          'tds_deducted', s.tds_deducted,
          'disallowance', s.disallowance,
          'balance_payable', s.balance_payable,
          'payment_mode', s.payment_mode,
          'reference_no', s.reference_no,
          'payment_date', s.payment_date,
          'notes', s.notes
        )
        from public.bodyshop_settlements s
        where s.repair_card_id = b.id
        limit 1
      )
    )
  into v_card
  from public.bodyshop_repair_cards b
  where b.id = v_card.id;

  return to_jsonb(v_card);
end;
$$;

grant all on function public.customer_get_repair_card(text, text) to anon, authenticated, service_role;
