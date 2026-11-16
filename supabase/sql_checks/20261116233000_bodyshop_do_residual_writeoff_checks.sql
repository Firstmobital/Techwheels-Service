-- Read-only checks for 20261116233000_bodyshop_do_residual_writeoff.sql
-- Execution: This file can be run in one go.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: true
SELECT to_regprocedure('public.write_off_bodyshop_do_residual(integer,text)') IS NOT NULL AS rpc_exists_should_be_true;

-- Expect: false / true / true
SELECT has_function_privilege('anon', p.oid, 'execute') AS anon_should_be_false,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_should_be_true,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'write_off_bodyshop_do_residual';

-- Expect: true / true (recalc subtracts waivers; reverse accepts waiver lines)
SELECT (SELECT pg_get_functiondef(p.oid) LIKE '%v_waived%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'recalc_bodyshop_settlement') AS recalc_has_waiver_should_be_true,
       (SELECT pg_get_functiondef(p.oid) LIKE '%''do_component'', ''waiver''%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'reverse_bodyshop_settlement_line') AS reverse_has_waiver_should_be_true;

-- Expect: recalc ACL unchanged (CREATE OR REPLACE keeps grants): anon/authenticated/service_role as before
SELECT has_function_privilege('anon', p.oid, 'execute') AS anon, has_function_privilege('authenticated', p.oid, 'execute') AS authenticated,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'recalc_bodyshop_settlement';

-- Expect: 0 rows. Settlements whose stored due disagrees with do_amount - cash - waivers (run after a write-off UAT).
SELECT s.repair_card_id, s.do_amount, s.do_released_amount, s.insurance_due_amount
FROM public.bodyshop_settlements s
WHERE s.do_amount IS NOT NULL
  AND s.insurance_due_amount IS DISTINCT FROM GREATEST(round(s.do_amount - s.do_released_amount - COALESCE((
        SELECT sum(l.amount) FROM public.bodyshop_settlement_lines l
         WHERE l.settlement_id = s.id AND l.is_reversed = false AND l.party = 'insurance'
           AND l.line_type = 'waiver' AND l.component = 'WAIVER'), 0), 2), 0)
LIMIT 20;

-- Informational: existing small MAIN-only residuals (candidates for Admin review; not changed by the migration)
SELECT l.repair_card_id, l.amount, l.actor_email, l.created_at
FROM public.bodyshop_settlement_lines l
WHERE l.party = 'insurance' AND l.component = 'MAIN' AND l.line_type = 'do_component'
  AND l.is_reversed = false AND l.amount < 10 AND l.reference IS NULL AND l.remarks IS NULL
ORDER BY l.created_at DESC LIMIT 20;
