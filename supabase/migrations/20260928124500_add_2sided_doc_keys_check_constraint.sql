-- Migration: Expand bodyshop_repair_card_documents_doc_key_check constraint
-- Adds support for 2-sided document back keys: doc_rc_back, doc_dl_back, doc_aadhaar_back, doc_tp_affidavit

ALTER TABLE public.bodyshop_repair_card_documents
  DROP CONSTRAINT IF EXISTS bodyshop_repair_card_documents_doc_key_check;

ALTER TABLE public.bodyshop_repair_card_documents
  ADD CONSTRAINT bodyshop_repair_card_documents_doc_key_check
  CHECK (doc_key = ANY (ARRAY[
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
    'doc_survey_approval'::text
  ]));
