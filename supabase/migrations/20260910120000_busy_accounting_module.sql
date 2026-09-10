-- BUSY Accounting module registration.
-- No new data tables. Labour already lives in public.psf_revenue_dms.
-- Parts files are session-only on the BUSY page.

-- Execution note for operators: this file is a migration, not a sql_check.

INSERT INTO public.modules (name, label, description, route, sort_order, is_active)
VALUES (
  'busy',
  'BUSY',
  'BUSY accounting export of Party Accounts and Invoice Vouchers from DMS Labour Revenue plus PV/EV Parts files.',
  '/busy',
  29,
  true
)
ON CONFLICT (name) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
