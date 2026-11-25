-- Read-only checks for 20261125141000_psf_invoice_overwrite_audit.sql (ACCOUNTS-002, DBL-0102)
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: true / true / true (table exists with RLS, trigger exists, trigger is enabled)
SELECT to_regclass('public.psf_revenue_dms_invoice_conflicts') IS NOT NULL AS table_should_be_true,
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.psf_revenue_dms_invoice_conflicts'::regclass) AS rls_should_be_true,
       EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.psf_revenue_dms'::regclass
                 AND tgname = 'trg_psf_revenue_dms_record_invoice_replacement' AND tgenabled = 'O') AS trigger_should_be_true;

-- Expect: false / false / false / false (application users cannot write the evidence table; anon cannot read it)
SELECT has_table_privilege('authenticated', 'public.psf_revenue_dms_invoice_conflicts', 'INSERT') AS auth_insert_should_be_false,
       has_table_privilege('authenticated', 'public.psf_revenue_dms_invoice_conflicts', 'UPDATE') AS auth_update_should_be_false,
       has_table_privilege('authenticated', 'public.psf_revenue_dms_invoice_conflicts', 'DELETE') AS auth_delete_should_be_false,
       has_table_privilege('anon', 'public.psf_revenue_dms_invoice_conflicts', 'SELECT')         AS anon_select_should_be_false;

-- Informational (review manually): replaced invoices recorded so far, by location
SELECT location, count(*) AS replaced_invoices, min(detected_at) AS first_seen
FROM public.psf_revenue_dms_invoice_conflicts GROUP BY location ORDER BY location;
