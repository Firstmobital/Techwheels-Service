-- Customer survey approve/reject writes this flag. The column was missing in production,
-- so the whole decision update failed and the rejection remark never reached the web portal.

ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS doc_survey_approval boolean;

UPDATE public.bodyshop_repair_cards b
SET doc_survey_approval = true
WHERE COALESCE(b.doc_survey_approval, false) = false
  AND EXISTS (
    SELECT 1
    FROM public.bodyshop_repair_card_documents d
    WHERE d.repair_card_id = b.id
      AND d.doc_key = 'doc_survey_approval'
  )
  AND b.customer_survey_approval_status = 'approved';
