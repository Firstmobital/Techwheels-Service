-- Bodyshop survey stage enhancements
-- 1) Add survey date and survey info audit capture fields
-- 2) Allow survey approval photo document key

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS survey_date date,
  ADD COLUMN IF NOT EXISTS survay_info_by text,
  ADD COLUMN IF NOT EXISTS survay_info_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS survay_info_updated_by text,
  ADD COLUMN IF NOT EXISTS survay_info_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS bodyshop_floor text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_repair_card_documents_doc_key_check'
  ) THEN
    ALTER TABLE public.bodyshop_repair_card_documents
      DROP CONSTRAINT bodyshop_repair_card_documents_doc_key_check;
  END IF;
END;
$$;

ALTER TABLE public.bodyshop_repair_card_documents
  ADD CONSTRAINT bodyshop_repair_card_documents_doc_key_check
  CHECK (
    doc_key = ANY (
      ARRAY[
        'doc_claim_form'::text,
        'doc_rc'::text,
        'doc_insurance'::text,
        'doc_dl'::text,
        'doc_aadhaar'::text,
        'doc_pan'::text,
        'doc_kyc'::text,
        'doc_gst'::text,
        'doc_company_pan'::text,
        'doc_bank_detail'::text,
        'doc_estimate'::text,
        'doc_survey_approval'::text
      ]
    )
  );
