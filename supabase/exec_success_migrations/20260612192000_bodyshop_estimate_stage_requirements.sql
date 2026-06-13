-- Bodyshop estimate stage requirements
-- 1) Add bodyshop-specific estimate amount field
-- 2) Allow estimate document key in bodyshop_repair_card_documents

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS estimated_amount numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bodyshop_repair_cards_estimated_amount_non_negative'
  ) THEN
    ALTER TABLE public.bodyshop_repair_cards
      ADD CONSTRAINT bodyshop_repair_cards_estimated_amount_non_negative
      CHECK (estimated_amount IS NULL OR estimated_amount >= 0);
  END IF;
END;
$$;

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
        'doc_estimate'::text
      ]
    )
  );
