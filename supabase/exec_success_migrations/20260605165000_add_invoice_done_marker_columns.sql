-- Add invoice_done marker columns to service_reception_entries
-- Purpose: Replace invoice file upload as completion trigger with explicit Done action
-- Instead of requiring file upload, Service Advisors mark invoice as "Done" via button click
-- Invoice/Completed card counts now based on invoice_done_at presence (or fallback to invoice_uploaded_at for historical data)

ALTER TABLE public.service_reception_entries 
ADD COLUMN invoice_done_at timestamp with time zone,
ADD COLUMN invoice_done_by text;

COMMENT ON COLUMN public.service_reception_entries.invoice_done_at IS 'Timestamp when Service Advisor marked invoice as done (primary completion marker). Replaces file upload as completion trigger.';
COMMENT ON COLUMN public.service_reception_entries.invoice_done_by IS 'Email/ID of user who marked the invoice as done';

-- Backfill: Mark as done any rows that already have uploaded invoices (historical data)
UPDATE public.service_reception_entries
SET 
  invoice_done_at = COALESCE(invoice_uploaded_at, now()),
  invoice_done_by = invoice_uploaded_by
WHERE invoice_uploaded_at IS NOT NULL
  AND invoice_done_at IS NULL;
