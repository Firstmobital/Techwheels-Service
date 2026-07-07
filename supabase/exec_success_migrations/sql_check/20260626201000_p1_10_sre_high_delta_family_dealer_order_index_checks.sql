-- P1-10 verification checks (read-only)
-- 1) Index exists with expected keys/order and predicate.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'service_reception_entries'
  and indexname = 'idx_sre_dealer_created_at_id_desc';

-- 2) Run planner check for dealer-scoped ordered list path.
--    This mirrors the highest-delta family under authenticated dealer scope.
explain (analyze, buffers, verbose)
with sample_dealer as (
  select sre.dealer_code
  from public.service_reception_entries sre
  where sre.dealer_code is not null
  order by sre.created_at desc, sre.id desc
  limit 1
)
select
  sre.id,
  sre.dealer_code,
  sre.reg_number,
  sre.model,
  sre.service_type,
  sre.sa_employee_code,
  sre.jc_number,
  sre.owner_name,
  sre.owner_phone,
  sre.branch,
  sre.location,
  sre.portal,
  sre.branch_label,
  sre.source,
  sre.created_at,
  sre.updated_at
from public.service_reception_entries sre
where sre.dealer_code = (select dealer_code from sample_dealer)
order by sre.created_at desc, sre.id desc
limit 500;

-- 3) Keep regression-family visibility in one query (top 25 by total_exec_time).
select
  queryid,
  calls,
  round(total_exec_time::numeric, 2) as total_ms,
  round(mean_exec_time::numeric, 2) as mean_ms
from extensions.pg_stat_statements
order by total_exec_time desc
limit 25;
