-- BUSY Accounting module checks
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT EXISTS (
  SELECT 1 FROM public.modules WHERE name = 'busy'
) AS busy_module_registered;

SELECT name, label, route, sort_order, is_active
FROM public.modules
WHERE name = 'busy';

SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'psf_revenue_dms'
) AS labour_source_table_exists;

SELECT COUNT(*) FILTER (WHERE portal = 'PV') AS pv_labour_rows,
       COUNT(*) FILTER (WHERE portal = 'EV') AS ev_labour_rows
FROM public.psf_revenue_dms;
