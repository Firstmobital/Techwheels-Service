-- BODYSHOP-QUEUE-001 follow-up
-- Align backend projection rule with updated business rule:
-- S11 done = floor_completed AND (not additional_approval_requested OR S12 done)
-- (remove dependency on S10 done)
--
-- NOTE:
-- 1) This script is safe to run multiple times.
-- 2) It rewrites the existing function definition by replacing the exact old line.
-- 3) Run manually in Supabase SQL editor.

DO $$
DECLARE
  v_fn_def text;
  v_old_line text := 'v_stage11_done := (v_floor_completed AND v_stage10_done AND (NOT v_additional_requested OR v_stage12_done));';
  v_new_line text := 'v_stage11_done := (v_floor_completed AND (NOT v_additional_requested OR v_stage12_done));';
BEGIN
  SELECT pg_get_functiondef('public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)'::regprocedure)
  INTO v_fn_def;

  IF v_fn_def IS NULL THEN
    RAISE EXCEPTION 'Projection function not found: public.recompute_bodyshop_stage_worklist_projection_for_card(integer, integer, integer, text)';
  END IF;

  IF position(v_old_line IN v_fn_def) = 0 THEN
    IF position(v_new_line IN v_fn_def) > 0 THEN
      RAISE NOTICE 'Stage11 projection rule already patched.';
      RETURN;
    END IF;

    RAISE EXCEPTION 'Expected old Stage11 rule line not found. Aborting to avoid unsafe rewrite.';
  END IF;

  v_fn_def := replace(v_fn_def, v_old_line, v_new_line);
  EXECUTE v_fn_def;

  RAISE NOTICE 'Patched Stage11 done rule in recompute_bodyshop_stage_worklist_projection_for_card.';
END $$;

-- Recompute all cards so queue/projection reflects new rule immediately.
SELECT public.recompute_bodyshop_stage_worklist_projection_for_all_cards();
