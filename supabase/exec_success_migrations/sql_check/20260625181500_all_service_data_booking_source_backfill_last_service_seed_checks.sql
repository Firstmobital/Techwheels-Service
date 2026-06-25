-- Checks: Backfill verification for booking-sync service seed fields
-- Supports one-go execution in Supabase SQL editor.
-- Also supports section-by-section execution (A -> C) if needed.
-- Read-only checks only; no DML/DDL side effects.

-- ============================================================
-- A) Confirm no sale-sync rows are missing seeded service type/date
-- ============================================================
select
  count(1) filter (where t.updated_by_sale = true) as sale_rows,
  count(1) filter (
    where t.updated_by_sale = true
      and nullif(btrim(t.last_service_type), '') is null
  ) as missing_last_service_type,
  count(1) filter (
    where t.updated_by_sale = true
      and t.last_service_date is null
  ) as missing_last_service_date,
  count(1) filter (
    where t.updated_by_sale = true
      and t.vehicle_sale_date is not null
      and (t.last_service_date at time zone 'Asia/Kolkata')::date <> t.vehicle_sale_date
  ) as date_not_equal_vehicle_sale_date
from public.all_service_data t;

-- ============================================================
-- B) Distribution check for seeded type
-- ============================================================
select
  t.last_service_type,
  count(*) as row_count
from public.all_service_data t
where t.updated_by_sale = true
group by t.last_service_type
order by row_count desc, t.last_service_type;

-- ============================================================
-- C) Latest sample rows
-- ============================================================
select
  t.id,
  t.chassis_no,
  t.vehicle_sale_date,
  t.last_service_type,
  t.last_service_date,
  t.updated_by_sale,
  t.updated_by_sale_at,
  t.last_updated_at
from public.all_service_data t
where t.updated_by_sale = true
order by t.last_updated_at desc nulls last, t.id desc
limit 50;
