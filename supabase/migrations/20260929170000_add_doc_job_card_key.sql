-- Migration: Add doc_job_card to bodyshop_repair_card_documents constraint
-- and expose job_card_document in customer_get_repair_card RPC

begin;

-- 1. Update check constraint on bodyshop_repair_card_documents
alter table public.bodyshop_repair_card_documents
  drop constraint if exists bodyshop_repair_card_documents_doc_key_check;

alter table public.bodyshop_repair_card_documents
  add constraint bodyshop_repair_card_documents_doc_key_check
  check (doc_key = any (array[
    'doc_claim_form'::text,
    'doc_rc'::text,
    'doc_rc_back'::text,
    'doc_insurance'::text,
    'doc_dl'::text,
    'doc_dl_back'::text,
    'doc_aadhaar'::text,
    'doc_aadhaar_back'::text,
    'doc_pan'::text,
    'doc_kyc'::text,
    'doc_gst'::text,
    'doc_company_pan'::text,
    'doc_bank_detail'::text,
    'doc_tp_affidavit'::text,
    'doc_estimate'::text,
    'doc_survey_approval'::text,
    'doc_job_card'::text,
    'job_card'::text
  ]));

-- 2. Update customer_get_repair_card to include job_card_document
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
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  select
    to_jsonb(b) ||
    jsonb_build_object(
      'current_stage_label', public.bodyshop_repair_stage_label(b.current_stage),
      'current_stage_worklist_active', public.bodyshop_repair_stage_worklist_active(b.id, b.current_stage),
      'current_stage_worklist_total', public.bodyshop_repair_stage_worklist_total(b.id, b.current_stage),
      'current_stage_worklist_pending', public.bodyshop_repair_stage_worklist_pending(b.id, b.current_stage),
      'current_stage_pending_stages', public.bodyshop_repair_stage_pending_stages(b.id),
      'effective_current_stage', public.customer_repair_card_effective_stage(b.id),
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
           or (b.reception_entry_id is not null and p.reception_entry_id = b.reception_entry_id)
      )
    )
  into v_row
  from public.bodyshop_repair_cards b
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and public.customer_norm_reg(b.reg_number) = v_reg
  order by b.created_at desc
  limit 1;

  return v_row;
end;
$$;

commit;
