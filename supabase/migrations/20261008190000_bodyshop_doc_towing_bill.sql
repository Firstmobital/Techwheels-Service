-- Optional towing bill document (Individual & Firm) on bodyshop SA docs tab

begin;

alter table public.bodyshop_repair_cards
  add column if not exists doc_towing_bill boolean default false not null;

comment on column public.bodyshop_repair_cards.doc_towing_bill is
  'Advisor verified optional towing bill (individual or firm insurance claims).';

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
    'doc_towing_bill'::text,
    'doc_estimate'::text,
    'doc_survey_approval'::text,
    'doc_job_card'::text,
    'job_card'::text
  ]));

commit;
