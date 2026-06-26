-- Slice L verification checks
-- 1) Core objects exist
select to_regclass('public.psf_import_runs') as psf_import_runs_exists;
select to_regclass('public.psf_import_staging') as psf_import_staging_exists;

-- 2) RPC/function exists
select p.oid::regprocedure as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'run_psf_import_via_staging';

-- 3) Empty-run smoke test (must return completed with zero counts)
select *
from public.run_psf_import_via_staging(
  'SLICE_L_SMOKE',
  'slice_l_smoke.json',
  '[]'::jsonb
);

-- 4) Latest run snapshot
select
  id,
  status,
  branch_slot,
  source_file_name,
  total_rows,
  staged_rows,
  valid_rows,
  inserted_rows,
  updated_rows,
  skipped_rows,
  rejected_rows,
  error_message,
  created_at,
  completed_at
from public.psf_import_runs
order by id desc
limit 10;
