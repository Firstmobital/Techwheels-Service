ALTER TABLE public.bodyshop_repair_cards
  ADD COLUMN IF NOT EXISTS doc_rejected_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bodyshop_repair_cards.doc_rejected_keys IS
  'Document keys the advisor rejected. Cleared for a key when that document is approved. Approval itself stays on the doc_* boolean and cannot be undone.';
