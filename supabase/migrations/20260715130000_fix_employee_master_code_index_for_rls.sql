-- Fix: statement timeout (PG error 57014) on service_reception_entries UPDATE/SELECT
-- as the authenticated role. Avg query time was 1319ms (max 7967ms, close to the
-- 8s statement_timeout), vs 50ms as postgres.
--
-- ROOT CAUSE
-- ----------
-- Several RLS policy functions join employee_master using wrapped expressions:
--
--   user_has_bodyshop_floor_incharge_scope_for_sa_code():
--     WHERE upper(btrim(coalesce(em.employee_code, ''))) IN (c.code_upper, ...)
--
--   user_has_service_floor_incharge_scope_for_sa_code():
--     JOIN employee_master sa
--       ON upper(btrim(coalesce(sa.employee_code, ''))) = upper(btrim(coalesce(p_sa_employee_code, '')))
--
--   user_has_technician_code():
--     AND upper(uel.employee_code) = upper(p_technician_code)
--     JOIN employee_master em ON em.employee_code = uel.employee_code
--
-- The unique CONSTRAINT on employee_master.employee_code covers the raw column.
-- The expression upper(btrim(coalesce(employee_code, ''))) is different — no index
-- matches it, forcing a full sequential scan of employee_master on every call.
-- Because these functions appear in RLS policies evaluated per-statement as
-- authenticated, every query on service_reception_entries (and other tables
-- with similar policies) pays this cost.
--
-- FIX
-- ---
-- Add a functional index matching the exact expression. The planner will use it
-- for all equality lookups on upper(btrim(coalesce(employee_code, ''))).

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_master_employee_code_upper_btrim
  ON public.employee_master (upper(btrim(coalesce(employee_code, ''))));

COMMENT ON INDEX public.idx_employee_master_employee_code_upper_btrim
  IS 'Supports RLS policy functions that look up employee_master by '
     'upper(btrim(coalesce(employee_code, ...))). Without this index those '
     'functions cause a sequential scan of employee_master on every authenticated '
     'query, adding ~1200ms overhead (avg) and causing statement_timeout at 8s.';
