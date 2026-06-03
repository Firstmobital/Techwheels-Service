-- 2026-06-03
-- Purpose: Make admin bypass policy automatic for all existing and future tables.
-- Why: Avoid table-by-table RLS bypass maintenance drift.

SET lock_timeout = '30s';
SET statement_timeout = '0';

-- Ensure one stable policy shape per table that always allows active admins.
CREATE OR REPLACE FUNCTION public.ensure_admin_bypass_policy(
  target_schema text,
  target_table text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  fq_table text;
BEGIN
  IF target_schema IS NULL OR target_table IS NULL THEN
    RETURN;
  END IF;

  -- Restrict automation to app tables only.
  IF target_schema NOT IN ('public', 'storage') THEN
    RETURN;
  END IF;

  fq_table := format('%I.%I', target_schema, target_table);

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', fq_table);

  EXECUTE format(
    'DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON %s',
    fq_table
  );

  EXECUTE format(
    'CREATE POLICY admin_unrestricted_all_ops_v1 ON %s FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
    fq_table
  );
END;
$$;

-- Backfill all existing base and partitioned tables.
CREATE OR REPLACE FUNCTION public.apply_admin_bypass_policy_to_existing_tables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname IN ('public', 'storage')
  LOOP
    PERFORM public.ensure_admin_bypass_policy(t.schema_name, t.table_name);
  END LOOP;
END;
$$;

SELECT public.apply_admin_bypass_policy_to_existing_tables();

-- Auto-apply for future table DDL.
CREATE OR REPLACE FUNCTION public.apply_admin_bypass_policy_on_ddl()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cmd RECORD;
  rel_name text;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.object_type = 'table' AND cmd.schema_name IN ('public', 'storage') THEN
      SELECT c.relname INTO rel_name
      FROM pg_class c
      WHERE c.oid = cmd.objid;

      IF rel_name IS NOT NULL THEN
        PERFORM public.ensure_admin_bypass_policy(cmd.schema_name, rel_name);
      END IF;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  BEGIN
    DROP EVENT TRIGGER IF EXISTS trg_auto_admin_bypass_policy_on_ddl;
    CREATE EVENT TRIGGER trg_auto_admin_bypass_policy_on_ddl
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE')
    EXECUTE FUNCTION public.apply_admin_bypass_policy_on_ddl();
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'Skipping event trigger creation: insufficient privilege. Run SELECT public.apply_admin_bypass_policy_to_existing_tables() after future table DDL.';
  END;
END;
$$;

-- Verification: tables without the admin bypass policy should be zero rows.
-- SELECT n.nspname AS schema_name, c.relname AS table_name
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relkind IN ('r', 'p')
--   AND n.nspname IN ('public', 'storage')
--   AND NOT EXISTS (
--     SELECT 1
--     FROM pg_policies p
--     WHERE p.schemaname = n.nspname
--       AND p.tablename = c.relname
--       AND p.policyname = 'admin_unrestricted_all_ops_v1'
--   )
-- ORDER BY n.nspname, c.relname;

RESET lock_timeout;
RESET statement_timeout;
