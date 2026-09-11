-- BUSY Parts append-only import checks
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'replace_busy_parts_source'
) AS replace_busy_parts_source_exists;

SELECT
  (p.prosrc ~* 'DELETE\s+FROM\s+public\.busy_parts') AS function_still_deletes_source_type,
  (p.prosrc ~* 'already_uploaded') AS invoice_level_skip_present,
  (p.prosrc ~* 'pg_advisory_xact_lock') AS invoice_insert_serialized,
  obj_description(p.oid, 'pg_proc') AS function_comment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_busy_parts_source';

SELECT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'busy_parts'
    AND indexname = 'idx_busy_parts_source_invoice'
) AS source_invoice_index_exists;

-- Must NOT have a row-level unique constraint on invoice_no + invoice_date
-- (one invoice legitimately has many Parts lines).
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'busy_parts'
    AND c.contype IN ('u', 'p')
    AND pg_get_constraintdef(c.oid) ~* 'invoice_no'
    AND pg_get_constraintdef(c.oid) ~* 'invoice_date'
    AND pg_get_constraintdef(c.oid) !~* 'source_row_key'
    AND pg_get_constraintdef(c.oid) !~* 'job_card'
) AS no_invoice_row_unique_constraint;

SELECT obj_description('public.busy_parts'::regclass, 'pg_class') AS table_comment;
