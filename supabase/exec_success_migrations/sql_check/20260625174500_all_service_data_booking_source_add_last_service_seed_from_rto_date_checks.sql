-- Checks: booking source sync seeds service fields on insert
-- Supports one-go execution in Supabase SQL editor.
-- Also supports section-by-section execution (A -> D) if needed.
-- Read-only checks only; no DML/DDL side effects.

-- ============================================================
-- A) Function exists with expected signature
-- ============================================================
select
  to_regprocedure('public.upsert_all_service_data_from_booking_source(text,date,text,text,text,text,date,text,text,timestamp with time zone,text)')
    as upsert_function_signature;

-- ============================================================
-- B) Function body contains new insert mappings
-- ============================================================
with fn as (
  select pg_get_functiondef(p.oid) as function_def
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'upsert_all_service_data_from_booking_source'
)
select
  (function_def ilike '%last_service_type,%last_service_date,%') as inserts_service_columns,
  (function_def ilike '%''New'',%') as sets_last_service_type_new,
  (function_def ilike '%(p_vehicle_sale_date::timestamp at time zone ''Asia/Kolkata'')%') as maps_last_service_date_from_vehicle_sale_date,
  (function_def ilike '%skipped_existing_chassis%') as keeps_insert_only_existing_chassis_skip,
  (function_def not ilike '%update public.all_service_data t%') as no_update_statement
from fn;

-- ============================================================
-- C) Target columns exist
-- ============================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'all_service_data'
  and column_name in ('last_service_type', 'last_service_date')
order by column_name;

-- ============================================================
-- D) Spot-check latest inserted sale-sync rows for new mappings
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
