-- ACCOUNTS-002 (PD-18 safeguard): keep the invoice that an import replaces. Ledger: DBL-0102.
-- Verified only on an isolated scratch database restored from the metadata snapshot; NOT applied to production.
--
-- Evidence: psf_revenue_dms is keyed by (location, portal, job_card_number, invoice_date). Two invoices for the same
-- job card on the same date overwrite each other when imported in separate batches (the later one wins; the earlier
-- amount disappears). DMS exports show same-day multiple invoices occur (see ACCOUNTS-002 test matrix, ST-07).
-- This change does NOT change the key and does NOT block imports: it preserves the replaced row in
-- psf_revenue_dms_invoice_conflicts so nothing is lost silently and Finance can see and decide. A key redesign needs a
-- separate approval.
--
-- ROLLBACK: DROP TRIGGER trg_psf_revenue_dms_record_invoice_replacement ON public.psf_revenue_dms;
--           DROP FUNCTION public.psf_revenue_dms_record_invoice_replacement();
--           DROP TABLE public.psf_revenue_dms_invoice_conflicts;  (only after exporting its rows if any exist)
-- Requires 20261125140000_finance_data_access_hardening.sql (finance_* helper functions).

CREATE TABLE IF NOT EXISTS public.psf_revenue_dms_invoice_conflicts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    detected_at timestamptz NOT NULL DEFAULT now(),
    location text,
    portal text,
    job_card_number text,
    invoice_date date,
    replaced_invoice_number text,
    replaced_total_invoice_amount numeric,
    replaced_invoice_status text,
    new_invoice_number text,
    new_total_invoice_amount numeric,
    new_invoice_status text,
    replaced_row jsonb NOT NULL
);

COMMENT ON TABLE public.psf_revenue_dms_invoice_conflicts IS 'ACCOUNTS-002 PD-18: invoices replaced by a later invoice for the same location, portal, job card and date during import. Append-only evidence; written by trigger only.';

ALTER TABLE public.psf_revenue_dms_invoice_conflicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_read ON public.psf_revenue_dms_invoice_conflicts;
CREATE POLICY finance_read ON public.psf_revenue_dms_invoice_conflicts FOR SELECT TO authenticated
  USING ((SELECT public.finance_data_read_allowed())
         AND ((SELECT public.finance_all_branches_access())
              OR public.finance_location_key(location) = ANY (COALESCE((SELECT public.finance_my_location_keys()), '{}'::text[]))));
REVOKE ALL ON TABLE public.psf_revenue_dms_invoice_conflicts FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.psf_revenue_dms_invoice_conflicts FROM authenticated;
GRANT SELECT ON TABLE public.psf_revenue_dms_invoice_conflicts TO authenticated;

CREATE OR REPLACE FUNCTION public.psf_revenue_dms_record_invoice_replacement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
AS $$
BEGIN
  IF NULLIF(btrim(OLD.invoice_number), '') IS NOT NULL
     AND OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
     AND OLD.invoice_date IS NOT DISTINCT FROM NEW.invoice_date THEN
    INSERT INTO public.psf_revenue_dms_invoice_conflicts (
      location, portal, job_card_number, invoice_date,
      replaced_invoice_number, replaced_total_invoice_amount, replaced_invoice_status,
      new_invoice_number, new_total_invoice_amount, new_invoice_status, replaced_row
    ) VALUES (
      COALESCE(OLD.location, OLD.branch), OLD.portal, OLD.job_card_number, OLD.invoice_date,
      OLD.invoice_number, OLD.total_invoice_amount, OLD.invoice_status,
      NEW.invoice_number, NEW.total_invoice_amount, NEW.invoice_status, to_jsonb(OLD)
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.psf_revenue_dms_record_invoice_replacement() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_psf_revenue_dms_record_invoice_replacement ON public.psf_revenue_dms;
CREATE TRIGGER trg_psf_revenue_dms_record_invoice_replacement
  AFTER UPDATE OF invoice_number ON public.psf_revenue_dms
  FOR EACH ROW
  WHEN (OLD.invoice_number IS DISTINCT FROM NEW.invoice_number)
  EXECUTE FUNCTION public.psf_revenue_dms_record_invoice_replacement();
