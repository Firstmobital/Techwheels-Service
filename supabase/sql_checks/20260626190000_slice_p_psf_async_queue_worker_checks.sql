-- Slice P verification checks
-- 1) Queue/worker functions exist
select p.oid::regprocedure as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'enqueue_psf_import_run',
    'process_psf_import_run',
    'process_next_psf_import_run'
)
order by p.proname;

-- 2) Enqueue smoke test (returns quickly and queued status)
select *
from public.enqueue_psf_import_run(
  'SLICE_P_QUEUE_SMOKE',
  'slice_p_queue_smoke.json',
  '[]'::jsonb
);

-- 3) Process next queue item (may return null when queue is empty)
select public.process_next_psf_import_run() as processed_run_id;

-- 4) Latest queue run snapshot
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
  started_at,
  completed_at
from public.psf_import_runs
where branch_slot like 'SLICE_P_%'
order by id desc
limit 10;
