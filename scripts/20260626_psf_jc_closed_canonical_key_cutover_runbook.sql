-- PSF canonical key cutover runbook for public.job_card_closed_data
-- IMPORT-002 aligned sequence:
-- 1) keep current branch-based key active until app switch is ready
-- 2) preflight canonical-key integrity
-- 3) add canonical unique index
-- 4) switch app upsert target
-- 5) remove branch-based key
-- 6) drop legacy columns only after Gate C

-- ============================================================================
-- STEP 0: Preflight integrity checks (read-only)
-- ============================================================================

-- 0.1 Missing canonical dimensions should be zero before cutover.
select
  count(*) as total_rows,
  count(*) filter (where location is null or btrim(location) = '') as missing_location,
  count(*) filter (where portal is null or btrim(portal) = '') as missing_portal,
  count(*) filter (where upper(btrim(coalesce(portal, ''))) not in ('PV', 'EV')) as invalid_portal,
  count(*) filter (where btrim(coalesce(job_card_number, '')) = '') as blank_job_card_number,
  count(*) filter (where invoice_date is null) as missing_invoice_date
from public.job_card_closed_data;

-- 0.2 Canonical-key duplicate risk must be zero before creating unique index.
select
  location,
  portal,
  upper(btrim(job_card_number)) as job_card_number_norm,
  invoice_date,
  count(*) as row_count
from public.job_card_closed_data
where btrim(coalesce(job_card_number, '')) <> ''
  and invoice_date is not null
  and location is not null
  and btrim(location) <> ''
  and portal is not null
  and btrim(portal) <> ''
group by
  location,
  portal,
  upper(btrim(job_card_number)),
  invoice_date
having count(*) > 1
order by row_count desc, location, portal, job_card_number_norm, invoice_date;

-- ============================================================================
-- STEP 1: Create canonical unique index
-- IMPORTANT: Supabase SQL Editor runs inside a transaction block.
-- So this runbook is SQL-Editor-safe by default (non-CONCURRENTLY).
-- Optional psql/migration-runner command is provided below.
-- ============================================================================

create unique index if not exists uq_jc_closed_location_portal_job_card_number_invoice_date
  on public.job_card_closed_data (location, portal, job_card_number, invoice_date)
  where job_card_number is not null
    and btrim(job_card_number) <> ''
    and invoice_date is not null
    and location is not null
    and btrim(location) <> ''
    and portal is not null
    and btrim(portal) <> '';

-- Optional (psql/migration runner only):
-- create unique index concurrently if not exists uq_jc_closed_location_portal_job_card_number_invoice_date
--   on public.job_card_closed_data (location, portal, job_card_number, invoice_date)
--   where job_card_number is not null
--     and btrim(job_card_number) <> ''
--     and invoice_date is not null
--     and location is not null
--     and btrim(location) <> ''
--     and portal is not null
--     and btrim(portal) <> '';

-- Verify both keys currently exist during compatibility window.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'job_card_closed_data'
  and indexname in (
    'uq_jc_closed_branch_job_card_number_invoice_date',
    'uq_jc_closed_location_portal_job_card_number_invoice_date'
  )
order by indexname;

-- ============================================================================
-- STEP 2: Application cutover checkpoint (manual release gate)
-- ============================================================================
-- Update PSF importer onConflict target in app code to:
--   location,portal,job_card_number,invoice_date
-- Keep branch/branch_label as compatibility mirrors until Phase D.

-- ============================================================================
-- STEP 3: Remove old branch-based unique index after app switch
-- IMPORTANT: Supabase SQL Editor runs inside a transaction block.
-- So this runbook is SQL-Editor-safe by default (non-CONCURRENTLY).
-- Optional psql/migration-runner command is provided below.
-- ============================================================================

-- Execute only after app is using canonical onConflict target.
drop index if exists public.uq_jc_closed_branch_job_card_number_invoice_date;

-- Optional (psql/migration runner only):
-- drop index concurrently if exists public.uq_jc_closed_branch_job_card_number_invoice_date;

-- ============================================================================
-- STEP 4: Final legacy column drop (Phase D, post Gate C only)
-- ============================================================================
-- Execute only when:
-- 1) web+mobile runtime references to branch and branch_label are zero
-- 2) canonical conflict key is active in production
-- 3) parity checks and dry-runs are green

-- alter table public.job_card_closed_data drop column if exists branch_label;
-- alter table public.job_card_closed_data drop column if exists branch;

-- ============================================================================
-- STEP 5: Post-cutover health checks
-- ============================================================================

-- 5.1 Duplicate check under canonical key should be zero.
select
  count(*) as canonical_duplicate_groups
from (
  select
    location,
    portal,
    upper(btrim(job_card_number)) as job_card_number_norm,
    invoice_date
  from public.job_card_closed_data
  where btrim(coalesce(job_card_number, '')) <> ''
    and invoice_date is not null
    and btrim(coalesce(location, '')) <> ''
    and btrim(coalesce(portal, '')) <> ''
  group by location, portal, upper(btrim(job_card_number)), invoice_date
  having count(*) > 1
) d;

-- 5.2 Optional latest-version read pattern (for one-row-per-job-card reporting):
-- select *
-- from (
--   select
--     t.*,
--     row_number() over (
--       partition by location, portal, upper(btrim(job_card_number))
--       order by invoice_date desc nulls last, updated_at desc, id desc
--     ) as rn
--   from public.job_card_closed_data t
-- ) x
-- where rn = 1;
