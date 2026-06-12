-- SUPABASE-002 Phase 5.2: drift-closure checks (read-only)
-- Produces authoritative-signature style snapshots from live DB for comparison.

-- 1) Core object existence snapshot
SELECT
  obj_type,
  obj_name,
  CASE WHEN obj_oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM (
  SELECT 'table'::text AS obj_type, 'public.bodyshop_assignments'::text AS obj_name, to_regclass('public.bodyshop_assignments')::oid AS obj_oid
  UNION ALL SELECT 'table', 'public.bodyshop_repair_cards', to_regclass('public.bodyshop_repair_cards')::oid
  UNION ALL SELECT 'table', 'public.service_reception_entries', to_regclass('public.service_reception_entries')::oid
  UNION ALL SELECT 'table', 'public.job_card_closed_data', to_regclass('public.job_card_closed_data')::oid
  UNION ALL SELECT 'function', 'public.apply_sa_business_mapping_on_reception', p.oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_sa_business_mapping_on_reception'
  UNION ALL SELECT 'function', 'public.update_bodyshop_assignments_updated_at', p.oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_bodyshop_assignments_updated_at'
) s
ORDER BY obj_type, obj_name;

-- 2) Column signature snapshot for bodyshop and semantic tables
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('bodyshop_assignments', 'bodyshop_repair_cards', 'service_reception_entries', 'job_card_closed_data')
ORDER BY table_name, ordinal_position;

-- 3) RLS status snapshot for key tables
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bodyshop_assignments', 'bodyshop_repair_cards', 'service_reception_entries', 'job_card_closed_data')
ORDER BY c.relname;

-- 4) Policy definition snapshot for key tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('bodyshop_assignments', 'bodyshop_repair_cards', 'service_reception_entries')
ORDER BY tablename, policyname;

-- 5) Trigger signature snapshot for key tables
SELECT
  t.tgname AS trigger_name,
  t.tgrelid::regclass::text AS table_name,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid, true) AS trigger_def
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND t.tgrelid::regclass::text IN ('public.service_reception_entries', 'public.bodyshop_assignments')
ORDER BY t.tgrelid::regclass::text, t.tgname;

-- 6) Function-body hash snapshot for stable drift comparison
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  md5(pg_get_functiondef(p.oid)) AS function_def_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('apply_sa_business_mapping_on_reception', 'update_bodyshop_assignments_updated_at')
ORDER BY p.proname;

-- 7) Constraint and index snapshot for semantic compatibility
SELECT
  c.conname AS constraint_name,
  c.conrelid::regclass::text AS table_name,
  pg_get_constraintdef(c.oid, true) AS constraint_def
FROM pg_constraint c
WHERE c.conname IN (
  'service_reception_entries_portal_check',
  'bodyshop_repair_cards_portal_check',
  'job_card_closed_data_portal_check'
)
ORDER BY c.conname;

SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_sre_location_portal', 'idx_brc_location_portal', 'idx_jccd_location_portal')
ORDER BY indexname;

-- 8) Grant surface snapshot for bodyshop objects
SELECT
  object_kind,
  object_name,
  grantee,
  privilege_type
FROM (
  SELECT
    'table'::text AS object_kind,
    g.table_name AS object_name,
    g.grantee,
    g.privilege_type
  FROM information_schema.role_table_grants g
  WHERE g.table_schema = 'public'
    AND g.table_name IN ('bodyshop_assignments', 'bodyshop_repair_cards')

  UNION ALL

  SELECT
    'sequence'::text AS object_kind,
    g.object_name AS object_name,
    g.grantee,
    g.privilege_type
  FROM information_schema.role_usage_grants g
  WHERE g.object_schema = 'public'
    AND g.object_type = 'SEQUENCE'
    AND g.object_name IN ('bodyshop_assignments_id_seq', 'bodyshop_repair_cards_id_seq')
) s
ORDER BY object_kind, object_name, grantee, privilege_type;
