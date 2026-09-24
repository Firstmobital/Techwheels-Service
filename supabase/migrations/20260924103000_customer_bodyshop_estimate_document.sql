-- Customer portal: expose bodyshop SA estimate upload (doc_estimate) on repair card RPC.

begin;

create or replace function public.customer_get_bodyshop_document(
  p_session_token text,
  p_reg_number text,
  p_doc_key text default 'doc_estimate'
)
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
  v_card_id integer;
  v_doc jsonb;
  v_doc_key text;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);
  v_doc_key := nullif(btrim(coalesce(p_doc_key, 'doc_estimate')), '');

  if v_doc_key is null then
    raise exception 'doc_key is required';
  end if;

  select b.id
  into v_card_id
  from public.bodyshop_repair_cards b
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and public.customer_norm_reg(b.reg_number) = v_reg
  order by b.created_at desc
  limit 1;

  if v_card_id is null then
    return null;
  end if;

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
  into v_doc
  from public.bodyshop_repair_card_documents d
  where d.repair_card_id = v_card_id
    and d.doc_key = v_doc_key
  order by d.uploaded_at desc nulls last, d.id desc
  limit 1;

  return v_doc;
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
  v_card_id integer;
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
    'service_type', b.service_type,
    'overall_status', b.overall_status,
    'current_stage', b.current_stage,
    'current_stage_name', b.current_stage_name,
    'received_at', b.received_at,
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

  if v_row is null then
    return null;
  end if;

  v_card_id := (v_row->>'id')::integer;

  if v_card_id is not null then
    v_row := v_row || jsonb_build_object(
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
        where d.repair_card_id = v_card_id
          and d.doc_key = 'doc_estimate'
        order by d.uploaded_at desc nulls last, d.id desc
        limit 1
      )
    );
  end if;

  return v_row;
end;
$$;

revoke all on function public.customer_get_bodyshop_document(text, text, text) from public;
grant execute on function public.customer_get_bodyshop_document(text, text, text) to anon;

commit;
