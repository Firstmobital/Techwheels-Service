-- Read-only verification checks for:
-- supabase/migrations/20260630120000_global_settings_model_options.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; final validation should be based on full-run output.

-- 1) All rows use GLOBAL dealer_code (no dealer binding).
SELECT
  dealer_code,
  COUNT(*) AS row_count
FROM public.settings_model_options
GROUP BY dealer_code
ORDER BY dealer_code;

-- 2) No duplicate active model names (case/whitespace insensitive).
SELECT
  lower(btrim(model_name)) AS model_key,
  COUNT(*) AS active_row_count
FROM public.settings_model_options
WHERE is_active = true
GROUP BY 1
HAVING COUNT(*) > 1
ORDER BY 2 DESC, 1;

-- 3) Expected constraints and global unique index exist.
SELECT
  conname,
  contype,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.settings_model_options'::regclass
ORDER BY conname;

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'settings_model_options'
  AND indexname = 'settings_model_options_model_name_global_unique';

-- 4) dealer_code default is GLOBAL.
SELECT
  column_name,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'settings_model_options'
  AND column_name = 'dealer_code';

-- 5) Normalize trigger exists.
SELECT
  tgname,
  pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.settings_model_options'::regclass
  AND NOT tgisinternal
  AND tgname = 'trg_settings_model_options_normalize_v1';

-- 6) Canonical RPC exists and is executable by authenticated role.
SELECT
  p.oid::regprocedure::text AS function_signature,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_canonical_model_names';

SELECT model_name, sort_order
FROM public.get_canonical_model_names()
ORDER BY sort_order, model_name
LIMIT 25;

-- 7) Policy count remains 5 (admin bypass + global read + 3 scoped CRUD + all_authenticated_read_active_models).
SELECT
  polname,
  polcmd,
  pg_get_expr(polqual, polrelid) AS using_expr,
  pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.settings_model_options'::regclass
ORDER BY polname;
