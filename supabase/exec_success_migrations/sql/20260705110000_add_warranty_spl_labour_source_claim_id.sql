-- Adds a traceable link from the derived warranty_spl_codes_data / warranty_labour_data
-- rows back to the raw uploaded claim line in warranty_claim_settlement_report_data.
--
-- Root cause being fixed: uploads via the Import page only ever wrote into
-- warranty_claim_settlement_report_data (raw JSONB rows). Nothing transformed those rows
-- into the two structured tables the Warranty Overview report actually reads from, so the
-- report has been showing stale/incomplete data since it was built. This column lets the
-- new sync process (run after every upload) rebuild both tables idempotently, keyed on the
-- raw row's own primary key rather than a recomputed hash (avoids hash-collision risk and
-- makes re-syncs trivially safe).
--
-- Does NOT change the report's UI/columns/layout — purely additive and internal.

ALTER TABLE public.warranty_spl_codes_data
  ADD COLUMN IF NOT EXISTS source_claim_id bigint;

ALTER TABLE public.warranty_labour_data
  ADD COLUMN IF NOT EXISTS source_claim_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS warranty_spl_codes_data_source_claim_id_key
  ON public.warranty_spl_codes_data (source_claim_id)
  WHERE source_claim_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS warranty_labour_data_source_claim_id_key
  ON public.warranty_labour_data (source_claim_id)
  WHERE source_claim_id IS NOT NULL;
