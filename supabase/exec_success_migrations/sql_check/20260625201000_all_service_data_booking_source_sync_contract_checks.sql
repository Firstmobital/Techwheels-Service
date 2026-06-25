-- Checks: Booking source -> all_service_data target sync contract (wave 1)
-- Supports one-go execution in Supabase SQL editor.
-- Also supports section-by-section execution (A -> E) if needed.
-- Read-only checks only; no DML/DDL side effects.

-- ============================================================
-- A) Core objects exist
-- ============================================================
select
  to_regclass('public.integration_sync_state') as integration_sync_state_table,
  to_regprocedure('public.upsert_all_service_data_from_booking_source(text,date,text,text,text,text,date,text,text,timestamp with time zone,text)')
    as upsert_function_signature;

-- ============================================================
-- B) Target uniqueness/index contract for chassis
-- ============================================================
select
  c.relname as index_name,
  pg_get_indexdef(i.indexrelid) as index_def,
  i.indisunique as is_unique
from pg_index i
join pg_class c
  on c.oid = i.indexrelid
join pg_class t
  on t.oid = i.indrelid
join pg_namespace n
  on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'all_service_data'
  and (
    c.relname = 'idx_all_service_data_chassis_no_norm'
    or c.relname = 'idx_all_service_data_new_chassis_number_unique'
  )
order by c.relname;

-- ============================================================
-- C) Function security and non-null guard presence
-- ============================================================
with fn as (
  select
    p.oid,
    p.prosecdef,
    pg_get_functiondef(p.oid) as function_def
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'upsert_all_service_data_from_booking_source'
)
select
  prosecdef as is_security_definer,
  (function_def ilike '%skipped_missing_core_fields%') as has_hard_core_field_gate,
  (function_def ilike '%or p_source_updated_at is null%') as requires_source_timestamp,
  (function_def ilike '%upper(nullif(btrim(t.chassis_no), '''')) = v_chassis_norm%') as has_normalized_chassis_match,
  (
    function_def ilike '%last_insurance_expiry_date,%'
    and function_def ilike '%p_last_insurance_expiry_date,%'
  ) as has_insurance_expiry_mapping,
  (function_def ilike '%sold_dealer,%''Techwheels''%') as sets_sold_dealer_on_insert,
  (function_def ilike '%updated_by_sale,%updated_by_sale_at,%') as includes_sale_audit_columns_on_insert,
  (function_def ilike '%true,%now(),%now(),%now()%') as sets_sale_audit_values_on_insert,
  (function_def ilike '%skipped_existing_chassis%') as has_existing_chassis_skip_action,
  (function_def not ilike '%update public.all_service_data t%') as is_insert_only_no_update_statement
from fn;

-- ============================================================
-- D) Integration state table columns
-- ============================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'integration_sync_state'
order by ordinal_position;

-- ============================================================
-- E) Target sale-audit columns exist
-- ============================================================
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'all_service_data'
  and column_name in ('updated_by_sale', 'updated_by_sale_at')
order by column_name;

-- ============================================================
-- F) Action values declared in function body
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
  (function_def ilike '%skipped_no_chassis%') as emits_skipped_no_chassis,
  (function_def ilike '%skipped_missing_core_fields%') as emits_skipped_missing_core_fields,
  (function_def ilike '%skipped_existing_chassis%') as emits_skipped_existing_chassis,
  (function_def ilike '%inserted%') as emits_inserted
from fn;
