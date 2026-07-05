-- Verification checks for 20260705110000_add_warranty_spl_labour_source_claim_id.sql

-- 1. Columns exist
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('warranty_spl_codes_data', 'warranty_labour_data')
  and column_name = 'source_claim_id';

-- 2. Unique indexes exist
select indexname, tablename
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'warranty_spl_codes_data_source_claim_id_key',
    'warranty_labour_data_source_claim_id_key'
  );
