-- SUPABASE-002 Phase 4.1 checks: zero-qty retention behavior

-- 1) Validate function definition switched to retention mode.
SELECT
  proname,
  CASE
    WHEN pg_get_functiondef(p.oid) ILIKE '%RETURN NULL%' THEN 'suppression_mode'
    ELSE 'retention_mode'
  END AS behavior_mode
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname = 'skip_zero_qty_parts_stock_rows';
-- Expected: behavior_mode = retention_mode

-- 2) Trigger should still be attached to stock snapshot table.
SELECT DISTINCT trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'service_parts_stock_snapshot_data'
  AND trigger_name = 'trg_skip_zero_qty_parts_stock_rows';
-- Expected: 1 row

-- 3) Observability snapshot: current zero-qty row count.
SELECT COUNT(*) AS zero_qty_rows
FROM public.service_parts_stock_snapshot_data
WHERE COALESCE(on_hand_quantity, 0) = 0;
-- Expected: >= 0 (informational; should be allowed to grow after retention mode)
